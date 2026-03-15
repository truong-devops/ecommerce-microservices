package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	ServiceAuth         = "auth"
	ServiceUser         = "user"
	ServiceProduct      = "product"
	ServiceCart         = "cart"
	ServiceOrder        = "order"
	ServicePayment      = "payment"
	ServiceInventory    = "inventory"
	ServiceShipping     = "shipping"
	ServiceReview       = "review"
	ServiceNotification = "notification"
	ServiceAnalytics    = "analytics"
)

type Config struct {
	AppName            string
	AppEnv             string
	Port               string
	JWTSecret          string
	CORSAllowedOrigins []string
	Server             ServerConfig
	RateLimit          RateLimitConfig
	Services           map[string]ServiceConfig
}

type ServerConfig struct {
	RequestTimeout  time.Duration
	ShutdownTimeout time.Duration
}

type RateLimitConfig struct {
	RPS   float64
	Burst int
}

type ServiceConfig struct {
	Name    string
	URL     string
	Timeout time.Duration
}

func Load() (*Config, error) {
	appName, err := requiredEnv("APP_NAME")
	if err != nil {
		return nil, err
	}

	jwtSecret, err := requiredEnv("JWT_SECRET")
	if err != nil {
		return nil, err
	}

	requestTimeout, err := parseDurationEnv("REQUEST_TIMEOUT", 30*time.Second)
	if err != nil {
		return nil, err
	}

	shutdownTimeout, err := parseDurationEnv("SHUTDOWN_TIMEOUT", 15*time.Second)
	if err != nil {
		return nil, err
	}

	rateLimitRPS, err := parseFloatEnv("RATE_LIMIT_RPS", 50)
	if err != nil {
		return nil, err
	}

	rateLimitBurst, err := parseIntEnv("RATE_LIMIT_BURST", 100)
	if err != nil {
		return nil, err
	}

	cfg := &Config{
		AppName:            appName,
		AppEnv:             getEnv("APP_ENV", "development"),
		Port:               getEnv("PORT", "8080"),
		JWTSecret:          jwtSecret,
		CORSAllowedOrigins: splitCSV(getEnv("CORS_ALLOWED_ORIGINS", "*")),
		Server: ServerConfig{
			RequestTimeout:  requestTimeout,
			ShutdownTimeout: shutdownTimeout,
		},
		RateLimit: RateLimitConfig{
			RPS:   rateLimitRPS,
			Burst: rateLimitBurst,
		},
		Services: map[string]ServiceConfig{},
	}

	serviceEnvs := []struct {
		key        string
		urlEnv     string
		timeoutEnv string
	}{
		{ServiceAuth, "AUTH_SERVICE_URL", "AUTH_SERVICE_TIMEOUT"},
		{ServiceUser, "USER_SERVICE_URL", "USER_SERVICE_TIMEOUT"},
		{ServiceProduct, "PRODUCT_SERVICE_URL", "PRODUCT_SERVICE_TIMEOUT"},
		{ServiceCart, "CART_SERVICE_URL", "CART_SERVICE_TIMEOUT"},
		{ServiceOrder, "ORDER_SERVICE_URL", "ORDER_SERVICE_TIMEOUT"},
		{ServicePayment, "PAYMENT_SERVICE_URL", "PAYMENT_SERVICE_TIMEOUT"},
		{ServiceInventory, "INVENTORY_SERVICE_URL", "INVENTORY_SERVICE_TIMEOUT"},
		{ServiceShipping, "SHIPPING_SERVICE_URL", "SHIPPING_SERVICE_TIMEOUT"},
		{ServiceReview, "REVIEW_SERVICE_URL", "REVIEW_SERVICE_TIMEOUT"},
		{ServiceNotification, "NOTIFICATION_SERVICE_URL", "NOTIFICATION_SERVICE_TIMEOUT"},
		{ServiceAnalytics, "ANALYTICS_SERVICE_URL", "ANALYTICS_SERVICE_TIMEOUT"},
	}

	for _, svc := range serviceEnvs {
		serviceURL, err := requiredEnv(svc.urlEnv)
		if err != nil {
			return nil, err
		}
		if _, err := url.ParseRequestURI(serviceURL); err != nil {
			return nil, fmt.Errorf("invalid %s: %w", svc.urlEnv, err)
		}

		timeout, err := parseDurationEnv(svc.timeoutEnv, 10*time.Second)
		if err != nil {
			return nil, err
		}

		cfg.Services[svc.key] = ServiceConfig{
			Name:    svc.key,
			URL:     serviceURL,
			Timeout: timeout,
		}
	}

	return cfg, nil
}

func requiredEnv(key string) (string, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return "", fmt.Errorf("missing required env var %s", key)
	}
	return value, nil
}

func getEnv(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func splitCSV(raw string) []string {
	parts := strings.Split(raw, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		v := strings.TrimSpace(p)
		if v != "" {
			result = append(result, v)
		}
	}
	if len(result) == 0 {
		return []string{"*"}
	}
	return result
}

func parseDurationEnv(key string, fallback time.Duration) (time.Duration, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	d, err := time.ParseDuration(value)
	if err != nil {
		return 0, fmt.Errorf("invalid duration %s=%q: %w", key, value, err)
	}
	return d, nil
}

func parseFloatEnv(key string, fallback float64) (float64, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	v, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid float %s=%q: %w", key, value, err)
	}
	return v, nil
}

func parseIntEnv(key string, fallback int) (int, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	v, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("invalid int %s=%q: %w", key, value, err)
	}
	return v, nil
}
