package events

import (
	"context"
	"encoding/json"
	"time"

	"inventory-service/internal/config"

	"github.com/google/uuid"
	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

type Publisher struct {
	enabled bool
	topic   string
	logger  *zap.Logger
	writer  *kafka.Writer
}

func NewPublisher(cfg config.Config, logger *zap.Logger) *Publisher {
	p := &Publisher{
		enabled: cfg.KafkaEnabled,
		topic:   cfg.InventoryEventsTopic,
		logger:  logger,
	}
	if !cfg.KafkaEnabled {
		return p
	}
	p.writer = &kafka.Writer{
		Addr:         kafka.TCP(cfg.KafkaBrokers...),
		Topic:        cfg.InventoryEventsTopic,
		Balancer:     &kafka.LeastBytes{},
		BatchTimeout: 50 * time.Millisecond,
		RequiredAcks: kafka.RequireOne,
	}
	return p
}

func (p *Publisher) Publish(ctx context.Context, eventType string, payload map[string]any) error {
	if !p.enabled || p.writer == nil {
		return nil
	}
	body, err := json.Marshal(map[string]any{
		"eventId":    uuid.NewString(),
		"eventType":  eventType,
		"payload":    payload,
		"occurredAt": time.Now().UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		return err
	}

	return p.writer.WriteMessages(ctx, kafka.Message{
		Key:   []byte(eventType),
		Value: body,
	})
}

func (p *Publisher) Close() {
	if p.writer == nil {
		return
	}
	if err := p.writer.Close(); err != nil {
		p.logger.Warn("kafka writer close failed", zap.Error(err))
	}
}
