package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	AppName         string
	AppEnv          string
	Port            int
	APIPrefix       string
	DatabaseURL     string
	RedisEnabled    bool
	RedisURL        string
	JWTAccessSecret string
	MigrationFile   string
	RunMigrations   bool
	KafkaEnabled    bool
	KafkaClientID   string
	KafkaBrokers    []string
	KafkaUserTopic  string
}

func Load() (Config, error) {
	cfg := Config{
		AppName:         getEnvWithFallback("SERVICE_NAME", "APP_NAME", "user-service"),
		AppEnv:          getEnvWithFallback("NODE_ENV", "APP_ENV", "development"),
		APIPrefix:       strings.Trim(getEnv("API_PREFIX", "api/v1"), "/"),
		DatabaseURL:     strings.TrimSpace(os.Getenv("DATABASE_URL")),
		RedisEnabled:    parseBool(getEnv("REDIS_ENABLED", "false")),
		RedisURL:        strings.TrimSpace(os.Getenv("REDIS_URL")),
		JWTAccessSecret: strings.TrimSpace(os.Getenv("JWT_ACCESS_SECRET")),
		MigrationFile:   getEnv("MIGRATION_FILE", "migrations/0001_init_user_service_go.sql"),
		RunMigrations:   parseBool(getEnv("DB_MIGRATIONS_RUN", "true")),
		KafkaClientID:   getEnv("KAFKA_CLIENT_ID", "user-service"),
		KafkaUserTopic:  getEnv("KAFKA_USER_TOPIC", "user.registered"),
	}

	portStr := getEnv("PORT", "3000")
	port, err := strconv.Atoi(portStr)
	if err != nil || port <= 0 {
		return Config{}, fmt.Errorf("invalid PORT: %s", portStr)
	}
	cfg.Port = port

	if cfg.DatabaseURL == "" {
		cfg.DatabaseURL, err = buildPostgresURLFromDBEnv()
		if err != nil {
			return Config{}, err
		}
	}

	if cfg.APIPrefix == "" {
		cfg.APIPrefix = "api/v1"
	}
	if len(cfg.JWTAccessSecret) < 32 {
		return Config{}, fmt.Errorf("JWT_ACCESS_SECRET must be at least 32 characters")
	}
	if cfg.RedisEnabled && cfg.RedisURL == "" {
		return Config{}, fmt.Errorf("REDIS_URL is required when REDIS_ENABLED=true")
	}

	cfg.KafkaEnabled = parseBool(getEnv("KAFKA_ENABLED", "false"))
	cfg.KafkaBrokers = parseCSV(getEnv("KAFKA_BROKERS", ""))

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func getEnvWithFallback(primaryKey, secondaryKey, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(primaryKey)); v != "" {
		return v
	}
	if v := strings.TrimSpace(os.Getenv(secondaryKey)); v != "" {
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
	if strings.TrimSpace(v) == "" {
		return nil
	}
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

func buildPostgresURLFromDBEnv() (string, error) {
	dbHost := strings.TrimSpace(os.Getenv("DB_HOST"))
	dbUser := strings.TrimSpace(os.Getenv("DB_USERNAME"))
	dbName := strings.TrimSpace(os.Getenv("DB_NAME"))

	if dbHost == "" || dbUser == "" || dbName == "" {
		return "", fmt.Errorf("DATABASE_URL is required (or set DB_HOST, DB_USERNAME, DB_NAME)")
	}

	dbPort := getEnv("DB_PORT", "5432")
	dbPassword := os.Getenv("DB_PASSWORD")
	sslMode := "disable"
	if parseBool(getEnv("DB_SSL", "false")) {
		sslMode = "require"
	}

	return fmt.Sprintf(
		"postgresql://%s:%s@%s:%s/%s?sslmode=%s",
		dbUser,
		dbPassword,
		dbHost,
		dbPort,
		dbName,
		sslMode,
	), nil
}
