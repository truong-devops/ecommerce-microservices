package events

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

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
		msg, err := c.reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			c.logger.Error("order events read failed", zap.Error(err))
			continue
		}

		for {
			if err := c.handleMessage(ctx, msg); err == nil {
				break
			} else {
				c.logger.Error("order event processing failed; retrying",
					zap.Int("partition", msg.Partition),
					zap.Int64("offset", msg.Offset),
					zap.Error(err),
				)
				select {
				case <-ctx.Done():
					return
				case <-time.After(2 * time.Second):
				}
			}
		}
		if err := c.reader.CommitMessages(ctx, msg); err != nil {
			c.logger.Error("order event commit failed", zap.Int("partition", msg.Partition), zap.Int64("offset", msg.Offset), zap.Error(err))
		}
	}
}

func (c *OrderEventsConsumer) handleMessage(ctx context.Context, msg kafka.Message) error {
	if len(msg.Value) == 0 {
		return nil
	}

	var envelope orderEventEnvelope
	if err := json.Unmarshal(msg.Value, &envelope); err != nil {
		c.logger.Warn("skip invalid order event payload", zap.Error(err))
		return nil
	}

	eventType := strings.TrimSpace(envelope.EventType)
	if eventType == "" {
		eventType = strings.TrimSpace(string(msg.Key))
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

	switch {
	case eventType == "order.status-updated" && strings.EqualFold(strings.TrimSpace(fmt.Sprint(payload["status"])), "CONFIRMED"):
		return c.service.AutoCreateShipmentFromConfirmedOrderEvent(ctx, requestID, payload, msg.Partition, fmt.Sprintf("%d", msg.Offset))
	case eventType == "order.return-shipped":
		return c.service.AutoCreateReturnShipmentFromEvent(ctx, requestID, payload, msg.Partition, fmt.Sprintf("%d", msg.Offset))
	default:
		return nil
	}
}

func (c *OrderEventsConsumer) Close() {
	if c.reader != nil {
		_ = c.reader.Close()
	}
}
