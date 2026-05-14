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
	svc     *service.InventoryService
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
		Topic:   cfg.InventoryEventsTopic,
		GroupID: cfg.KafkaConsumerGroup,
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
	var envelope struct {
		EventType string         `json:"eventType"`
		Payload   map[string]any `json:"payload"`
	}
	if err := json.Unmarshal(msg.Value, &envelope); err != nil {
		c.logger.Warn("skip invalid kafka payload", zap.Error(err))
		return
	}
	if envelope.EventType != "order.cancelled" {
		return
	}

	orderID, _ := envelope.Payload["orderId"].(string)
	orderID = strings.TrimSpace(orderID)
	if orderID == "" {
		c.logger.Warn("skip order.cancelled due to empty orderId")
		return
	}

	requestID := fmt.Sprintf("kafka-%d-%d", msg.Partition, msg.Offset)
	if meta, ok := envelope.Payload["metadata"].(map[string]any); ok {
		if rid, ok := meta["requestId"].(string); ok && strings.TrimSpace(rid) != "" {
			requestID = strings.TrimSpace(rid)
		}
	}

	if _, err := c.svc.ReleaseReservationsFromOrderCancellation(ctx, orderID, requestID); err != nil {
		c.logger.Error("release reservation from order.cancelled failed", zap.String("order_id", orderID), zap.Error(err))
	}
}
