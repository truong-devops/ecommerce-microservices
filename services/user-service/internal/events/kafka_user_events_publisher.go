package events

import (
	"context"
	"encoding/json"
	"time"

	"user-service-go/internal/config"

	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

type KafkaUserEventsPublisher struct {
	logger  *zap.Logger
	topic   string
	enabled bool
	writer  *kafka.Writer
}

func NewKafkaUserEventsPublisher(cfg config.Config, logger *zap.Logger) UserEventsPublisher {
	enabled := cfg.KafkaEnabled && len(cfg.KafkaBrokers) > 0
	if !enabled {
		logger.Debug("kafka disabled, user.registered publishing skipped")
		return &NoopUserEventsPublisher{}
	}

	writer := &kafka.Writer{
		Addr:         kafka.TCP(cfg.KafkaBrokers...),
		Topic:        cfg.KafkaUserTopic,
		RequiredAcks: kafka.RequireOne,
		Balancer:     &kafka.LeastBytes{},
		BatchTimeout: 10 * time.Millisecond,
		Async:        false,
		Transport: &kafka.Transport{
			ClientID: cfg.KafkaClientID,
		},
	}

	return &KafkaUserEventsPublisher{
		logger:  logger,
		topic:   cfg.KafkaUserTopic,
		enabled: true,
		writer:  writer,
	}
}

func (k *KafkaUserEventsPublisher) PublishUserRegistered(ctx context.Context, event UserRegisteredEventPayload) error {
	if !k.enabled || k.writer == nil {
		return nil
	}

	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}

	return k.writer.WriteMessages(ctx, kafka.Message{
		Key:   []byte(event.UserID),
		Value: payload,
	})
}

func (k *KafkaUserEventsPublisher) Close(ctx context.Context) error {
	if !k.enabled || k.writer == nil {
		return nil
	}
	return k.writer.Close()
}
