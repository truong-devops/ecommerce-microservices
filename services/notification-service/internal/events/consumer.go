package events

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
	"strings"

	"notification-service/internal/service"

	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

type Consumer struct {
	enabled    bool
	reader     *kafka.Reader
	service    *service.NotificationService
	logger     *zap.Logger
	kafkaTopic string
}

type kafkaNotificationEvent struct {
	EventType string         `json:"eventType"`
	Payload   map[string]any `json:"payload"`
}

func NewConsumer(enabled bool, brokers []string, topic, groupID, clientID string, svc *service.NotificationService, logger *zap.Logger) *Consumer {
	if !enabled || len(brokers) == 0 {
		return &Consumer{enabled: false, service: svc, logger: logger, kafkaTopic: topic}
	}

	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:  brokers,
		Topic:    topic,
		GroupID:  groupID,
		MinBytes: 1,
		MaxBytes: 10e6,
	})

	_ = clientID

	return &Consumer{enabled: true, reader: reader, service: svc, logger: logger, kafkaTopic: topic}
}

func (c *Consumer) Run(ctx context.Context) {
	if !c.enabled || c.reader == nil {
		c.logger.Warn("kafka consumer disabled", zap.String("topic", c.kafkaTopic))
		return
	}
	defer c.reader.Close()

	c.logger.Info("kafka consumer started", zap.String("topic", c.kafkaTopic))
	for {
		msg, err := c.reader.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			c.logger.Error("kafka read failed", zap.Error(err))
			continue
		}

		if len(msg.Value) == 0 {
			continue
		}

		var parsed kafkaNotificationEvent
		if err := json.Unmarshal(msg.Value, &parsed); err != nil {
			c.logger.Error("failed to parse notification event payload", zap.Error(err))
			continue
		}

		eventType := strings.TrimSpace(parsed.EventType)
		if eventType == "" {
			eventType = strings.TrimSpace(string(msg.Key))
		}
		if eventType == "" {
			continue
		}

		payload := parsed.Payload
		if payload == nil {
			payload = map[string]any{}
		}

		eventKey := buildEventKey(eventType, payload)
		result, err := c.service.HandleIncomingEvent(ctx, eventType, payload, eventKey)
		if err != nil {
			c.logger.Error("notification event consume failed", zap.String("event_type", eventType), zap.Error(err))
			continue
		}

		c.logger.Info("notification event consumed",
			zap.String("event_type", eventType),
			zap.String("event_key", eventKey),
			zap.Any("result", result),
		)
	}
}

func buildEventKey(eventType string, payload map[string]any) string {
	canonical := canonicalize(map[string]any{
		"eventType": eventType,
		"payload":   payload,
	})
	hash := sha256.Sum256([]byte(canonical))
	return hex.EncodeToString(hash[:])
}

func canonicalize(value any) string {
	switch v := value.(type) {
	case nil:
		return "null"
	case string:
		b, _ := json.Marshal(v)
		return string(b)
	case bool, float64, float32, int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		b, _ := json.Marshal(v)
		return string(b)
	case []any:
		parts := make([]string, 0, len(v))
		for _, item := range v {
			parts = append(parts, canonicalize(item))
		}
		return "[" + strings.Join(parts, ",") + "]"
	case map[string]any:
		keys := make([]string, 0, len(v))
		for k := range v {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		parts := make([]string, 0, len(keys))
		for _, key := range keys {
			k, _ := json.Marshal(key)
			parts = append(parts, string(k)+":"+canonicalize(v[key]))
		}
		return "{" + strings.Join(parts, ",") + "}"
	case []string:
		parts := make([]string, 0, len(v))
		for _, item := range v {
			parts = append(parts, canonicalize(item))
		}
		return "[" + strings.Join(parts, ",") + "]"
	default:
		b, _ := json.Marshal(v)
		var normalized any
		if err := json.Unmarshal(b, &normalized); err != nil {
			return "null"
		}
		return canonicalize(normalized)
	}
}
