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

	JWTAccessSecret string

	MinIOEndpoint   string
	MinIOAccessKey  string
	MinIOSecretKey  string
	MinIOBucket     string
	MinIOUseSSL     bool
	ObjectKeyPrefix string

	DefaultUploadExpirySeconds   int
	DefaultDownloadExpirySeconds int
	MaxExpirySeconds             int
}

func Load() (Config, error) {
	cfg := Config{
		AppName:         getEnv("APP_NAME", "media-service"),
		AppEnv:          getEnv("APP_ENV", "development"),
		APIPrefix:       strings.Trim(getEnv("API_PREFIX", "api/v1"), "/"),
		JWTAccessSecret: strings.TrimSpace(os.Getenv("JWT_ACCESS_SECRET")),

		MinIOEndpoint:   strings.TrimSpace(os.Getenv("MINIO_ENDPOINT")),
		MinIOAccessKey:  strings.TrimSpace(os.Getenv("MINIO_ACCESS_KEY")),
		MinIOSecretKey:  strings.TrimSpace(os.Getenv("MINIO_SECRET_KEY")),
		MinIOBucket:     getEnv("MINIO_BUCKET", "ecommerce-media"),
		MinIOUseSSL:     parseBool(getEnv("MINIO_USE_SSL", "false")),
		ObjectKeyPrefix: strings.Trim(strings.TrimSpace(getEnv("OBJECT_KEY_PREFIX", "products")), "/"),

		DefaultUploadExpirySeconds:   900,
		DefaultDownloadExpirySeconds: 900,
		MaxExpirySeconds:             3600,
	}

	port, err := strconv.Atoi(getEnv("PORT", "8080"))
	if err != nil || port <= 0 {
		return Config{}, fmt.Errorf("invalid PORT")
	}
	cfg.Port = port

	if len(cfg.JWTAccessSecret) < 32 {
		return Config{}, fmt.Errorf("JWT_ACCESS_SECRET must be at least 32 characters")
	}
	if cfg.MinIOEndpoint == "" {
		return Config{}, fmt.Errorf("MINIO_ENDPOINT is required")
	}
	if cfg.MinIOAccessKey == "" {
		return Config{}, fmt.Errorf("MINIO_ACCESS_KEY is required")
	}
	if cfg.MinIOSecretKey == "" {
		return Config{}, fmt.Errorf("MINIO_SECRET_KEY is required")
	}
	if cfg.MinIOBucket == "" {
		return Config{}, fmt.Errorf("MINIO_BUCKET is required")
	}
	if cfg.ObjectKeyPrefix == "" {
		return Config{}, fmt.Errorf("OBJECT_KEY_PREFIX is required")
	}

	if value := strings.TrimSpace(os.Getenv("MEDIA_UPLOAD_DEFAULT_EXPIRY_SECONDS")); value != "" {
		expirySeconds, convErr := strconv.Atoi(value)
		if convErr != nil || expirySeconds < 60 || expirySeconds > cfg.MaxExpirySeconds {
			return Config{}, fmt.Errorf("MEDIA_UPLOAD_DEFAULT_EXPIRY_SECONDS must be between 60 and %d", cfg.MaxExpirySeconds)
		}
		cfg.DefaultUploadExpirySeconds = expirySeconds
	}

	if value := strings.TrimSpace(os.Getenv("MEDIA_DOWNLOAD_DEFAULT_EXPIRY_SECONDS")); value != "" {
		expirySeconds, convErr := strconv.Atoi(value)
		if convErr != nil || expirySeconds < 60 || expirySeconds > cfg.MaxExpirySeconds {
			return Config{}, fmt.Errorf("MEDIA_DOWNLOAD_DEFAULT_EXPIRY_SECONDS must be between 60 and %d", cfg.MaxExpirySeconds)
		}
		cfg.DefaultDownloadExpirySeconds = expirySeconds
	}

	if value := strings.TrimSpace(os.Getenv("MEDIA_MAX_EXPIRY_SECONDS")); value != "" {
		maxExpiry, convErr := strconv.Atoi(value)
		if convErr != nil || maxExpiry < 60 || maxExpiry > 24*60*60 {
			return Config{}, fmt.Errorf("MEDIA_MAX_EXPIRY_SECONDS must be between 60 and 86400")
		}
		cfg.MaxExpirySeconds = maxExpiry
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
