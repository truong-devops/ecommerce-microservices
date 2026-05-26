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

	OrderServiceBaseURL  string
	DependencyTimeout    time.Duration
	WebhookSigningSecret string

	NexusEnabled             bool
	NexusWebhookEnabled      bool
	NexusBaseURL             string
	NexusPartnerCode         string
	NexusAPIKey              string
	NexusAPISecret           string
	NexusWebhookSecret       string
	NexusMerchantMappingFile string
	NexusAutoCreatePickup    bool
	NexusServiceType         string
	NexusPickupType          string
	NexusPaymentPayer        string
	NexusDefaultWeightGram   int
	NexusDefaultLengthCM     int
	NexusDefaultWidthCM      int
	NexusDefaultHeightCM     int
	NexusRequestTimeout      time.Duration

	DispatchInterval time.Duration
	DispatchBatch    int
	DispatchMaxRetry int

	WebhookIdempotencyTTLMinutes int

	KafkaEnabled             bool
	KafkaClientID            string
	KafkaBrokers             []string
	OrderEventsTopic         string
	OrderEventsConsumerGroup string
	ShippingEventsTopic      string
	NotificationEventsTopic  string
	AnalyticsEventsTopic     string

	RunMigrations bool
	MigrationFile string
}

func Load() (Config, error) {
	cfg := Config{
		AppName:         getEnv("APP_NAME", "shipping-service"),
		AppEnv:          getEnv("APP_ENV", "development"),
		APIPrefix:       strings.Trim(getEnv("API_PREFIX", "api/v1"), "/"),
		DatabaseURL:     strings.TrimSpace(os.Getenv("DATABASE_URL")),
		DBSSL:           parseBool(getEnv("DB_SSL", "false")),
		RedisEnabled:    parseBool(getEnv("REDIS_ENABLED", "true")),
		RedisURL:        strings.TrimSpace(os.Getenv("REDIS_URL")),
		JWTAccessSecret: strings.TrimSpace(os.Getenv("JWT_ACCESS_SECRET")),
		OrderServiceBaseURL: strings.TrimRight(
			strings.TrimSpace(getEnv("ORDER_SERVICE_BASE_URL", "http://order-service:8080/api/v1")),
			"/",
		),
		WebhookSigningSecret:     strings.TrimSpace(getEnv("SHIPPING_WEBHOOK_SIGNING_SECRET", "dev-shipping-webhook-signing-secret")),
		NexusEnabled:             parseBool(getEnv("NEXUS_ENABLED", "false")),
		NexusWebhookEnabled:      parseBool(getEnv("NEXUS_WEBHOOK_ENABLED", "false")),
		NexusBaseURL:             strings.TrimRight(getEnv("NEXUS_BASE_URL", "https://ops.nexus-ex.site"), "/"),
		NexusPartnerCode:         strings.TrimSpace(os.Getenv("NEXUS_PARTNER_CODE")),
		NexusAPIKey:              strings.TrimSpace(os.Getenv("NEXUS_API_KEY")),
		NexusAPISecret:           strings.TrimSpace(os.Getenv("NEXUS_API_SECRET")),
		NexusWebhookSecret:       strings.TrimSpace(os.Getenv("NEXUS_WEBHOOK_SECRET")),
		NexusMerchantMappingFile: strings.TrimSpace(os.Getenv("NEXUS_MERCHANT_MAPPING_FILE")),
		NexusAutoCreatePickup:    parseBool(getEnv("NEXUS_AUTO_CREATE_PICKUP", "false")),
		NexusServiceType:         strings.ToUpper(getEnv("NEXUS_DEFAULT_SERVICE_TYPE", "STANDARD")),
		NexusPickupType:          strings.ToUpper(getEnv("NEXUS_DEFAULT_PICKUP_TYPE", "PICKUP")),
		NexusPaymentPayer:        strings.ToUpper(getEnv("NEXUS_DEFAULT_PAYER", "RECEIVER")),
		NexusDefaultWeightGram:   500,
		NexusDefaultLengthCM:     20,
		NexusDefaultWidthCM:      15,
		NexusDefaultHeightCM:     10,
		NexusRequestTimeout:      10 * time.Second,

		DispatchInterval: 3 * time.Second,
		DispatchBatch:    50,
		DispatchMaxRetry: 10,

		WebhookIdempotencyTTLMinutes: 1440,

		KafkaEnabled:             parseBool(getEnv("KAFKA_ENABLED", "true")),
		KafkaClientID:            getEnv("KAFKA_CLIENT_ID", "shipping-service"),
		KafkaBrokers:             parseCSV(getEnv("KAFKA_BROKERS", "localhost:9092")),
		OrderEventsTopic:         getEnv("ORDER_EVENTS_TOPIC", "order.events"),
		OrderEventsConsumerGroup: getEnv("ORDER_EVENTS_CONSUMER_GROUP", "shipping-service-order-events-group"),
		ShippingEventsTopic:      getEnv("SHIPPING_EVENTS_TOPIC", "shipping.events"),
		NotificationEventsTopic:  getEnv("NOTIFICATION_EVENTS_TOPIC", "notification.events"),
		AnalyticsEventsTopic:     getEnv("ANALYTICS_EVENTS_TOPIC", "analytics.events"),

		RunMigrations: parseBool(getEnv("DB_MIGRATIONS_RUN", "true")),
		MigrationFile: getEnv("MIGRATION_FILE", "migrations/0001_init_shipping_service.sql"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	if len(cfg.JWTAccessSecret) < 32 {
		return Config{}, fmt.Errorf("JWT_ACCESS_SECRET must be at least 32 characters")
	}

	port, err := strconv.Atoi(getEnv("PORT", "3013"))
	if err != nil || port <= 0 {
		return Config{}, fmt.Errorf("invalid PORT")
	}
	cfg.Port = port

	intervalMs, err := strconv.Atoi(getEnv("OUTBOX_DISPATCH_INTERVAL_MS", "3000"))
	if err != nil || intervalMs < 500 {
		return Config{}, fmt.Errorf("OUTBOX_DISPATCH_INTERVAL_MS must be >= 500")
	}
	cfg.DispatchInterval = time.Duration(intervalMs) * time.Millisecond

	batchSize, err := strconv.Atoi(getEnv("OUTBOX_BATCH_SIZE", "50"))
	if err != nil || batchSize < 1 || batchSize > 500 {
		return Config{}, fmt.Errorf("OUTBOX_BATCH_SIZE must be between 1 and 500")
	}
	cfg.DispatchBatch = batchSize

	maxRetry, err := strconv.Atoi(getEnv("OUTBOX_MAX_RETRY", "10"))
	if err != nil || maxRetry < 1 || maxRetry > 100 {
		return Config{}, fmt.Errorf("OUTBOX_MAX_RETRY must be between 1 and 100")
	}
	cfg.DispatchMaxRetry = maxRetry

	webhookTTL, err := strconv.Atoi(getEnv("WEBHOOK_IDEMPOTENCY_TTL_MINUTES", "1440"))
	if err != nil || webhookTTL < 5 {
		return Config{}, fmt.Errorf("WEBHOOK_IDEMPOTENCY_TTL_MINUTES must be >= 5")
	}
	cfg.WebhookIdempotencyTTLMinutes = webhookTTL

	dependencyTimeoutMs, err := strconv.Atoi(getEnv("DEPENDENCY_TIMEOUT_MS", "5000"))
	if err != nil || dependencyTimeoutMs < 100 || dependencyTimeoutMs > 30000 {
		return Config{}, fmt.Errorf("DEPENDENCY_TIMEOUT_MS must be between 100 and 30000")
	}
	cfg.DependencyTimeout = time.Duration(dependencyTimeoutMs) * time.Millisecond
	nexusTimeoutMs, err := strconv.Atoi(getEnv("NEXUS_REQUEST_TIMEOUT_MS", "10000"))
	if err != nil || nexusTimeoutMs < 100 || nexusTimeoutMs > 30000 {
		return Config{}, fmt.Errorf("NEXUS_REQUEST_TIMEOUT_MS must be between 100 and 30000")
	}
	cfg.NexusRequestTimeout = time.Duration(nexusTimeoutMs) * time.Millisecond

	if len(cfg.WebhookSigningSecret) < 16 {
		return Config{}, fmt.Errorf("SHIPPING_WEBHOOK_SIGNING_SECRET must be at least 16 characters")
	}
	if cfg.NexusEnabled {
		if cfg.NexusBaseURL == "" || cfg.NexusPartnerCode == "" || cfg.NexusAPIKey == "" || len(cfg.NexusAPISecret) < 16 || len(cfg.NexusWebhookSecret) < 16 || cfg.NexusMerchantMappingFile == "" {
			return Config{}, fmt.Errorf("NEXUS_BASE_URL, NEXUS_PARTNER_CODE, NEXUS_API_KEY, NEXUS_API_SECRET, NEXUS_WEBHOOK_SECRET and NEXUS_MERCHANT_MAPPING_FILE are required when NEXUS_ENABLED=true")
		}
	}
	if cfg.NexusWebhookEnabled && (cfg.NexusPartnerCode == "" || len(cfg.NexusWebhookSecret) < 16) {
		return Config{}, fmt.Errorf("NEXUS_PARTNER_CODE and NEXUS_WEBHOOK_SECRET are required when NEXUS_WEBHOOK_ENABLED=true")
	}

	for key, target := range map[string]*int{
		"NEXUS_DEFAULT_WEIGHT_GRAM": &cfg.NexusDefaultWeightGram,
		"NEXUS_DEFAULT_LENGTH_CM":   &cfg.NexusDefaultLengthCM,
		"NEXUS_DEFAULT_WIDTH_CM":    &cfg.NexusDefaultWidthCM,
		"NEXUS_DEFAULT_HEIGHT_CM":   &cfg.NexusDefaultHeightCM,
	} {
		value, parseErr := strconv.Atoi(getEnv(key, strconv.Itoa(*target)))
		if parseErr != nil || value <= 0 {
			return Config{}, fmt.Errorf("%s must be a positive integer", key)
		}
		*target = value
	}

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
