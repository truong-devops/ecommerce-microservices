package events

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"sync"
	"time"

	"wallet-service/internal/config"
	"wallet-service/internal/domain"
	"wallet-service/internal/httpx"

	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

type walletEventHandler interface {
	HandlePaymentCaptured(ctx context.Context, event domain.PaymentCapturedEvent, meta domain.EventMeta) (bool, error)
	HandlePaymentReversed(ctx context.Context, event domain.PaymentReversedEvent, meta domain.EventMeta) (bool, error)
	HandleOrderDelivered(ctx context.Context, event domain.OrderDeliveredEvent, meta domain.EventMeta) (bool, error)
}

type Consumer struct {
	enabled       bool
	paymentTopic  string
	orderTopic    string
	paymentReader *kafka.Reader
	orderReader   *kafka.Reader
	handler       walletEventHandler
	logger        *zap.Logger
}

type envelope struct {
	EventID    string         `json:"eventId"`
	EventType  string         `json:"eventType"`
	Payload    map[string]any `json:"payload"`
	OccurredAt string         `json:"occurredAt"`
}

func NewConsumer(cfg config.Config, logger *zap.Logger, handler walletEventHandler) *Consumer {
	consumer := &Consumer{
		enabled: cfg.KafkaEnabled, paymentTopic: cfg.PaymentEventsTopic,
		orderTopic: cfg.OrderEventsTopic, handler: handler, logger: logger,
	}
	if !cfg.KafkaEnabled {
		return consumer
	}
	startOffset := kafka.FirstOffset
	if cfg.KafkaStartOffset == "last" {
		startOffset = kafka.LastOffset
	}
	consumer.paymentReader = kafka.NewReader(kafka.ReaderConfig{
		Brokers: cfg.KafkaBrokers, Topic: cfg.PaymentEventsTopic,
		GroupID: cfg.PaymentConsumerGroup, StartOffset: startOffset,
		MinBytes: 1, MaxBytes: 10e6, MaxWait: 500 * time.Millisecond,
	})
	consumer.orderReader = kafka.NewReader(kafka.ReaderConfig{
		Brokers: cfg.KafkaBrokers, Topic: cfg.OrderEventsTopic,
		GroupID: cfg.OrderConsumerGroup, StartOffset: startOffset,
		MinBytes: 1, MaxBytes: 10e6, MaxWait: 500 * time.Millisecond,
	})
	return consumer
}

func (c *Consumer) Run(ctx context.Context) {
	if !c.enabled || c.paymentReader == nil || c.orderReader == nil {
		c.logger.Warn("wallet event consumers disabled")
		return
	}
	var waitGroup sync.WaitGroup
	waitGroup.Add(2)
	go func() {
		defer waitGroup.Done()
		c.readMessages(ctx, c.paymentReader, c.handlePaymentMessage)
	}()
	go func() {
		defer waitGroup.Done()
		c.readMessages(ctx, c.orderReader, c.handleOrderMessage)
	}()
	waitGroup.Wait()
}

func (c *Consumer) Close() {
	if c.paymentReader != nil {
		_ = c.paymentReader.Close()
	}
	if c.orderReader != nil {
		_ = c.orderReader.Close()
	}
}

func (c *Consumer) readMessages(ctx context.Context, reader *kafka.Reader, handle func(context.Context, kafka.Message) error) {
	for {
		message, err := reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			c.logger.Error("fetch wallet event failed", zap.Error(err))
			continue
		}
		for {
			if err := handle(ctx, message); err == nil {
				if commitErr := reader.CommitMessages(ctx, message); commitErr != nil && ctx.Err() == nil {
					c.logger.Error("commit wallet event failed", zap.Error(commitErr))
				}
				break
			} else {
				c.logger.Error("process wallet event failed; retrying", zap.String("topic", message.Topic), zap.Int64("offset", message.Offset), zap.Error(err))
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Second):
			}
		}
	}
}

func (c *Consumer) handlePaymentMessage(ctx context.Context, message kafka.Message) error {
	envelope, err := decodeEnvelope(message.Value)
	if err != nil {
		c.logger.Warn("skip invalid payment event envelope", zap.Error(err))
		return nil
	}
	meta := buildEventMeta(envelope, message)
	switch envelope.EventType {
	case "payment.captured":
		event, err := parsePaymentCaptured(envelope.Payload)
		if err != nil {
			c.logger.Warn("skip invalid payment.captured", zap.Error(err))
			return nil
		}
		_, err = c.handler.HandlePaymentCaptured(ctx, event, meta)
		return suppressInvalidEvent(err, c.logger, envelope.EventType)
	case "payment.partially-refunded", "payment.refunded", "payment.chargeback":
		event, err := parsePaymentReversed(envelope.EventType, envelope.Payload)
		if err != nil {
			c.logger.Warn("skip invalid payment reversal", zap.String("event_type", envelope.EventType), zap.Error(err))
			return nil
		}
		_, err = c.handler.HandlePaymentReversed(ctx, event, meta)
		return suppressInvalidEvent(err, c.logger, envelope.EventType)
	default:
		return nil
	}
}

func (c *Consumer) handleOrderMessage(ctx context.Context, message kafka.Message) error {
	envelope, err := decodeEnvelope(message.Value)
	if err != nil {
		c.logger.Warn("skip invalid order event envelope", zap.Error(err))
		return nil
	}
	if envelope.EventType != "order.delivered" {
		return nil
	}
	event, err := parseOrderDelivered(envelope.Payload, parseEventTime(envelope, time.Time{}))
	if err != nil {
		c.logger.Warn("skip invalid order.delivered", zap.Error(err))
		return nil
	}
	_, err = c.handler.HandleOrderDelivered(ctx, event, buildEventMeta(envelope, message))
	return suppressInvalidEvent(err, c.logger, envelope.EventType)
}

func decodeEnvelope(value []byte) (envelope, error) {
	var result envelope
	if err := json.Unmarshal(value, &result); err != nil {
		return envelope{}, err
	}
	result.EventID = strings.TrimSpace(result.EventID)
	result.EventType = strings.TrimSpace(result.EventType)
	if result.EventType == "" {
		return envelope{}, fmt.Errorf("eventType is required")
	}
	if result.Payload == nil {
		result.Payload = map[string]any{}
	}
	return result, nil
}

func parsePaymentCaptured(payload map[string]any) (domain.PaymentCapturedEvent, error) {
	amount, ok := asNumber(payload["amount"])
	if !ok {
		return domain.PaymentCapturedEvent{}, fmt.Errorf("amount is required")
	}
	return domain.PaymentCapturedEvent{
		PaymentID: asString(payload["paymentId"]), OrderID: asString(payload["orderId"]),
		SellerID: asString(payload["sellerId"]), Amount: amount,
		Currency: strings.ToUpper(asString(payload["currency"])),
	}, nil
}

func parsePaymentReversed(eventType string, payload map[string]any) (domain.PaymentReversedEvent, error) {
	amount, _ := asNumber(payload["amount"])
	refundedAmount, _ := asNumber(payload["refundedAmount"])
	if refundedAmount <= 0 && eventType != "payment.chargeback" {
		return domain.PaymentReversedEvent{}, fmt.Errorf("refundedAmount must be positive")
	}
	if eventType == "payment.chargeback" && refundedAmount <= 0 && amount <= 0 {
		return domain.PaymentReversedEvent{}, fmt.Errorf("chargeback amount must be positive")
	}
	return domain.PaymentReversedEvent{
		PaymentID: asString(payload["paymentId"]), OrderID: asString(payload["orderId"]),
		CustomerID: asString(payload["userId"]),
		SellerID:   asString(payload["sellerId"]), Amount: amount, RefundedAmount: refundedAmount,
		Currency: strings.ToUpper(asString(payload["currency"])), IsChargeback: eventType == "payment.chargeback",
	}, nil
}

func parseOrderDelivered(payload map[string]any, deliveredAt time.Time) (domain.OrderDeliveredEvent, error) {
	orderID := asString(payload["orderId"])
	sellerID := asString(payload["sellerId"])
	if orderID == "" || sellerID == "" {
		return domain.OrderDeliveredEvent{}, fmt.Errorf("orderId and sellerId are required")
	}
	return domain.OrderDeliveredEvent{OrderID: orderID, SellerID: sellerID, DeliveredAt: deliveredAt}, nil
}

func buildEventMeta(envelope envelope, message kafka.Message) domain.EventMeta {
	requestID := ""
	if metadata, ok := envelope.Payload["metadata"].(map[string]any); ok {
		requestID = asString(metadata["requestId"])
	}
	topic := strings.TrimSpace(message.Topic)
	return domain.EventMeta{
		EventID: envelope.EventID, EventType: envelope.EventType, RequestID: requestID,
		Topic: topic, Partition: message.Partition, OffsetValue: message.Offset,
		OccurredAt: parseEventTime(envelope, time.Time{}),
	}
}

func parseEventTime(envelope envelope, fallback time.Time) time.Time {
	if metadata, ok := envelope.Payload["metadata"].(map[string]any); ok {
		if value, err := time.Parse(time.RFC3339Nano, asString(metadata["occurredAt"])); err == nil {
			return value.UTC()
		}
	}
	if value, err := time.Parse(time.RFC3339Nano, strings.TrimSpace(envelope.OccurredAt)); err == nil {
		return value.UTC()
	}
	return fallback
}

func suppressInvalidEvent(err error, logger *zap.Logger, eventType string) error {
	if err == nil {
		return nil
	}
	var appErr *httpx.AppError
	if errors.As(err, &appErr) && (appErr.Code == domain.ErrorCodeInvalidEvent || appErr.Code == domain.ErrorCodeValidationFailed) {
		logger.Warn("skip invalid wallet event", zap.String("event_type", eventType), zap.Error(err))
		return nil
	}
	return err
}

func asString(value any) string {
	result, _ := value.(string)
	return strings.TrimSpace(result)
}

func asNumber(value any) (float64, bool) {
	switch number := value.(type) {
	case float64:
		return number, !math.IsNaN(number) && !math.IsInf(number, 0)
	case float32:
		return float64(number), true
	case int:
		return float64(number), true
	case int64:
		return float64(number), true
	case json.Number:
		result, err := number.Float64()
		return result, err == nil
	default:
		return 0, false
	}
}
