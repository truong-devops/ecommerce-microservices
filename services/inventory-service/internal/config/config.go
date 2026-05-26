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
	DBSSL       bool

	RedisEnabled bool
	RedisURL     string

	JWTAccessSecret string

	ReservationDefaultTTL     time.Duration
	ReservationExpireInterval time.Duration
	ReservationExpireBatch    int

	DispatchInterval time.Duration
	DispatchBatch    int
	DispatchMaxRetry int

	KafkaEnabled               bool
	KafkaClientID              string
	KafkaConsumerGroup         string
	OrderEventsTopic           string
	OrderEventsConsumerGroup   string
	ProductEventsTopic         string
	ProductEventsConsumerGroup string
	KafkaBrokers               []string
	InventoryEventsTopic       string

	RunMigrations bool
	MigrationFile string
}

func Load() (Config, error) {
	cfg := Config{
		AppName:         getEnv("APP_NAME", "inventory-service"),
		AppEnv:          getEnv("APP_ENV", "development"),
		APIPrefix:       strings.Trim(getEnv("API_PREFIX", "api/v1"), "/"),
		DatabaseURL:     strings.TrimSpace(os.Getenv("DATABASE_URL")),
		DBSSL:           parseBool(getEnv("DB_SSL", "false")),
		RedisEnabled:    parseBool(getEnv("REDIS_ENABLED", "false")),
		RedisURL:        strings.TrimSpace(os.Getenv("REDIS_URL")),
		JWTAccessSecret: strings.TrimSpace(os.Getenv("JWT_ACCESS_SECRET")),

		KafkaEnabled:               parseBool(getEnv("KAFKA_ENABLED", "false")),
		KafkaClientID:              getEnv("KAFKA_CLIENT_ID", "inventory-service"),
		KafkaConsumerGroup:         getEnv("KAFKA_CONSUMER_GROUP_ID", "inventory-service-group"),
		OrderEventsTopic:           getEnv("ORDER_EVENTS_TOPIC", "order.events"),
		OrderEventsConsumerGroup:   getEnv("ORDER_EVENTS_CONSUMER_GROUP", "inventory-service-order-events-group"),
		ProductEventsTopic:         getEnv("PRODUCT_EVENTS_TOPIC", "product.events"),
		ProductEventsConsumerGroup: getEnv("PRODUCT_EVENTS_CONSUMER_GROUP", "inventory-service-product-events-group"),
		KafkaBrokers:               parseCSV(getEnv("KAFKA_BROKERS", "localhost:9092")),
		InventoryEventsTopic:       getEnv("INVENTORY_EVENTS_TOPIC", "inventory.events"),

		RunMigrations: parseBool(getEnv("DB_MIGRATIONS_RUN", "true")),
		MigrationFile: getEnv("MIGRATION_FILE", "migrations/0001_init_inventory_service.sql"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	if len(cfg.JWTAccessSecret) < 32 {
		return Config{}, fmt.Errorf("JWT_ACCESS_SECRET must be at least 32 characters")
	}

	port, err := strconv.Atoi(getEnv("PORT", "3007"))
	if err != nil || port <= 0 {
		return Config{}, fmt.Errorf("invalid PORT")
	}
	cfg.Port = port

	if cfg.APIPrefix == "" {
		cfg.APIPrefix = "api/v1"
	}

	ttlMinutes, err := strconv.Atoi(getEnv("RESERVATION_DEFAULT_TTL_MINUTES", "10"))
	if err != nil || ttlMinutes < 1 || ttlMinutes > 1440 {
		return Config{}, fmt.Errorf("RESERVATION_DEFAULT_TTL_MINUTES must be between 1 and 1440")
	}
	cfg.ReservationDefaultTTL = time.Duration(ttlMinutes) * time.Minute

	expireIntervalMs, err := strconv.Atoi(getEnv("RESERVATION_EXPIRE_CHECK_INTERVAL_MS", "15000"))
	if err != nil || expireIntervalMs < 1000 {
		return Config{}, fmt.Errorf("RESERVATION_EXPIRE_CHECK_INTERVAL_MS must be >= 1000")
	}
	cfg.ReservationExpireInterval = time.Duration(expireIntervalMs) * time.Millisecond

	expireBatch, err := strconv.Atoi(getEnv("RESERVATION_EXPIRE_BATCH_SIZE", "200"))
	if err != nil || expireBatch < 1 || expireBatch > 10000 {
		return Config{}, fmt.Errorf("RESERVATION_EXPIRE_BATCH_SIZE must be between 1 and 10000")
	}
	cfg.ReservationExpireBatch = expireBatch

	dispatchIntervalMs, err := strconv.Atoi(getEnv("OUTBOX_DISPATCH_INTERVAL_MS", "3000"))
	if err != nil || dispatchIntervalMs < 500 {
		return Config{}, fmt.Errorf("OUTBOX_DISPATCH_INTERVAL_MS must be >= 500")
	}
	cfg.DispatchInterval = time.Duration(dispatchIntervalMs) * time.Millisecond

	dispatchBatch, err := strconv.Atoi(getEnv("OUTBOX_BATCH_SIZE", "50"))
	if err != nil || dispatchBatch < 1 || dispatchBatch > 500 {
		return Config{}, fmt.Errorf("OUTBOX_BATCH_SIZE must be between 1 and 500")
	}
	cfg.DispatchBatch = dispatchBatch

	dispatchRetry, err := strconv.Atoi(getEnv("OUTBOX_MAX_RETRY", "10"))
	if err != nil || dispatchRetry < 1 || dispatchRetry > 100 {
		return Config{}, fmt.Errorf("OUTBOX_MAX_RETRY must be between 1 and 100")
	}
	cfg.DispatchMaxRetry = dispatchRetry

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
