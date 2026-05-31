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

type OrderEventsConsumer struct {
	enabled bool
	topic   string
	reader  *kafka.Reader
	logger  *zap.Logger
	service *PaymentService
}

func NewOrderEventsConsumer(cfg config.Config, logger *zap.Logger, service *PaymentService) *OrderEventsConsumer {
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

		if err := c.handleMessage(ctx, msg); err != nil {
			c.logger.Error("failed to process order event", zap.Error(err), zap.Int("partition", msg.Partition), zap.Int64("offset", msg.Offset))
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

	if strings.TrimSpace(envelope.EventType) != "order.created" {
		return nil
	}

	payload := envelope.Payload
	orderID := asString(payload["orderId"])
	userID := asString(payload["userId"])
	orderNumber := asStringPtr(payload["orderNumber"])
	paymentMethod := strings.ToUpper(asString(payload["paymentMethod"]))
	currency := strings.ToUpper(asString(payload["currency"]))
	totalAmount, ok := asNumber(payload["totalAmount"])
	if !ok {
		return nil
	}
	if totalAmount < 0 {
		return nil
	}

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
	c.logger.Info("checkout saga order event received",
		zap.String("requestId", requestID),
		zap.String("eventId", strings.TrimSpace(envelope.EventID)),
		zap.String("eventType", strings.TrimSpace(envelope.EventType)),
		zap.String("orderId", orderID),
		zap.String("topic", topic),
		zap.Int("partition", msg.Partition),
		zap.Int64("offset", msg.Offset),
	)
	return c.service.HandleOrderCreatedEvent(ctx, orderID, userID, totalAmount, currency, orderNumber, paymentMethod, requestID, strings.TrimSpace(envelope.EventID), topic, msg.Partition, msg.Offset)
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
