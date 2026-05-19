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

	RecommendationEnabled            bool
	RecommendationTrainingEnabled    bool
	RecommendationTrainingHour       int
	RecommendationWindowDays         int
	RecommendationMinSupportCount    int
	RecommendationMinConfidence      float64
	RecommendationMaxAntecedentSize  int
	RecommendationMaxRules           int
	RecommendationOrderFetchPageSize int
	OrderServiceBaseURL              string
	OrderServiceInternalToken        string
	DependencyTimeout                time.Duration
}

func Load() (Config, error) {
	cfg := Config{
		AppName:                       getEnv("APP_NAME", "analytics-service"),
		AppEnv:                        getEnv("APP_ENV", "development"),
		APIPrefix:                     strings.Trim(getEnv("API_PREFIX", "api/v1"), "/"),
		DatabaseURL:                   strings.TrimSpace(os.Getenv("DATABASE_URL")),
		DBSSL:                         parseBool(getEnv("DB_SSL", "false")),
		RedisEnabled:                  parseBool(getEnv("REDIS_ENABLED", "false")),
		RedisURL:                      strings.TrimSpace(os.Getenv("REDIS_URL")),
		JWTAccessSecret:               strings.TrimSpace(os.Getenv("JWT_ACCESS_SECRET")),
		KafkaEnabled:                  parseBool(getEnv("KAFKA_ENABLED", "true")),
		KafkaClientID:                 getEnv("KAFKA_CLIENT_ID", "analytics-service"),
		KafkaBrokers:                  parseCSV(getEnv("KAFKA_BROKERS", "localhost:9092")),
		KafkaTopic:                    getEnv("ANALYTICS_EVENTS_TOPIC", "analytics.events"),
		KafkaGroup:                    getEnv("ANALYTICS_CONSUMER_GROUP", "analytics-service-group"),
		RecommendationEnabled:         parseBool(getEnv("RECOMMENDATION_ENABLED", "true")),
		RecommendationTrainingEnabled: parseBool(getEnv("RECOMMENDATION_TRAINING_ENABLED", "false")),
		OrderServiceBaseURL:           strings.TrimRight(strings.TrimSpace(getEnv("ORDER_SERVICE_BASE_URL", "http://order-service:8080")), "/"),
		OrderServiceInternalToken:     strings.TrimSpace(os.Getenv("ORDER_SERVICE_INTERNAL_TOKEN")),
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

	cfg.RecommendationTrainingHour, err = strconv.Atoi(getEnv("RECOMMENDATION_TRAINING_HOUR", "2"))
	if err != nil || cfg.RecommendationTrainingHour < 0 || cfg.RecommendationTrainingHour > 23 {
		return Config{}, fmt.Errorf("RECOMMENDATION_TRAINING_HOUR must be between 0 and 23")
	}
	cfg.RecommendationWindowDays, err = strconv.Atoi(getEnv("RECOMMENDATION_WINDOW_DAYS", "90"))
	if err != nil || cfg.RecommendationWindowDays < 1 || cfg.RecommendationWindowDays > 365 {
		return Config{}, fmt.Errorf("RECOMMENDATION_WINDOW_DAYS must be between 1 and 365")
	}
	cfg.RecommendationMinSupportCount, err = strconv.Atoi(getEnv("RECOMMENDATION_MIN_SUPPORT_COUNT", "3"))
	if err != nil || cfg.RecommendationMinSupportCount < 1 {
		return Config{}, fmt.Errorf("RECOMMENDATION_MIN_SUPPORT_COUNT must be >= 1")
	}
	cfg.RecommendationMinConfidence, err = strconv.ParseFloat(getEnv("RECOMMENDATION_MIN_CONFIDENCE", "0.15"), 64)
	if err != nil || cfg.RecommendationMinConfidence <= 0 || cfg.RecommendationMinConfidence > 1 {
		return Config{}, fmt.Errorf("RECOMMENDATION_MIN_CONFIDENCE must be between 0 and 1")
	}
	cfg.RecommendationMaxAntecedentSize, err = strconv.Atoi(getEnv("RECOMMENDATION_MAX_ANTECEDENT_SIZE", "3"))
	if err != nil || cfg.RecommendationMaxAntecedentSize < 1 || cfg.RecommendationMaxAntecedentSize > 10 {
		return Config{}, fmt.Errorf("RECOMMENDATION_MAX_ANTECEDENT_SIZE must be between 1 and 10")
	}
	cfg.RecommendationMaxRules, err = strconv.Atoi(getEnv("RECOMMENDATION_MAX_RULES", "5000"))
	if err != nil || cfg.RecommendationMaxRules < 1 {
		return Config{}, fmt.Errorf("RECOMMENDATION_MAX_RULES must be >= 1")
	}
	cfg.RecommendationOrderFetchPageSize, err = strconv.Atoi(getEnv("RECOMMENDATION_ORDER_FETCH_PAGE_SIZE", "500"))
	if err != nil || cfg.RecommendationOrderFetchPageSize < 1 || cfg.RecommendationOrderFetchPageSize > 1000 {
		return Config{}, fmt.Errorf("RECOMMENDATION_ORDER_FETCH_PAGE_SIZE must be between 1 and 1000")
	}
	timeoutMs, err := strconv.Atoi(getEnv("DEPENDENCY_TIMEOUT_MS", "5000"))
	if err != nil || timeoutMs < 100 {
		return Config{}, fmt.Errorf("DEPENDENCY_TIMEOUT_MS must be >= 100")
	}
	cfg.DependencyTimeout = time.Duration(timeoutMs) * time.Millisecond

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
