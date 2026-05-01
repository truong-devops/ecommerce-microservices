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
	JWTAccessSecret string
}

func Load() (Config, error) {
	cfg := Config{
		AppName:         getEnv("APP_NAME", "review-service"),
		AppEnv:          getEnv("APP_ENV", "development"),
		APIPrefix:       getEnv("API_PREFIX", "api/v1"),
		MongoURI:        strings.TrimSpace(os.Getenv("MONGODB_URI")),
		MongoDatabase:   strings.TrimSpace(getEnv("MONGODB_DATABASE", "ecommerce_review")),
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

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
