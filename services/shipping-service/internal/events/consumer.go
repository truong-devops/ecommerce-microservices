package events

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"shipping-service/internal/config"
	"shipping-service/internal/service"

	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

type OrderEventsConsumer struct {
	enabled bool
	topic   string
	reader  *kafka.Reader
	service *service.ShippingService
	logger  *zap.Logger
}

type orderEventEnvelope struct {
	EventType string         `json:"eventType"`
	Payload   map[string]any `json:"payload"`
}

func NewOrderEventsConsumerWithService(cfg config.Config, shippingService *service.ShippingService, logger *zap.Logger) *OrderEventsConsumer {
	if !cfg.KafkaEnabled || len(cfg.KafkaBrokers) == 0 {
		return &OrderEventsConsumer{enabled: false, topic: cfg.OrderEventsTopic, service: shippingService, logger: logger}
	}

	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:     cfg.KafkaBrokers,
		Topic:       cfg.OrderEventsTopic,
		GroupID:     cfg.OrderEventsConsumerGroup,
		StartOffset: kafka.LastOffset,
		MinBytes:    1,
		MaxBytes:    10e6,
	})

	return &OrderEventsConsumer{enabled: true, topic: cfg.OrderEventsTopic, reader: reader, service: shippingService, logger: logger}
}

func (c *OrderEventsConsumer) Run(ctx context.Context) {
	if !c.enabled || c.reader == nil {
		if c.logger != nil {
			c.logger.Warn("order events consumer disabled", zap.String("topic", c.topic))
		}
		return
	}
	defer c.reader.Close()

	c.logger.Info("order events consumer started", zap.String("topic", c.topic))
	for {
		msg, err := c.reader.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			c.logger.Error("order events read failed", zap.Error(err))
			continue
		}

		if len(msg.Value) == 0 {
			continue
		}

		var envelope orderEventEnvelope
		if err := json.Unmarshal(msg.Value, &envelope); err != nil {
			c.logger.Warn("skip invalid order event payload", zap.Error(err))
			continue
		}

		eventType := strings.TrimSpace(envelope.EventType)
		if eventType == "" {
			eventType = strings.TrimSpace(string(msg.Key))
		}
		if eventType != "order.status-updated" || !strings.EqualFold(strings.TrimSpace(fmt.Sprint(envelope.Payload["status"])), "CONFIRMED") {
			continue
		}

		payload := envelope.Payload
		if payload == nil {
			payload = map[string]any{}
		}

		metadata, _ := payload["metadata"].(map[string]any)
		requestID := fmt.Sprintf("kafka-%d-%d", msg.Partition, msg.Offset)
		if metadata != nil {
			if rid, ok := metadata["requestId"].(string); ok && strings.TrimSpace(rid) != "" {
				requestID = strings.TrimSpace(rid)
			}
		}

		if err := c.service.AutoCreateShipmentFromConfirmedOrderEvent(ctx, requestID, payload, msg.Partition, fmt.Sprintf("%d", msg.Offset)); err != nil {
			c.logger.Error("auto-create shipment from confirmed order failed", zap.Error(err))
		}
	}
}

func (c *OrderEventsConsumer) Close() {
	if c.reader != nil {
		_ = c.reader.Close()
	}
}
