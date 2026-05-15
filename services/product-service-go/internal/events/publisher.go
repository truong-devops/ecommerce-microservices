package events

import (
	"context"
	"encoding/json"
	"time"

	"product-service-go/internal/config"
	"product-service-go/internal/domain"

	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

type ProductEventPublisher interface {
	PublishProductCreated(ctx context.Context, product domain.ProductResponse, actor domain.UserContext, requestID string) error
	PublishProductUpdated(ctx context.Context, product domain.ProductResponse, actor domain.UserContext, requestID string) error
	PublishProductStatusChanged(ctx context.Context, product domain.ProductResponse, actor domain.UserContext, requestID string, reason string) error
	PublishProductDeleted(ctx context.Context, product domain.ProductResponse, actor domain.UserContext, requestID string) error
	Close() error
}

type KafkaProductEventPublisher struct {
	enabled bool
	writer  *kafka.Writer
	topic   string
	logger  *zap.Logger
}

func NewProductEventPublisher(cfg config.Config, logger *zap.Logger) ProductEventPublisher {
	if !cfg.KafkaEnabled {
		return &KafkaProductEventPublisher{enabled: false}
	}
	return &KafkaProductEventPublisher{
		enabled: true,
		topic:   cfg.ProductEventsTopic,
		logger:  logger,
		writer: &kafka.Writer{
			Addr:         kafka.TCP(cfg.KafkaBrokers...),
			Topic:        cfg.ProductEventsTopic,
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
	payload := product
	if reason != "" {
		// The Nest publisher appends reason to the serialized product snapshot.
		return p.publishRaw(ctx, "product.status-changed", map[string]any{"product": payload, "reason": reason}, actor, requestID, product.ID)
	}
	return p.publish(ctx, "product.status-changed", payload, actor, requestID, "")
}

func (p *KafkaProductEventPublisher) PublishProductDeleted(ctx context.Context, product domain.ProductResponse, actor domain.UserContext, requestID string) error {
	return p.publish(ctx, "product.deleted", product, actor, requestID, "")
}

func (p *KafkaProductEventPublisher) publish(ctx context.Context, eventType string, product domain.ProductResponse, actor domain.UserContext, requestID string, reason string) error {
	payload := map[string]any{
		"id":         product.ID,
		"sellerId":   product.SellerID,
		"name":       product.Name,
		"slug":       product.Slug,
		"categoryId": product.CategoryID,
		"brand":      product.Brand,
		"status":     product.Status,
		"minPrice":   product.MinPrice,
		"variants":   product.Variants,
		"createdAt":  product.CreatedAt,
		"updatedAt":  product.UpdatedAt,
	}
	if reason != "" {
		payload["reason"] = reason
	}
	return p.publishRaw(ctx, eventType, payload, actor, requestID, product.ID)
}

func (p *KafkaProductEventPublisher) publishRaw(ctx context.Context, eventType string, payload any, actor domain.UserContext, requestID string, key string) error {
	if !p.enabled || p.writer == nil {
		return nil
	}
	event := map[string]any{
		"eventType": eventType,
		"payload":   payload,
		"metadata": map[string]any{
			"requestId":  requestID,
			"occurredAt": time.Now().UTC().Format(time.RFC3339),
			"actorId":    actor.UserID,
			"actorRole":  actor.Role,
		},
	}
	raw, err := json.Marshal(event)
	if err != nil {
		return err
	}
	if err := p.writer.WriteMessages(ctx, kafka.Message{Key: []byte(key), Value: raw}); err != nil && p.logger != nil {
		p.logger.Warn("Kafka publish failed", zap.String("eventType", eventType), zap.Error(err))
		return nil
	}
	return nil
}

func (p *KafkaProductEventPublisher) Close() error {
	if p == nil || p.writer == nil {
		return nil
	}
	return p.writer.Close()
}
