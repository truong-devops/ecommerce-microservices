package service

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"go.uber.org/zap"

	"payment-service-go/internal/config"

	"github.com/segmentio/kafka-go"
)

type KafkaEnvelope struct {
	EventID   string         `json:"eventId"`
	EventType string         `json:"eventType"`
	Payload   map[string]any `json:"payload"`
}

type orderEventHandler interface {
	HandleOrderCreatedEvent(context.Context, string, string, string, float64, string, *string, string, string, string, string, int, int64) error
	HandleOrderCancelledEvent(context.Context, string, string, string, string, int, int64) error
	HandleOrderReturnRefundApprovedEvent(context.Context, OrderReturnRefundApprovedEvent, string, string, string, int, int64) error
}

type OrderEventsConsumer struct {
	enabled bool
	topic   string
	reader  *kafka.Reader
	logger  *zap.Logger
	service orderEventHandler
}

func NewOrderEventsConsumer(cfg config.Config, logger *zap.Logger, service orderEventHandler) *OrderEventsConsumer {
	if !cfg.KafkaEnabled || len(cfg.KafkaBrokers) == 0 {
		return &OrderEventsConsumer{enabled: false, topic: cfg.OrderEventsTopic, logger: logger, service: service}
	}

	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:     cfg.KafkaBrokers,
		Topic:       cfg.OrderEventsTopic,
		GroupID:     cfg.OrderEventsConsumerGroup,
		StartOffset: kafka.LastOffset,
		MinBytes:    1,
		MaxBytes:    10e6,
		MaxWait:     500 * time.Millisecond,
	})

	return &OrderEventsConsumer{
		enabled: true,
		topic:   cfg.OrderEventsTopic,
		reader:  reader,
		logger:  logger,
		service: service,
	}
}

func (c *OrderEventsConsumer) Run(ctx context.Context) {
	if !c.enabled || c.reader == nil {
		c.logger.Warn("order events consumer disabled", zap.String("topic", c.topic))
		return
	}
	c.logger.Info("order events consumer started", zap.String("topic", c.topic))
	for {
		msg, err := c.reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			c.logger.Error("failed to fetch order event", zap.Error(err))
			continue
		}

		for {
			if err := c.handleMessage(ctx, msg); err == nil {
				break
			} else {
				c.logger.Error("failed to process order event; retrying", zap.Error(err), zap.Int("partition", msg.Partition), zap.Int64("offset", msg.Offset))
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Second):
			}
		}

		if err := c.reader.CommitMessages(ctx, msg); err != nil {
			c.logger.Error("failed to commit order event", zap.Error(err), zap.Int("partition", msg.Partition), zap.Int64("offset", msg.Offset))
		}
	}
}

func (c *OrderEventsConsumer) Close() {
	if c.reader != nil {
		_ = c.reader.Close()
	}
}

func (c *OrderEventsConsumer) handleMessage(ctx context.Context, msg kafka.Message) error {
	if len(msg.Value) == 0 {
		return nil
	}

	var envelope KafkaEnvelope
	if err := json.Unmarshal(msg.Value, &envelope); err != nil {
		c.logger.Warn("skip invalid order event payload", zap.String("raw", string(msg.Value)))
		return nil
	}

	eventType := strings.TrimSpace(envelope.EventType)
	if eventType != "order.created" && eventType != "order.cancelled" && eventType != "order.return-refund-approved" {
		return nil
	}

	payload := envelope.Payload
	orderID := asString(payload["orderId"])
	requestID := ""
	if metadata, ok := payload["metadata"].(map[string]any); ok {
		requestID = asString(metadata["requestId"])
	}
	if requestID == "" {
		requestID = "kafka"
	}

	topic := msg.Topic
	if strings.TrimSpace(topic) == "" {
		topic = c.topic
	}
	c.logger.Info("payment order event received",
		zap.String("requestId", requestID),
		zap.String("eventId", strings.TrimSpace(envelope.EventID)),
		zap.String("eventType", eventType),
		zap.String("orderId", orderID),
		zap.String("topic", topic),
		zap.Int("partition", msg.Partition),
		zap.Int64("offset", msg.Offset),
	)
	if eventType == "order.cancelled" {
		return c.service.HandleOrderCancelledEvent(ctx, orderID, requestID, strings.TrimSpace(envelope.EventID), topic, msg.Partition, msg.Offset)
	}
	if eventType == "order.return-refund-approved" {
		refundAmount, ok := asNumber(payload["refundAmount"])
		if !ok {
			c.logger.Warn("skip invalid return refund event amount",
				zap.String("eventId", strings.TrimSpace(envelope.EventID)),
				zap.String("orderId", orderID),
			)
			return nil
		}
		event := OrderReturnRefundApprovedEvent{
			ReturnRequestID: asString(payload["returnRequestId"]),
			OrderID:         orderID,
			CustomerID:      asString(payload["customerId"]),
			SellerID:        asString(payload["sellerId"]),
			RefundAmount:    refundAmount,
			Currency:        strings.ToUpper(asString(payload["currency"])),
		}
		if event.ReturnRequestID == "" || event.OrderID == "" || event.CustomerID == "" ||
			event.SellerID == "" || event.RefundAmount <= 0 || event.Currency == "" {
			c.logger.Warn("skip incomplete return refund event",
				zap.String("eventId", strings.TrimSpace(envelope.EventID)),
				zap.String("orderId", orderID),
				zap.String("returnRequestId", event.ReturnRequestID),
			)
			return nil
		}
		return c.service.HandleOrderReturnRefundApprovedEvent(ctx, event, requestID, strings.TrimSpace(envelope.EventID), topic, msg.Partition, msg.Offset)
	}

	userID := asString(payload["userId"])
	sellerID := asString(payload["sellerId"])
	orderNumber := asStringPtr(payload["orderNumber"])
	paymentMethod := strings.ToUpper(asString(payload["paymentMethod"]))
	currency := strings.ToUpper(asString(payload["currency"]))
	totalAmount, ok := asNumber(payload["totalAmount"])
	if !ok || totalAmount < 0 {
		return nil
	}
	return c.service.HandleOrderCreatedEvent(ctx, orderID, userID, sellerID, totalAmount, currency, orderNumber, paymentMethod, requestID, strings.TrimSpace(envelope.EventID), topic, msg.Partition, msg.Offset)
}

func asString(v any) string {
	s, ok := v.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(s)
}

func asStringPtr(v any) *string {
	s := asString(v)
	if s == "" {
		return nil
	}
	return &s
}

func asNumber(v any) (float64, bool) {
	switch vv := v.(type) {
	case float64:
		return vv, true
	case float32:
		return float64(vv), true
	case int:
		return float64(vv), true
	case int32:
		return float64(vv), true
	case int64:
		return float64(vv), true
	default:
		return 0, false
	}
}
