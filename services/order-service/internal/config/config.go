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

	JWTAccessSecret      string
	InternalServiceToken string

	ProductServiceBaseURL string
	DependencyTimeout     time.Duration

	IdempotencyRecordTTLMinutes int
	IdempotencyLockTTLSeconds   int

	DispatchInterval time.Duration
	DispatchBatch    int
	DispatchMaxRetry int

	KafkaEnabled  bool
	KafkaClientID string
	KafkaBrokers  []string

	OrderEventsTopic        string
	InventoryEventsTopic    string
	PaymentEventsTopic      string
	NotificationEventsTopic string
	AnalyticsEventsTopic    string
	AuditEventsTopic        string

	RunMigrations bool
	MigrationFile string
}

func Load() (Config, error) {
	cfg := Config{
		AppName:              getEnv("APP_NAME", "order-service"),
		AppEnv:               getEnv("APP_ENV", "development"),
		APIPrefix:            strings.Trim(getEnv("API_PREFIX", "api/v1"), "/"),
		DatabaseURL:          strings.TrimSpace(os.Getenv("DATABASE_URL")),
		RedisEnabled:         parseBool(getEnv("REDIS_ENABLED", "true")),
		RedisURL:             strings.TrimSpace(os.Getenv("REDIS_URL")),
		JWTAccessSecret:      strings.TrimSpace(os.Getenv("JWT_ACCESS_SECRET")),
		InternalServiceToken: strings.TrimSpace(os.Getenv("INTERNAL_SERVICE_TOKEN")),
		ProductServiceBaseURL: strings.TrimRight(
			strings.TrimSpace(getEnv("PRODUCT_SERVICE_BASE_URL", "http://product-service:8080/api/v1")),
			"/",
		),

		KafkaEnabled:  parseBool(getEnv("KAFKA_ENABLED", "true")),
		KafkaClientID: getEnv("KAFKA_CLIENT_ID", "order-service"),
		KafkaBrokers:  parseCSV(getEnv("KAFKA_BROKERS", "localhost:9092")),

		OrderEventsTopic:        getEnv("ORDER_EVENTS_TOPIC", "order.events"),
		InventoryEventsTopic:    getEnv("INVENTORY_EVENTS_TOPIC", "inventory.events"),
		PaymentEventsTopic:      getEnv("PAYMENT_EVENTS_TOPIC", "payment.events"),
		NotificationEventsTopic: getEnv("NOTIFICATION_EVENTS_TOPIC", "notification.events"),
		AnalyticsEventsTopic:    getEnv("ANALYTICS_EVENTS_TOPIC", "analytics.events"),
		AuditEventsTopic:        getEnv("AUDIT_EVENTS_TOPIC", "audit.events"),

		RunMigrations: parseBool(getEnv("DB_MIGRATIONS_RUN", "true")),
		MigrationFile: getEnv("MIGRATION_FILE", "migrations/0001_init_order_service.sql"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	if len(cfg.JWTAccessSecret) < 32 {
		return Config{}, fmt.Errorf("JWT_ACCESS_SECRET must be at least 32 characters")
	}

	port, err := strconv.Atoi(getEnv("PORT", "3011"))
	if err != nil || port <= 0 {
		return Config{}, fmt.Errorf("invalid PORT")
	}
	cfg.Port = port

	if cfg.APIPrefix == "" {
		cfg.APIPrefix = "api/v1"
	}

	idemTTL, err := strconv.Atoi(getEnv("IDEMPOTENCY_RECORD_TTL_MINUTES", "60"))
	if err != nil || idemTTL < 1 {
		return Config{}, fmt.Errorf("IDEMPOTENCY_RECORD_TTL_MINUTES must be >= 1")
	}
	cfg.IdempotencyRecordTTLMinutes = idemTTL

	idemLockTTL, err := strconv.Atoi(getEnv("IDEMPOTENCY_LOCK_TTL_SECONDS", "30"))
	if err != nil || idemLockTTL < 5 {
		return Config{}, fmt.Errorf("IDEMPOTENCY_LOCK_TTL_SECONDS must be >= 5")
	}
	cfg.IdempotencyLockTTLSeconds = idemLockTTL

	dependencyTimeoutMs, err := strconv.Atoi(getEnv("DEPENDENCY_TIMEOUT_MS", "5000"))
	if err != nil || dependencyTimeoutMs < 100 {
		return Config{}, fmt.Errorf("DEPENDENCY_TIMEOUT_MS must be >= 100")
	}
	cfg.DependencyTimeout = time.Duration(dependencyTimeoutMs) * time.Millisecond

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
