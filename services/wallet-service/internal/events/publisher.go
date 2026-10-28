package events

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"wallet-service/internal/config"

	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

type Publisher struct {
	enabled bool
	writer  *kafka.Writer
	logger  *zap.Logger
}

func NewPublisher(cfg config.Config, logger *zap.Logger) *Publisher {
	publisher := &Publisher{enabled: cfg.KafkaEnabled, logger: logger}
	if cfg.KafkaEnabled {
		publisher.writer = &kafka.Writer{
			Addr: kafka.TCP(cfg.KafkaBrokers...), Topic: cfg.WalletEventsTopic,
			Balancer: &kafka.LeastBytes{}, BatchTimeout: 50 * time.Millisecond, RequiredAcks: kafka.RequireOne,
		}
	}
	return publisher
}

func (p *Publisher) Publish(ctx context.Context, eventID, eventType string, payload map[string]any) error {
	if !p.enabled || p.writer == nil {
		return nil
	}
	value, err := json.Marshal(map[string]any{
		"eventId": eventID, "eventType": eventType,
		"payload": payload, "occurredAt": time.Now().UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		return err
	}
	return p.writer.WriteMessages(ctx, kafka.Message{Key: eventMessageKey(eventType, payload), Value: value})
}

func eventMessageKey(eventType string, payload map[string]any) []byte {
	for _, field := range []string{"walletId", "paymentId", "orderId"} {
		if value, ok := payload[field].(string); ok && strings.TrimSpace(value) != "" {
			return []byte(strings.TrimSpace(value))
		}
	}
	return []byte(eventType)
}

func (p *Publisher) Close() {
	if p.writer != nil {
		if err := p.writer.Close(); err != nil {
			p.logger.Warn("wallet kafka writer close failed", zap.Error(err))
		}
	}
}
