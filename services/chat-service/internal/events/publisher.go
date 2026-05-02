package events

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"chat-service/internal/config"

	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

type Publisher struct {
	enabled bool
	cfg     config.Config
	logger  *zap.Logger

	mu      sync.Mutex
	writers map[string]*kafka.Writer
}

func NewPublisher(cfg config.Config, logger *zap.Logger) *Publisher {
	return &Publisher{
		enabled: cfg.KafkaEnabled,
		cfg:     cfg,
		logger:  logger,
		writers: map[string]*kafka.Writer{},
	}
}

func (p *Publisher) Publish(ctx context.Context, eventType string, payload map[string]any) error {
	if !p.enabled {
		return nil
	}

	topics := p.resolveTopics()
	message, err := json.Marshal(map[string]any{
		"eventType":  eventType,
		"payload":    payload,
		"occurredAt": time.Now().UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		return err
	}

	for _, topic := range topics {
		writer := p.writerForTopic(topic)
		if err := writer.WriteMessages(ctx, kafka.Message{Key: []byte(eventType), Value: message}); err != nil {
			return err
		}
	}

	return nil
}

func (p *Publisher) Close() {
	p.mu.Lock()
	defer p.mu.Unlock()
	for topic, writer := range p.writers {
		if err := writer.Close(); err != nil {
			p.logger.Warn("kafka writer close failed", zap.String("topic", topic), zap.Error(err))
		}
	}
	p.writers = map[string]*kafka.Writer{}
}

func (p *Publisher) writerForTopic(topic string) *kafka.Writer {
	p.mu.Lock()
	defer p.mu.Unlock()

	if writer, ok := p.writers[topic]; ok {
		return writer
	}

	writer := &kafka.Writer{
		Addr:         kafka.TCP(p.cfg.KafkaBrokers...),
		Topic:        topic,
		Balancer:     &kafka.LeastBytes{},
		BatchTimeout: 50 * time.Millisecond,
		RequiredAcks: kafka.RequireOne,
	}
	p.writers[topic] = writer
	return writer
}

func (p *Publisher) resolveTopics() []string {
	topicSet := map[string]struct{}{
		p.cfg.ChatEventsTopic:         {},
		p.cfg.NotificationEventsTopic: {},
		p.cfg.AnalyticsEventsTopic:    {},
	}

	out := make([]string, 0, len(topicSet))
	for topic := range topicSet {
		out = append(out, topic)
	}
	return out
}
