package events

import (
	"context"
	"encoding/json"
	"time"

	"product-service/internal/config"
	"product-service/internal/domain"
	"product-service/internal/timefmt"

	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

type ProductEventPublisher interface {
	PublishProductCreated(ctx context.Context, product domain.ProductResponse, actor domain.UserContext, requestID string) error
	PublishProductUpdated(ctx context.Context, product domain.ProductResponse, actor domain.UserContext, requestID string) error
	PublishProductStatusChanged(ctx context.Context, product domain.ProductResponse, actor domain.UserContext, requestID string, reason string) error
	PublishProductDeleted(ctx context.Context, product domain.ProductResponse, actor domain.UserContext, requestID string) error
	PublishVideoAnalyticsEvent(ctx context.Context, eventType string, payload map[string]any, eventKey string) error
	Close() error
}

type KafkaProductEventPublisher struct {
	enabled         bool
	productWriter   *kafka.Writer
	analyticsWriter *kafka.Writer
	logger          *zap.Logger
}

func NewProductEventPublisher(cfg config.Config, logger *zap.Logger) ProductEventPublisher {
	if !cfg.KafkaEnabled {
		return &KafkaProductEventPublisher{enabled: false}
	}
	return &KafkaProductEventPublisher{
		enabled: true,
		logger:  logger,
		productWriter: &kafka.Writer{
			Addr:         kafka.TCP(cfg.KafkaBrokers...),
			Topic:        cfg.ProductEventsTopic,
			Balancer:     &kafka.Hash{},
			RequiredAcks: kafka.RequireOne,
		},
		analyticsWriter: &kafka.Writer{
			Addr:         kafka.TCP(cfg.KafkaBrokers...),
			Topic:        cfg.AnalyticsEventsTopic,
			Balancer:     &kafka.Hash{},
			RequiredAcks: kafka.RequireOne,
		},
	}
}

func (p *KafkaProductEventPublisher) PublishProductCreated(ctx context.Context, product domain.ProductResponse, actor domain.UserContext, requestID string) error {
	return p.publish(ctx, "product.created", product, actor, requestID, "")
}

func (p *KafkaProductEventPublisher) PublishProductUpdated(ctx context.Context, product domain.ProductResponse, actor domain.UserContext, requestID string) error {
	return p.publish(ctx, "product.updated", product, actor, requestID, "")
}

func (p *KafkaProductEventPublisher) PublishProductStatusChanged(ctx context.Context, product domain.ProductResponse, actor domain.UserContext, requestID string, reason string) error {
	return p.publish(ctx, "product.status-changed", product, actor, requestID, reason)
}

func (p *KafkaProductEventPublisher) PublishProductDeleted(ctx context.Context, product domain.ProductResponse, actor domain.UserContext, requestID string) error {
	return p.publish(ctx, "product.deleted", product, actor, requestID, "")
}

func (p *KafkaProductEventPublisher) PublishVideoAnalyticsEvent(ctx context.Context, eventType string, payload map[string]any, eventKey string) error {
	if !p.enabled || p.analyticsWriter == nil {
		return nil
	}
	occurredAt := timefmt.ISO(time.Now())
	event := map[string]any{
		"eventType":  eventType,
		"occurredAt": occurredAt,
		"payload":    payload,
		"metadata": map[string]any{
			"occurredAt": occurredAt,
		},
	}
	raw, err := json.Marshal(event)
	if err != nil {
		return err
	}
	if err := p.analyticsWriter.WriteMessages(ctx, kafka.Message{
		Key:     []byte(eventType),
		Value:   raw,
		Headers: []kafka.Header{{Key: "eventKey", Value: []byte(eventKey)}},
	}); err != nil && p.logger != nil {
		p.logger.Warn("Kafka publish failed", zap.String("eventType", eventType), zap.Error(err))
		return nil
	}
	return nil
}

func (p *KafkaProductEventPublisher) publish(ctx context.Context, eventType string, product domain.ProductResponse, actor domain.UserContext, requestID string, reason string) error {
	payload, err := productResponsePayload(product)
	if err != nil {
		return err
	}
	if eventType == "product.status-changed" {
		if reason == "" {
			payload["reason"] = nil
		} else {
			payload["reason"] = reason
		}
	}
	return p.publishRaw(ctx, eventType, payload, actor, requestID, product.ID)
}

func productResponsePayload(product domain.ProductResponse) (map[string]any, error) {
	raw, err := json.Marshal(product)
	if err != nil {
		return nil, err
	}
	payload := map[string]any{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, err
	}
	return payload, nil
}

func (p *KafkaProductEventPublisher) publishRaw(ctx context.Context, eventType string, payload any, actor domain.UserContext, requestID string, key string) error {
	if !p.enabled || p.productWriter == nil {
		return nil
	}
	event := map[string]any{
		"eventType": eventType,
		"payload":   payload,
		"metadata": map[string]any{
			"requestId":  requestID,
			"occurredAt": timefmt.ISO(time.Now()),
			"actorId":    actor.UserID,
			"actorRole":  actor.Role,
		},
	}
	raw, err := json.Marshal(event)
	if err != nil {
		return err
	}
	if err := p.productWriter.WriteMessages(ctx, kafka.Message{Key: []byte(key), Value: raw}); err != nil && p.logger != nil {
		p.logger.Warn("Kafka publish failed", zap.String("eventType", eventType), zap.Error(err))
		return nil
	}
	return nil
}

func (p *KafkaProductEventPublisher) Close() error {
	if p == nil {
		return nil
	}
	var err error
	if p.productWriter != nil {
		err = p.productWriter.Close()
	}
	if p.analyticsWriter != nil {
		if analyticsErr := p.analyticsWriter.Close(); err == nil {
			err = analyticsErr
		}
	}
	return err
}
