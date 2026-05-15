package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	AppName              string
	AppEnv               string
	Port                 int
	APIPrefix            string
	MongoURI             string
	MongoDatabase        string
	RedisEnabled         bool
	RedisURL             string
	JWTAccessSecret      string
	MediaPublicBaseURL   string
	KafkaEnabled         bool
	KafkaClientID        string
	KafkaBrokers         []string
	ProductEventsTopic   string
	AnalyticsEventsTopic string
	AuditEventsTopic     string
	SearchEnabled        bool
	OpenSearchURL        string
	OpenSearchIndex      string
	OpenSearchUsername   string
	OpenSearchPassword   string
	OpenSearchTimeoutMS  int
}

func Load() (Config, error) {
	cfg := Config{
		AppName:              getEnv("APP_NAME", "product-service"),
		AppEnv:               getEnv("APP_ENV", "development"),
		APIPrefix:            strings.Trim(getEnv("API_PREFIX", "api/v1"), "/"),
		MongoURI:             strings.TrimSpace(firstEnv("DATABASE_URL", "MONGODB_URI")),
		MongoDatabase:        getEnv("DATABASE_NAME", firstEnv("MONGODB_DATABASE")),
		RedisEnabled:         parseBool(getEnv("REDIS_ENABLED", "false")),
		RedisURL:             strings.TrimSpace(os.Getenv("REDIS_URL")),
		JWTAccessSecret:      strings.TrimSpace(os.Getenv("JWT_ACCESS_SECRET")),
		MediaPublicBaseURL:   strings.TrimRight(getEnv("MEDIA_PUBLIC_BASE_URL", "http://localhost:12030/ecommerce-media"), "/"),
		KafkaEnabled:         parseBool(getEnv("KAFKA_ENABLED", "false")),
		KafkaClientID:        getEnv("KAFKA_CLIENT_ID", "product-service"),
		KafkaBrokers:         splitCSV(getEnv("KAFKA_BROKERS", "localhost:9092")),
		ProductEventsTopic:   getEnv("PRODUCT_EVENTS_TOPIC", "product.events"),
		AnalyticsEventsTopic: getEnv("ANALYTICS_EVENTS_TOPIC", "analytics.events"),
		AuditEventsTopic:     getEnv("AUDIT_EVENTS_TOPIC", "audit.events"),
		SearchEnabled:        parseBool(getEnv("SEARCH_ENABLED", "false")),
		OpenSearchURL:        strings.TrimRight(strings.TrimSpace(os.Getenv("OPENSEARCH_URL")), "/"),
		OpenSearchIndex:      getEnv("OPENSEARCH_INDEX", "products"),
		OpenSearchUsername:   strings.TrimSpace(os.Getenv("OPENSEARCH_USERNAME")),
		OpenSearchPassword:   strings.TrimSpace(os.Getenv("OPENSEARCH_PASSWORD")),
	}
	if cfg.MongoDatabase == "" {
		cfg.MongoDatabase = "ecommerce_product"
	}

	port, err := strconv.Atoi(getEnv("PORT", "3003"))
	if err != nil || port <= 0 {
		return Config{}, fmt.Errorf("invalid PORT")
	}
	cfg.Port = port

	timeout, err := strconv.Atoi(getEnv("OPENSEARCH_TIMEOUT_MS", "5000"))
	if err != nil || timeout < 1000 {
		return Config{}, fmt.Errorf("OPENSEARCH_TIMEOUT_MS must be at least 1000")
	}
	cfg.OpenSearchTimeoutMS = timeout

	if cfg.AppEnv != "development" && cfg.AppEnv != "staging" && cfg.AppEnv != "production" {
		return Config{}, fmt.Errorf("APP_ENV must be development, staging, or production")
	}
	if cfg.MongoURI == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	if len(cfg.JWTAccessSecret) < 32 {
		return Config{}, fmt.Errorf("JWT_ACCESS_SECRET must have at least 32 characters")
	}
	if cfg.RedisEnabled && cfg.RedisURL == "" {
		return Config{}, fmt.Errorf("REDIS_URL is required when REDIS_ENABLED=true")
	}
	if cfg.SearchEnabled && cfg.OpenSearchURL == "" {
		return Config{}, fmt.Errorf("OPENSEARCH_URL is required when SEARCH_ENABLED=true")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func firstEnv(keys ...string) string {
	for _, key := range keys {
		if v := strings.TrimSpace(os.Getenv(key)); v != "" {
			return v
		}
	}
	return ""
}

func parseBool(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "y":
		return true
	default:
		return false
	}
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	if len(out) == 0 {
		return []string{"localhost:9092"}
	}
	return out
}
