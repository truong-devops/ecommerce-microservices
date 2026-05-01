package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AppName   string
	AppEnv    string
	Port      int
	APIPrefix string

	DatabaseURL string

	RedisEnabled bool
	RedisURL     string

	JWTAccessSecret string

	DispatchInterval time.Duration
	DispatchBatch    int
	DispatchMaxRetry int

	KafkaEnabled  bool
	KafkaClientID string
	KafkaBrokers  []string
	KafkaTopic    string
	KafkaGroup    string

	RunMigrations bool
	MigrationFile string
}

func Load() (Config, error) {
	cfg := Config{
		AppName:         getEnv("APP_NAME", "notification-service"),
		AppEnv:          getEnv("APP_ENV", "development"),
		APIPrefix:       strings.Trim(getEnv("API_PREFIX", "api/v1"), "/"),
		DatabaseURL:     strings.TrimSpace(os.Getenv("DATABASE_URL")),
		RedisEnabled:    parseBool(getEnv("REDIS_ENABLED", "false")),
		RedisURL:        strings.TrimSpace(os.Getenv("REDIS_URL")),
		JWTAccessSecret: strings.TrimSpace(os.Getenv("JWT_ACCESS_SECRET")),
		KafkaEnabled:    parseBool(getEnv("KAFKA_ENABLED", "true")),
		KafkaClientID:   getEnv("KAFKA_CLIENT_ID", "notification-service"),
		KafkaBrokers:    parseCSV(getEnv("KAFKA_BROKERS", "localhost:9092")),
		KafkaTopic:      getEnv("NOTIFICATION_EVENTS_TOPIC", "notification.events"),
		KafkaGroup:      getEnv("NOTIFICATION_CONSUMER_GROUP", "notification-service-group"),
		RunMigrations:   parseBool(getEnv("DB_MIGRATIONS_RUN", "false")),
		MigrationFile:   getEnv("MIGRATION_FILE", "migrations/0001_init_notification_service.sql"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}

	if len(cfg.JWTAccessSecret) < 32 {
		return Config{}, fmt.Errorf("JWT_ACCESS_SECRET must be at least 32 characters")
	}

	port, err := strconv.Atoi(getEnv("PORT", "3009"))
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
