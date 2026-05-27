package events

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"inventory-service/internal/config"
	"inventory-service/internal/service"

	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

type Consumer struct {
	enabled       bool
	orderReader   *kafka.Reader
	productReader *kafka.Reader
	logger        *zap.Logger
	svc           inventoryService
}

type inventoryService interface {
	ReserveInventoryFromOrderCreated(ctx context.Context, event service.OrderCreatedEvent, meta service.EventMeta) (map[string]any, error)
	ProvisionInventoryFromProductChanged(ctx context.Context, event service.ProductChangedEvent, meta service.EventMeta) (map[string]any, error)
	ReleaseReservationsFromOrderCancellation(ctx context.Context, orderID, requestID string) (map[string]any, error)
	ReleaseReservationsFromOrderFailed(ctx context.Context, orderID, requestID string) (map[string]any, error)
	ConfirmReservationsFromOrderConfirmed(ctx context.Context, orderID, requestID string) (map[string]any, error)
}

func NewConsumer(cfg config.Config, logger *zap.Logger, svc *service.InventoryService) *Consumer {
	c := &Consumer{
		enabled: cfg.KafkaEnabled,
		logger:  logger,
		svc:     svc,
	}
	if !cfg.KafkaEnabled {
		return c
	}
	c.orderReader = kafka.NewReader(kafka.ReaderConfig{
		Brokers: cfg.KafkaBrokers,
		Topic:   cfg.OrderEventsTopic,
		GroupID: cfg.OrderEventsConsumerGroup,
	})
	c.productReader = kafka.NewReader(kafka.ReaderConfig{
		Brokers: cfg.KafkaBrokers,
		Topic:   cfg.ProductEventsTopic,
		GroupID: cfg.ProductEventsConsumerGroup,
	})
	return c
}

func (c *Consumer) Run(ctx context.Context) {
	if !c.enabled || c.orderReader == nil || c.productReader == nil {
		return
	}
	go c.readMessages(ctx, c.productReader, c.handleProductMessage)
	c.readMessages(ctx, c.orderReader, c.handleMessage)
}

func (c *Consumer) readMessages(ctx context.Context, reader *kafka.Reader, handler func(context.Context, kafka.Message)) {
	for {
		msg, err := reader.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			c.logger.Error("kafka read message failed", zap.Error(err))
			time.Sleep(time.Second)
			continue
		}
		handler(ctx, msg)
	}
}

func (c *Consumer) Close() {
	if c.orderReader != nil {
		_ = c.orderReader.Close()
	}
	if c.productReader != nil {
		_ = c.productReader.Close()
	}
}

func (c *Consumer) handleMessage(ctx context.Context, msg kafka.Message) {
	envelope, err := decodeEnvelope(msg.Value)
	if err != nil {
		c.logger.Warn("skip invalid kafka payload", zap.Error(err))
		return
	}

	meta := buildEventMeta(envelope, msg)
	switch envelope.EventType {
	case "order.created":
		event, parseErr := parseOrderCreatedEvent(envelope.Payload)
		if parseErr != nil {
			c.logger.Warn("skip order.created due to invalid payload", zap.Error(parseErr))
			return
		}
		c.logger.Info("checkout saga order event received",
			zap.String("requestId", meta.RequestID),
			zap.String("eventId", meta.EventID),
			zap.String("eventType", meta.EventType),
			zap.String("orderId", event.OrderID),
			zap.String("topic", meta.Topic),
			zap.Int("partition", meta.Partition),
			zap.Int64("offset", meta.OffsetValue),
		)
		if _, err := c.svc.ReserveInventoryFromOrderCreated(ctx, event, meta); err != nil {
			c.logger.Error("reserve inventory from order.created failed", zap.String("order_id", event.OrderID), zap.Error(err))
		}
	case "order.cancelled":
		orderID := strings.TrimSpace(asString(envelope.Payload["orderId"]))
		if orderID == "" {
			c.logger.Warn("skip order.cancelled due to empty orderId")
			return
		}
		if _, err := c.svc.ReleaseReservationsFromOrderCancellation(ctx, orderID, meta.RequestID); err != nil {
			c.logger.Error("release reservation from order.cancelled failed", zap.String("order_id", orderID), zap.Error(err))
		}
	case "order.status-updated":
		orderID := strings.TrimSpace(asString(envelope.Payload["orderId"]))
		status := strings.ToUpper(strings.TrimSpace(asString(envelope.Payload["status"])))
		if orderID == "" || status == "" {
			c.logger.Warn("skip order.status-updated due to missing orderId or status")
			return
		}
		c.logger.Info("checkout saga order status event received",
			zap.String("requestId", meta.RequestID),
			zap.String("eventId", meta.EventID),
			zap.String("eventType", meta.EventType),
			zap.String("orderId", orderID),
			zap.String("toStatus", status),
			zap.String("topic", meta.Topic),
			zap.Int("partition", meta.Partition),
			zap.Int64("offset", meta.OffsetValue),
		)
		switch status {
		case "CONFIRMED":
			if _, err := c.svc.ConfirmReservationsFromOrderConfirmed(ctx, orderID, meta.RequestID); err != nil {
				c.logger.Error("confirm reservation from order.status-updated failed", zap.String("order_id", orderID), zap.Error(err))
			}
		case "FAILED", "CANCELLED":
			if _, err := c.svc.ReleaseReservationsFromOrderFailed(ctx, orderID, meta.RequestID); err != nil {
				c.logger.Error("release reservation from order.status-updated failed", zap.String("order_id", orderID), zap.String("status", status), zap.Error(err))
			}
		}
	default:
		return
	}
}

func (c *Consumer) handleProductMessage(ctx context.Context, msg kafka.Message) {
	envelope, err := decodeEnvelope(msg.Value)
	if err != nil {
		c.logger.Warn("skip invalid product kafka payload", zap.Error(err))
		return
	}
	switch envelope.EventType {
	case "product.created", "product.updated":
	case "product.status-changed":
		if strings.ToUpper(strings.TrimSpace(asString(envelope.Payload["status"]))) != "ACTIVE" {
			return
		}
	default:
		return
	}

	event, err := parseProductChangedEvent(envelope.Payload)
	if err != nil {
		c.logger.Warn("skip product event due to invalid payload", zap.String("eventType", envelope.EventType), zap.Error(err))
		return
	}
	meta := buildEventMeta(envelope, msg)
	if _, err := c.svc.ProvisionInventoryFromProductChanged(ctx, event, meta); err != nil {
		c.logger.Error("provision inventory from product event failed",
			zap.String("eventType", envelope.EventType),
			zap.String("productId", event.ProductID),
			zap.Error(err),
		)
	}
}

type envelope struct {
	EventID   string         `json:"eventId"`
	EventType string         `json:"eventType"`
	Payload   map[string]any `json:"payload"`
	Metadata  map[string]any `json:"metadata"`
}

func decodeEnvelope(value []byte) (envelope, error) {
	var out envelope
	if err := json.Unmarshal(value, &out); err != nil {
		return envelope{}, err
	}
	out.EventType = strings.TrimSpace(out.EventType)
	if out.Payload == nil {
		out.Payload = map[string]any{}
	}
	return out, nil
}

func parseOrderCreatedEvent(payload map[string]any) (service.OrderCreatedEvent, error) {
	orderID := strings.TrimSpace(asString(payload["orderId"]))
	if orderID == "" {
		return service.OrderCreatedEvent{}, fmt.Errorf("orderId is required")
	}

	rawItems, ok := payload["items"].([]any)
	if !ok || len(rawItems) == 0 {
		return service.OrderCreatedEvent{}, fmt.Errorf("items must be a non-empty array")
	}

	items := make([]service.ReserveInventoryItem, 0, len(rawItems))
	for idx, raw := range rawItems {
		itemMap, ok := raw.(map[string]any)
		if !ok {
			return service.OrderCreatedEvent{}, fmt.Errorf("items[%d] must be an object", idx)
		}
		sku := strings.TrimSpace(asString(itemMap["sku"]))
		qty, ok := asInt(itemMap["quantity"])
		if sku == "" || !ok || qty <= 0 {
			return service.OrderCreatedEvent{}, fmt.Errorf("items[%d] has invalid sku or quantity", idx)
		}
		items = append(items, service.ReserveInventoryItem{SKU: sku, Quantity: qty})
	}

	return service.OrderCreatedEvent{OrderID: orderID, Items: items}, nil
}

func parseProductChangedEvent(payload map[string]any) (service.ProductChangedEvent, error) {
	productID := strings.TrimSpace(asString(payload["id"]))
	sellerID := strings.TrimSpace(asString(payload["sellerId"]))
	if productID == "" || sellerID == "" {
		return service.ProductChangedEvent{}, fmt.Errorf("id and sellerId are required")
	}
	rawVariants, ok := payload["variants"].([]any)
	if !ok || len(rawVariants) == 0 {
		return service.ProductChangedEvent{}, fmt.Errorf("variants must be a non-empty array")
	}
	variants := make([]service.ProductVariant, 0, len(rawVariants))
	for idx, raw := range rawVariants {
		variant, ok := raw.(map[string]any)
		if !ok {
			return service.ProductChangedEvent{}, fmt.Errorf("variants[%d] must be an object", idx)
		}
		sku := strings.TrimSpace(asString(variant["sku"]))
		if sku == "" {
			return service.ProductChangedEvent{}, fmt.Errorf("variants[%d] has invalid sku", idx)
		}
		initialStock := 0
		if rawStock, exists := variant["initialStock"]; exists {
			var ok bool
			initialStock, ok = asInt(rawStock)
			if !ok || initialStock < 0 {
				return service.ProductChangedEvent{}, fmt.Errorf("variants[%d] has invalid initialStock", idx)
			}
		}
		variants = append(variants, service.ProductVariant{SKU: sku, InitialStock: initialStock})
	}
	return service.ProductChangedEvent{ProductID: productID, SellerID: sellerID, Variants: variants}, nil
}

func buildEventMeta(env envelope, msg kafka.Message) service.EventMeta {
	topic := msg.Topic
	if strings.TrimSpace(topic) == "" {
		topic = "order.events"
	}
	meta := service.EventMeta{
		EventID:     strings.TrimSpace(env.EventID),
		EventType:   env.EventType,
		Topic:       topic,
		Partition:   msg.Partition,
		OffsetValue: msg.Offset,
		RequestID:   fmt.Sprintf("kafka-%d-%d", msg.Partition, msg.Offset),
	}
	if payloadMeta, ok := env.Payload["metadata"].(map[string]any); ok {
		if rid := strings.TrimSpace(asString(payloadMeta["requestId"])); rid != "" {
			meta.RequestID = rid
		}
	}
	if rid := strings.TrimSpace(asString(env.Metadata["requestId"])); rid != "" {
		meta.RequestID = rid
	}
	return meta
}

func asString(v any) string {
	s, ok := v.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(s)
}

func asInt(v any) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case int32:
		return int(n), true
	case int64:
		return int(n), true
	case float64:
		if n != float64(int(n)) {
			return 0, false
		}
		return int(n), true
	case float32:
		if n != float32(int(n)) {
			return 0, false
		}
		return int(n), true
	default:
		return 0, false
	}
}
