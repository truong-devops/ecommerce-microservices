package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AppName          string
	AppEnv           string
	Port             int
	APIPrefix        string
	WSAllowedOrigins []string

	MongoURI      string
	MongoDatabase string

	RedisEnabled bool
	RedisURL     string

	JWTAccessSecret string

	KafkaEnabled  bool
	KafkaClientID string
	KafkaBrokers  []string

	ChatEventsTopic         string
	NotificationEventsTopic string
	AnalyticsEventsTopic    string

	DispatchInterval time.Duration
	DispatchBatch    int
	DispatchMaxRetry int

	SendMessageRateRPS   float64
	SendMessageRateBurst int
}

func Load() (Config, error) {
	cfg := Config{
		AppName:          getEnv("APP_NAME", "chat-service"),
		AppEnv:           getEnv("APP_ENV", "development"),
		APIPrefix:        strings.Trim(getEnv("API_PREFIX", "api/v1"), "/"),
		WSAllowedOrigins: parseCSV(getEnv("WS_ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001,http://localhost:6789,http://localhost:8081,http://localhost:19006")),
		MongoURI:         strings.TrimSpace(os.Getenv("MONGO_URI")),
		MongoDatabase:    getEnv("MONGO_DATABASE", "ecommerce_chat"),
		RedisEnabled:     parseBool(getEnv("REDIS_ENABLED", "true")),
		RedisURL:         strings.TrimSpace(os.Getenv("REDIS_URL")),
		JWTAccessSecret:  strings.TrimSpace(os.Getenv("JWT_ACCESS_SECRET")),
		KafkaEnabled:     parseBool(getEnv("KAFKA_ENABLED", "true")),
		KafkaClientID:    getEnv("KAFKA_CLIENT_ID", "chat-service"),
		KafkaBrokers:     parseCSV(getEnv("KAFKA_BROKERS", "localhost:9092")),

		ChatEventsTopic:         getEnv("CHAT_EVENTS_TOPIC", "chat.events"),
		NotificationEventsTopic: getEnv("NOTIFICATION_EVENTS_TOPIC", "notification.events"),
		AnalyticsEventsTopic:    getEnv("ANALYTICS_EVENTS_TOPIC", "analytics.events"),
	}

	if cfg.MongoURI == "" {
		return Config{}, fmt.Errorf("MONGO_URI is required")
	}
	if len(cfg.JWTAccessSecret) < 32 {
		return Config{}, fmt.Errorf("JWT_ACCESS_SECRET must be at least 32 characters")
	}

	port, err := strconv.Atoi(getEnv("PORT", "3012"))
	if err != nil || port <= 0 {
		return Config{}, fmt.Errorf("invalid PORT")
	}
	cfg.Port = port

	if cfg.APIPrefix == "" {
		cfg.APIPrefix = "api/v1"
	}

	intervalMs, err := strconv.Atoi(getEnv("DISPATCH_INTERVAL_MS", "3000"))
	if err != nil || intervalMs < 500 {
		return Config{}, fmt.Errorf("DISPATCH_INTERVAL_MS must be >= 500")
	}
	cfg.DispatchInterval = time.Duration(intervalMs) * time.Millisecond

	batchSize, err := strconv.Atoi(getEnv("DISPATCH_BATCH_SIZE", "50"))
	if err != nil || batchSize < 1 || batchSize > 500 {
		return Config{}, fmt.Errorf("DISPATCH_BATCH_SIZE must be between 1 and 500")
	}
	cfg.DispatchBatch = batchSize

	maxRetry, err := strconv.Atoi(getEnv("DISPATCH_MAX_RETRY", "10"))
	if err != nil || maxRetry < 1 || maxRetry > 100 {
		return Config{}, fmt.Errorf("DISPATCH_MAX_RETRY must be between 1 and 100")
	}
	cfg.DispatchMaxRetry = maxRetry

	sendRateRPS, err := strconv.ParseFloat(getEnv("SEND_MESSAGE_RATE_RPS", "5"), 64)
	if err != nil || sendRateRPS <= 0 || sendRateRPS > 1000 {
		return Config{}, fmt.Errorf("SEND_MESSAGE_RATE_RPS must be > 0 and <= 1000")
	}
	cfg.SendMessageRateRPS = sendRateRPS

	sendRateBurst, err := strconv.Atoi(getEnv("SEND_MESSAGE_RATE_BURST", "20"))
	if err != nil || sendRateBurst < 1 || sendRateBurst > 5000 {
		return Config{}, fmt.Errorf("SEND_MESSAGE_RATE_BURST must be between 1 and 5000")
	}
	cfg.SendMessageRateBurst = sendRateBurst

	if cfg.RedisEnabled && cfg.RedisURL == "" {
		return Config{}, fmt.Errorf("REDIS_URL is required when REDIS_ENABLED=true")
	}
	if cfg.KafkaEnabled && len(cfg.KafkaBrokers) == 0 {
		return Config{}, fmt.Errorf("KAFKA_BROKERS is required when KAFKA_ENABLED=true")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func parseBool(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "y":
		return true
	default:
		return false
	}
}

func parseCSV(v string) []string {
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}
