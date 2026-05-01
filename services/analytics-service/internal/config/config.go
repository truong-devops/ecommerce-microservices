package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	AppName   string
	AppEnv    string
	Port      int
	APIPrefix string

	DatabaseURL string
	DBSSL       bool
	DBPoolMax   int

	RedisEnabled bool
	RedisURL     string

	JWTAccessSecret string

	KafkaEnabled  bool
	KafkaClientID string
	KafkaBrokers  []string
	KafkaTopic    string
	KafkaGroup    string

	IngestDedupeTTLSeconds int
}

func Load() (Config, error) {
	cfg := Config{
		AppName:         getEnv("APP_NAME", "analytics-service"),
		AppEnv:          getEnv("APP_ENV", "development"),
		APIPrefix:       strings.Trim(getEnv("API_PREFIX", "api/v1"), "/"),
		DatabaseURL:     strings.TrimSpace(os.Getenv("DATABASE_URL")),
		DBSSL:           parseBool(getEnv("DB_SSL", "false")),
		RedisEnabled:    parseBool(getEnv("REDIS_ENABLED", "false")),
		RedisURL:        strings.TrimSpace(os.Getenv("REDIS_URL")),
		JWTAccessSecret: strings.TrimSpace(os.Getenv("JWT_ACCESS_SECRET")),
		KafkaEnabled:    parseBool(getEnv("KAFKA_ENABLED", "true")),
		KafkaClientID:   getEnv("KAFKA_CLIENT_ID", "analytics-service"),
		KafkaBrokers:    parseCSV(getEnv("KAFKA_BROKERS", "localhost:9092")),
		KafkaTopic:      getEnv("ANALYTICS_EVENTS_TOPIC", "analytics.events"),
		KafkaGroup:      getEnv("ANALYTICS_CONSUMER_GROUP", "analytics-service-group"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}

	if len(cfg.JWTAccessSecret) < 32 {
		return Config{}, fmt.Errorf("JWT_ACCESS_SECRET must be at least 32 characters")
	}

	port, err := strconv.Atoi(getEnv("PORT", "3010"))
	if err != nil || port <= 0 {
		return Config{}, fmt.Errorf("invalid PORT")
	}
	cfg.Port = port

	if cfg.APIPrefix == "" {
		cfg.APIPrefix = "api/v1"
	}

	poolMax, err := strconv.Atoi(getEnv("DB_POOL_MAX", "10"))
	if err != nil || poolMax < 1 || poolMax > 100 {
		return Config{}, fmt.Errorf("DB_POOL_MAX must be between 1 and 100")
	}
	cfg.DBPoolMax = poolMax

	ttl, err := strconv.Atoi(getEnv("INGEST_DEDUPE_TTL_SECONDS", "172800"))
	if err != nil || ttl < 60 {
		return Config{}, fmt.Errorf("INGEST_DEDUPE_TTL_SECONDS must be >= 60")
	}
	cfg.IngestDedupeTTLSeconds = ttl

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
