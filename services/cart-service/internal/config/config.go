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

	CartTTLSeconds      int
	CartMaxQtyPerItem   int
	CartDefaultCurrency string
	CartPersistence     bool

	DependencyValidationEnabled bool
	ProductServiceBaseURL       string
	InventoryServiceBaseURL     string
	DependencyTimeout           time.Duration

	KafkaEnabled    bool
	KafkaClientID   string
	KafkaBrokers    []string
	CartEventsTopic string

	RunMigrations bool
	MigrationFile string
}

func Load() (Config, error) {
	cfg := Config{
		AppName:         getEnv("APP_NAME", "cart-service"),
		AppEnv:          getEnv("APP_ENV", "development"),
		APIPrefix:       strings.Trim(getEnv("API_PREFIX", "api/v1"), "/"),
		DatabaseURL:     strings.TrimSpace(getEnv("DATABASE_URL", "postgresql://ecommerce:ecommerce@localhost:5432/ecommerce")),
		DBSSL:           parseBool(getEnv("DB_SSL", "false")),
		RedisEnabled:    parseBool(getEnv("REDIS_ENABLED", "true")),
		RedisURL:        strings.TrimSpace(getEnv("REDIS_URL", "redis://localhost:6379")),
		JWTAccessSecret: strings.TrimSpace(os.Getenv("JWT_ACCESS_SECRET")),

		KafkaEnabled:    parseBool(getEnv("KAFKA_ENABLED", "false")),
		KafkaClientID:   getEnv("KAFKA_CLIENT_ID", "cart-service"),
		KafkaBrokers:    parseCSV(getEnv("KAFKA_BROKERS", "localhost:9092")),
		CartEventsTopic: getEnv("CART_EVENTS_TOPIC", "cart.events"),

		RunMigrations: parseBool(getEnv("DB_MIGRATIONS_RUN", "true")),
		MigrationFile: getEnv("MIGRATION_FILE", "migrations/0001_init_cart_service.sql"),

		CartPersistence:             parseBool(getEnv("CART_PERSISTENCE_ENABLED", "false")),
		DependencyValidationEnabled: parseBool(getEnv("CART_VALIDATE_EXTERNAL", "true")),
		ProductServiceBaseURL:       strings.TrimSpace(os.Getenv("PRODUCT_SERVICE_BASE_URL")),
		InventoryServiceBaseURL:     strings.TrimSpace(os.Getenv("INVENTORY_SERVICE_BASE_URL")),
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

	ttlSeconds, err := strconv.Atoi(getEnv("CART_TTL_SECONDS", "259200"))
	if err != nil || ttlSeconds < 60 {
		return Config{}, fmt.Errorf("CART_TTL_SECONDS must be >= 60")
	}
	cfg.CartTTLSeconds = ttlSeconds

	maxQty, err := strconv.Atoi(getEnv("CART_MAX_QTY_PER_ITEM", "99"))
	if err != nil || maxQty < 1 || maxQty > 10000 {
		return Config{}, fmt.Errorf("CART_MAX_QTY_PER_ITEM must be between 1 and 10000")
	}
	cfg.CartMaxQtyPerItem = maxQty

	cfg.CartDefaultCurrency = strings.ToUpper(strings.TrimSpace(getEnv("CART_DEFAULT_CURRENCY", "USD")))
	if len(cfg.CartDefaultCurrency) != 3 {
		return Config{}, fmt.Errorf("CART_DEFAULT_CURRENCY must be a 3-letter code")
	}

	timeoutMs, err := strconv.Atoi(getEnv("DEPENDENCY_TIMEOUT_MS", "5000"))
	if err != nil || timeoutMs < 100 || timeoutMs > 30000 {
		return Config{}, fmt.Errorf("DEPENDENCY_TIMEOUT_MS must be between 100 and 30000")
	}
	cfg.DependencyTimeout = time.Duration(timeoutMs) * time.Millisecond

	if cfg.RedisEnabled && cfg.RedisURL == "" {
		return Config{}, fmt.Errorf("REDIS_URL is required when REDIS_ENABLED=true")
	}
	if cfg.CartPersistence && cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required when CART_PERSISTENCE_ENABLED=true")
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
