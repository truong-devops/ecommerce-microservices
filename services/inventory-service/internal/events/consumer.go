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
	enabled bool
	reader  *kafka.Reader
	logger  *zap.Logger
	svc     inventoryService
}

type inventoryService interface {
	ReserveInventoryFromOrderCreated(ctx context.Context, event service.OrderCreatedEvent, meta service.EventMeta) (map[string]any, error)
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
	c.reader = kafka.NewReader(kafka.ReaderConfig{
		Brokers: cfg.KafkaBrokers,
		Topic:   cfg.OrderEventsTopic,
		GroupID: cfg.OrderEventsConsumerGroup,
	})
	return c
}

func (c *Consumer) Run(ctx context.Context) {
	if !c.enabled || c.reader == nil {
		return
	}
	for {
		msg, err := c.reader.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			c.logger.Error("kafka read message failed", zap.Error(err))
			time.Sleep(time.Second)
			continue
		}
		c.handleMessage(ctx, msg)
	}
}

func (c *Consumer) Close() {
	if c.reader != nil {
		_ = c.reader.Close()
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

type envelope struct {
	EventID   string         `json:"eventId"`
	EventType string         `json:"eventType"`
	Payload   map[string]any `json:"payload"`
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
