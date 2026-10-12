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

	DatabaseURL     string
	JWTAccessSecret string

	HoldDuration            time.Duration
	ReleaseInterval         time.Duration
	ReleaseBatch            int
	BankEncryptionKey       string
	PayoutEnabled           bool
	PayoutProvider          string
	MockPayoutMode          string
	PayoutMinAmount         int64
	PayoutMaxAmount         int64
	PayoutInterval          time.Duration
	PayoutBatch             int
	PayoutReconcileInterval time.Duration
	PayoutStaleAfter        time.Duration
	PayoutIdempotencyTTL    time.Duration

	KafkaEnabled           bool
	KafkaClientID          string
	KafkaBrokers           []string
	KafkaStartOffset       string
	PaymentEventsTopic     string
	PaymentConsumerGroup   string
	OrderEventsTopic       string
	OrderConsumerGroup     string
	WalletEventsTopic      string
	OutboxDispatchInterval time.Duration
	OutboxBatch            int
	OutboxMaxRetry         int

	RunMigrations bool
	MigrationFile string
}

func Load() (Config, error) {
	cfg := Config{
		AppName:           getEnv("APP_NAME", "wallet-service"),
		AppEnv:            getEnv("APP_ENV", "development"),
		APIPrefix:         strings.Trim(getEnv("API_PREFIX", "api/v1"), "/"),
		DatabaseURL:       strings.TrimSpace(os.Getenv("DATABASE_URL")),
		JWTAccessSecret:   strings.TrimSpace(os.Getenv("JWT_ACCESS_SECRET")),
		BankEncryptionKey: strings.TrimSpace(os.Getenv("BANK_ACCOUNT_ENCRYPTION_KEY")),
		PayoutEnabled:     parseBool(getEnv("PAYOUT_ENABLED", "false")),
		PayoutProvider:    strings.ToLower(getEnv("PAYOUT_PROVIDER", "mock")),
		MockPayoutMode:    strings.ToLower(getEnv("MOCK_PAYOUT_MODE", "success")),

		KafkaEnabled:         parseBool(getEnv("KAFKA_ENABLED", "false")),
		KafkaClientID:        getEnv("KAFKA_CLIENT_ID", "wallet-service"),
		KafkaBrokers:         parseCSV(getEnv("KAFKA_BROKERS", "localhost:9092")),
		KafkaStartOffset:     strings.ToLower(getEnv("KAFKA_START_OFFSET", "first")),
		PaymentEventsTopic:   getEnv("PAYMENT_EVENTS_TOPIC", "payment.events"),
		PaymentConsumerGroup: getEnv("PAYMENT_EVENTS_CONSUMER_GROUP", "wallet-service-payment-events-group"),
		OrderEventsTopic:     getEnv("ORDER_EVENTS_TOPIC", "order.events"),
		OrderConsumerGroup:   getEnv("ORDER_EVENTS_CONSUMER_GROUP", "wallet-service-order-events-group"),
		WalletEventsTopic:    getEnv("WALLET_EVENTS_TOPIC", "wallet.events"),

		RunMigrations: parseBool(getEnv("DB_MIGRATIONS_RUN", "true")),
		MigrationFile: getEnv("MIGRATION_FILE", "migrations/0001_init_wallet_service.sql"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	if len(cfg.JWTAccessSecret) < 32 {
		return Config{}, fmt.Errorf("JWT_ACCESS_SECRET must be at least 32 characters")
	}
	if len(cfg.BankEncryptionKey) < 32 {
		return Config{}, fmt.Errorf("BANK_ACCOUNT_ENCRYPTION_KEY must be at least 32 characters")
	}
	if cfg.PayoutProvider != "mock" {
		return Config{}, fmt.Errorf("PAYOUT_PROVIDER must be mock in phase 2")
	}
	if cfg.MockPayoutMode != "success" && cfg.MockPayoutMode != "failure" && cfg.MockPayoutMode != "pending" {
		return Config{}, fmt.Errorf("MOCK_PAYOUT_MODE must be success, failure, or pending")
	}
	if cfg.APIPrefix == "" {
		cfg.APIPrefix = "api/v1"
	}

	port, err := parseInt("PORT", 3015, 1, 65535)
	if err != nil {
		return Config{}, err
	}
	cfg.Port = port

	holdSeconds, err := parseInt("WALLET_HOLD_DURATION_SECONDS", 60, 1, 31_536_000)
	if err != nil {
		return Config{}, err
	}
	cfg.HoldDuration = time.Duration(holdSeconds) * time.Second

	releaseIntervalMs, err := parseInt("WALLET_RELEASE_INTERVAL_MS", 5000, 500, 3_600_000)
	if err != nil {
		return Config{}, err
	}
	cfg.ReleaseInterval = time.Duration(releaseIntervalMs) * time.Millisecond

	cfg.ReleaseBatch, err = parseInt("WALLET_RELEASE_BATCH_SIZE", 100, 1, 1000)
	if err != nil {
		return Config{}, err
	}
	minAmount, err := parseInt64("PAYOUT_MIN_AMOUNT_VND", 10_000, 1, 1_000_000_000_000)
	if err != nil {
		return Config{}, err
	}
	cfg.PayoutMinAmount = minAmount
	maxAmount, err := parseInt64("PAYOUT_MAX_AMOUNT_VND", 10_000_000, 1, 1_000_000_000_000)
	if err != nil {
		return Config{}, err
	}
	if maxAmount < minAmount {
		return Config{}, fmt.Errorf("PAYOUT_MAX_AMOUNT_VND must be greater than or equal to PAYOUT_MIN_AMOUNT_VND")
	}
	cfg.PayoutMaxAmount = maxAmount
	payoutIntervalMs, err := parseInt("PAYOUT_WORKER_INTERVAL_MS", 2000, 250, 3_600_000)
	if err != nil {
		return Config{}, err
	}
	cfg.PayoutInterval = time.Duration(payoutIntervalMs) * time.Millisecond
	cfg.PayoutBatch, err = parseInt("PAYOUT_WORKER_BATCH_SIZE", 20, 1, 200)
	if err != nil {
		return Config{}, err
	}
	reconcileIntervalMs, err := parseInt("PAYOUT_RECONCILE_INTERVAL_MS", 5000, 500, 3_600_000)
	if err != nil {
		return Config{}, err
	}
	cfg.PayoutReconcileInterval = time.Duration(reconcileIntervalMs) * time.Millisecond
	staleSeconds, err := parseInt("PAYOUT_STALE_AFTER_SECONDS", 30, 1, 86_400)
	if err != nil {
		return Config{}, err
	}
	cfg.PayoutStaleAfter = time.Duration(staleSeconds) * time.Second
	idempotencyHours, err := parseInt("PAYOUT_IDEMPOTENCY_TTL_HOURS", 24, 1, 720)
	if err != nil {
		return Config{}, err
	}
	cfg.PayoutIdempotencyTTL = time.Duration(idempotencyHours) * time.Hour
	cfg.OutboxDispatchInterval = time.Duration(3000) * time.Millisecond
	if value, parseErr := parseInt("OUTBOX_DISPATCH_INTERVAL_MS", 3000, 500, 3_600_000); parseErr != nil {
		return Config{}, parseErr
	} else {
		cfg.OutboxDispatchInterval = time.Duration(value) * time.Millisecond
	}
	cfg.OutboxBatch, err = parseInt("OUTBOX_BATCH_SIZE", 50, 1, 500)
	if err != nil {
		return Config{}, err
	}
	cfg.OutboxMaxRetry, err = parseInt("OUTBOX_MAX_RETRY", 10, 1, 100)
	if err != nil {
		return Config{}, err
	}

	if cfg.KafkaEnabled && len(cfg.KafkaBrokers) == 0 {
		return Config{}, fmt.Errorf("KAFKA_BROKERS is required when KAFKA_ENABLED=true")
	}
	if cfg.KafkaStartOffset != "first" && cfg.KafkaStartOffset != "last" {
		return Config{}, fmt.Errorf("KAFKA_START_OFFSET must be first or last")
	}
	return cfg, nil
}

func parseInt64(key string, fallback, minValue, maxValue int64) (int64, error) {
	raw := getEnv(key, strconv.FormatInt(fallback, 10))
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value < minValue || value > maxValue {
		return 0, fmt.Errorf("%s must be between %d and %d", key, minValue, maxValue)
	}
	return value, nil
}

func getEnv(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func parseBool(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "y":
		return true
	default:
		return false
	}
}

func parseCSV(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if value := strings.TrimSpace(part); value != "" {
			result = append(result, value)
		}
	}
	return result
}

func parseInt(key string, fallback, minValue, maxValue int) (int, error) {
	raw := getEnv(key, strconv.Itoa(fallback))
	value, err := strconv.Atoi(raw)
	if err != nil || value < minValue || value > maxValue {
		return 0, fmt.Errorf("%s must be between %d and %d", key, minValue, maxValue)
	}
	return value, nil
}
