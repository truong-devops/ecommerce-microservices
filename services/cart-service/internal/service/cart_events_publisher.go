package service

import (
	"context"
	"encoding/json"
	"time"

	"cart-service/internal/domain"

	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

type CartEventsPublisher struct {
	enabled bool
	topic   string
	logger  *zap.Logger
	writer  *kafka.Writer
}

func NewCartEventsPublisher(enabled bool, brokers []string, topic, clientID string, logger *zap.Logger) *CartEventsPublisher {
	p := &CartEventsPublisher{
		enabled: enabled,
		topic:   topic,
		logger:  logger,
	}
	if !enabled {
		return p
	}
	p.writer = &kafka.Writer{
		Addr:         kafka.TCP(brokers...),
		Topic:        topic,
		Balancer:     &kafka.LeastBytes{},
		BatchTimeout: 50 * time.Millisecond,
		RequiredAcks: kafka.RequireOne,
	}
	_ = clientID
	return p
}

func (p *CartEventsPublisher) Close() {
	if p.writer != nil {
		_ = p.writer.Close()
	}
}

func (p *CartEventsPublisher) PublishCartItemAdded(ctx context.Context, cart domain.CartSnapshot, item domain.CartItem, actor domain.UserContext, requestID string) {
	p.publishCartItemEvent(ctx, "cart.item-added", cart, item, actor, requestID)
}

func (p *CartEventsPublisher) PublishCartItemUpdated(ctx context.Context, cart domain.CartSnapshot, item domain.CartItem, actor domain.UserContext, requestID string) {
	p.publishCartItemEvent(ctx, "cart.item-updated", cart, item, actor, requestID)
}

func (p *CartEventsPublisher) PublishCartItemRemoved(ctx context.Context, cart domain.CartSnapshot, item domain.CartItem, actor domain.UserContext, requestID string) {
	p.publishCartItemEvent(ctx, "cart.item-removed", cart, item, actor, requestID)
}

func (p *CartEventsPublisher) PublishCartCleared(ctx context.Context, cartID, userID string, actor domain.UserContext, requestID string) {
	payload := map[string]any{
		"cartId": cartID,
		"userId": userID,
		"metadata": map[string]any{
			"requestId":  requestID,
			"occurredAt": time.Now().UTC().Format(time.RFC3339),
			"actorId":    actor.UserID,
			"actorRole":  actor.Role,
		},
	}
	p.publish(ctx, "cart.cleared", userID, payload)
}

func (p *CartEventsPublisher) publishCartItemEvent(ctx context.Context, eventType string, cart domain.CartSnapshot, item domain.CartItem, actor domain.UserContext, requestID string) {
	payload := map[string]any{
		"cartId": cart.ID,
		"userId": cart.UserID,
		"item": map[string]any{
			"id":        item.ID,
			"productId": item.ProductID,
			"variantId": item.VariantID,
			"sku":       item.SKU,
			"name":      item.Name,
			"unitPrice": item.UnitPrice,
			"quantity":  item.Quantity,
			"lineTotal": item.LineTotal,
			"sellerId":  item.SellerID,
		},
		"metadata": map[string]any{
			"requestId":  requestID,
			"occurredAt": time.Now().UTC().Format(time.RFC3339),
			"actorId":    actor.UserID,
			"actorRole":  actor.Role,
		},
	}
	p.publish(ctx, eventType, cart.UserID, payload)
}

func (p *CartEventsPublisher) publish(ctx context.Context, eventType, key string, payload map[string]any) {
	if !p.enabled || p.writer == nil {
		return
	}
	event := map[string]any{
		"eventType": eventType,
		"payload":   payload,
	}
	body, err := json.Marshal(event)
	if err != nil {
		p.logger.Warn("marshal cart event failed", zap.String("event_type", eventType), zap.Error(err))
		return
	}
	if err := p.writer.WriteMessages(ctx, kafka.Message{Key: []byte(key), Value: body}); err != nil {
		p.logger.Warn("publish cart event failed", zap.String("event_type", eventType), zap.Error(err))
	}
}
