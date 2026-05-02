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
	MongoURI        string
	MongoDatabase   string
	RedisEnabled    bool
	RedisURL        string
	JWTAccessSecret string
}

func Load() (Config, error) {
	cfg := Config{
		AppName:         getEnv("APP_NAME", "review-service"),
		AppEnv:          getEnv("APP_ENV", "development"),
		APIPrefix:       getEnv("API_PREFIX", "api/v1"),
		MongoURI:        strings.TrimSpace(os.Getenv("MONGODB_URI")),
		MongoDatabase:   strings.TrimSpace(getEnv("MONGODB_DATABASE", "ecommerce_review")),
		RedisEnabled:    parseBool(getEnv("REDIS_ENABLED", "false")),
		RedisURL:        strings.TrimSpace(os.Getenv("REDIS_URL")),
		JWTAccessSecret: strings.TrimSpace(os.Getenv("JWT_ACCESS_SECRET")),
	}

	portStr := getEnv("PORT", "3009")
	port, err := strconv.Atoi(portStr)
	if err != nil || port <= 0 {
		return Config{}, fmt.Errorf("invalid PORT: %s", portStr)
	}
	cfg.Port = port

	if cfg.MongoURI == "" {
		return Config{}, fmt.Errorf("MONGODB_URI is required")
	}
	if len(cfg.JWTAccessSecret) < 32 {
		return Config{}, fmt.Errorf("JWT_ACCESS_SECRET must have at least 32 characters")
	}
	if cfg.RedisEnabled && cfg.RedisURL == "" {
		return Config{}, fmt.Errorf("REDIS_URL is required when REDIS_ENABLED=true")
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
