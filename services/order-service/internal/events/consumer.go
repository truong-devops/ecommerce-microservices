package events

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"order-service/internal/config"
	"order-service/internal/service"

	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

type SagaConsumer struct {
	enabled bool
	topic   string
	reader  *kafka.Reader
	logger  *zap.Logger
	svc     sagaService
}

type sagaService interface {
	HandleInventoryReserved(ctx context.Context, event service.InventoryReservedEvent, meta service.SagaEventMeta) error
	HandleInventoryReservationFailed(ctx context.Context, event service.InventoryFailureEvent, meta service.SagaEventMeta) error
	HandleInventoryExpired(ctx context.Context, event service.InventoryFailureEvent, meta service.SagaEventMeta) error
	HandlePaymentCaptured(ctx context.Context, event service.PaymentEvent, meta service.SagaEventMeta) error
	HandlePaymentFailed(ctx context.Context, event service.PaymentEvent, meta service.SagaEventMeta) error
	HandleShipmentStatusUpdated(ctx context.Context, event service.ShipmentEvent, meta service.SagaEventMeta) error
}

func NewInventorySagaConsumer(cfg config.Config, logger *zap.Logger, svc *service.OrderSagaService) *SagaConsumer {
	return newSagaConsumer(cfg.KafkaEnabled, cfg.KafkaBrokers, cfg.InventoryEventsTopic, cfg.InventoryEventsConsumerGroup, logger, svc)
}

func NewPaymentSagaConsumer(cfg config.Config, logger *zap.Logger, svc *service.OrderSagaService) *SagaConsumer {
	return newSagaConsumer(cfg.KafkaEnabled, cfg.KafkaBrokers, cfg.PaymentEventsTopic, cfg.PaymentEventsConsumerGroup, logger, svc)
}

func NewShippingEventsConsumer(cfg config.Config, logger *zap.Logger, svc *service.OrderSagaService) *SagaConsumer {
	return newSagaConsumer(cfg.KafkaEnabled, cfg.KafkaBrokers, cfg.ShippingEventsTopic, cfg.ShippingEventsConsumerGroup, logger, svc)
}

func newSagaConsumer(enabled bool, brokers []string, topic string, groupID string, logger *zap.Logger, svc sagaService) *SagaConsumer {
	c := &SagaConsumer{enabled: enabled, topic: topic, logger: logger, svc: svc}
	if !enabled {
		return c
	}
	c.reader = kafka.NewReader(kafka.ReaderConfig{
		Brokers:     brokers,
		Topic:       topic,
		GroupID:     groupID,
		StartOffset: kafka.LastOffset,
		MinBytes:    1,
		MaxBytes:    10e6,
		MaxWait:     500 * time.Millisecond,
	})
	return c
}

func (c *SagaConsumer) Run(ctx context.Context) {
	if !c.enabled || c.reader == nil {
		return
	}
	for {
		msg, err := c.reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			c.logger.Error("failed to fetch saga event", zap.String("topic", c.topic), zap.Error(err))
			continue
		}
		if err := c.handleMessage(ctx, msg); err != nil {
			c.logger.Error("failed to process saga event", zap.String("topic", c.topic), zap.Int("partition", msg.Partition), zap.Int64("offset", msg.Offset), zap.Error(err))
			continue
		}
		if err := c.reader.CommitMessages(ctx, msg); err != nil {
			c.logger.Error("failed to commit saga event", zap.String("topic", c.topic), zap.Int("partition", msg.Partition), zap.Int64("offset", msg.Offset), zap.Error(err))
		}
	}
}

func (c *SagaConsumer) Close() {
	if c.reader != nil {
		_ = c.reader.Close()
	}
}

func (c *SagaConsumer) handleMessage(ctx context.Context, msg kafka.Message) error {
	env, err := decodeSagaEnvelope(msg.Value)
	if err != nil {
		c.logger.Warn("skip invalid saga event payload", zap.String("topic", c.topic), zap.Error(err))
		return nil
	}
	meta := buildSagaEventMeta(env, msg, c.topic)

	switch env.EventType {
	case service.EventInventoryReserved:
		orderID := asString(env.Payload["orderId"])
		c.logger.Info("checkout saga inventory event received",
			zap.String("requestId", meta.RequestID),
			zap.String("eventId", meta.EventID),
			zap.String("eventType", meta.EventType),
			zap.String("orderId", orderID),
			zap.String("topic", meta.Topic),
			zap.Int("partition", meta.Partition),
			zap.Int64("offset", meta.OffsetValue),
		)
		return c.svc.HandleInventoryReserved(ctx, service.InventoryReservedEvent{OrderID: orderID}, meta)
	case service.EventInventoryReservationFailed:
		event := service.InventoryFailureEvent{
			OrderID: asString(env.Payload["orderId"]),
			Reason:  asString(env.Payload["reason"]),
			Message: asString(env.Payload["message"]),
		}
		c.logger.Info("checkout saga inventory event received",
			zap.String("requestId", meta.RequestID),
			zap.String("eventId", meta.EventID),
			zap.String("eventType", meta.EventType),
			zap.String("orderId", event.OrderID),
			zap.String("topic", meta.Topic),
			zap.Int("partition", meta.Partition),
			zap.Int64("offset", meta.OffsetValue),
		)
		return c.svc.HandleInventoryReservationFailed(ctx, event, meta)
	case service.EventInventoryExpired:
		event := service.InventoryFailureEvent{
			OrderID: asString(env.Payload["orderId"]),
			Reason:  "INVENTORY_RESERVATION_EXPIRED",
			Message: asString(env.Payload["reason"]),
		}
		c.logger.Info("checkout saga inventory event received",
			zap.String("requestId", meta.RequestID),
			zap.String("eventId", meta.EventID),
			zap.String("eventType", meta.EventType),
			zap.String("orderId", event.OrderID),
			zap.String("topic", meta.Topic),
			zap.Int("partition", meta.Partition),
			zap.Int64("offset", meta.OffsetValue),
		)
		return c.svc.HandleInventoryExpired(ctx, event, meta)
	case service.EventPaymentCaptured:
		event := parsePaymentEvent(env.Payload)
		c.logger.Info("checkout saga payment event received",
			zap.String("requestId", meta.RequestID),
			zap.String("eventId", meta.EventID),
			zap.String("eventType", meta.EventType),
			zap.String("orderId", event.OrderID),
			zap.String("paymentId", event.PaymentID),
			zap.String("topic", meta.Topic),
			zap.Int("partition", meta.Partition),
			zap.Int64("offset", meta.OffsetValue),
		)
		return c.svc.HandlePaymentCaptured(ctx, event, meta)
	case service.EventPaymentFailed:
		event := parsePaymentEvent(env.Payload)
		c.logger.Info("checkout saga payment event received",
			zap.String("requestId", meta.RequestID),
			zap.String("eventId", meta.EventID),
			zap.String("eventType", meta.EventType),
			zap.String("orderId", event.OrderID),
			zap.String("paymentId", event.PaymentID),
			zap.String("topic", meta.Topic),
			zap.Int("partition", meta.Partition),
			zap.Int64("offset", meta.OffsetValue),
		)
		return c.svc.HandlePaymentFailed(ctx, event, meta)
	case service.EventShipmentStatusUpdated, service.EventShipmentDelivered:
		event := service.ShipmentEvent{
			OrderID:        asString(env.Payload["orderId"]),
			ShipmentID:     asString(env.Payload["shipmentId"]),
			Status:         asString(env.Payload["status"]),
			AWB:            asString(env.Payload["awb"]),
			TrackingNumber: asString(env.Payload["trackingNumber"]),
		}
		c.logger.Info("shipment status event received",
			zap.String("requestId", meta.RequestID),
			zap.String("eventId", meta.EventID),
			zap.String("eventType", meta.EventType),
			zap.String("orderId", event.OrderID),
			zap.String("shipmentStatus", event.Status),
			zap.String("topic", meta.Topic),
			zap.Int("partition", meta.Partition),
			zap.Int64("offset", meta.OffsetValue),
		)
		return c.svc.HandleShipmentStatusUpdated(ctx, event, meta)
	default:
		return nil
	}
}

type sagaEnvelope struct {
	EventID   string         `json:"eventId"`
	EventType string         `json:"eventType"`
	Payload   map[string]any `json:"payload"`
}

func decodeSagaEnvelope(value []byte) (sagaEnvelope, error) {
	var env sagaEnvelope
	if err := json.Unmarshal(value, &env); err != nil {
		return sagaEnvelope{}, err
	}
	env.EventType = strings.TrimSpace(env.EventType)
	env.EventID = strings.TrimSpace(env.EventID)
	if env.Payload == nil {
		env.Payload = map[string]any{}
	}
	return env, nil
}

func buildSagaEventMeta(env sagaEnvelope, msg kafka.Message, fallbackTopic string) service.SagaEventMeta {
	topic := msg.Topic
	if strings.TrimSpace(topic) == "" {
		topic = fallbackTopic
	}
	meta := service.SagaEventMeta{
		EventID:     env.EventID,
		EventType:   env.EventType,
		Topic:       topic,
		Partition:   msg.Partition,
		OffsetValue: msg.Offset,
		RequestID:   fmt.Sprintf("kafka-%d-%d", msg.Partition, msg.Offset),
	}
	if payloadMeta, ok := env.Payload["metadata"].(map[string]any); ok {
		if requestID := asString(payloadMeta["requestId"]); requestID != "" {
			meta.RequestID = requestID
		}
	}
	return meta
}

func parsePaymentEvent(payload map[string]any) service.PaymentEvent {
	return service.PaymentEvent{
		OrderID:   asString(payload["orderId"]),
		PaymentID: asString(payload["paymentId"]),
		Status:    asString(payload["status"]),
	}
}

func asString(value any) string {
	s, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(s)
}
