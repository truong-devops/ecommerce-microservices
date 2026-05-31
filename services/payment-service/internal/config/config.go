package config

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
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

	RedisEnabled bool
	RedisURL     string

	JWTAccessSecret string

	OrderServiceBaseURL string
	DependencyTimeout   time.Duration

	IdempotencyRecordTTLMinutes int
	IdempotencyLockTTLSeconds   int
	WebhookIdempotencyTTLMin    int

	DispatchInterval time.Duration
	DispatchBatch    int
	DispatchMaxRetry int

	GatewayProvider string
	SePay           SePayConfig

	PaymentExpiryEnabled  bool
	PaymentExpiryInterval time.Duration
	PaymentExpiryBatch    int

	KafkaEnabled  bool
	KafkaClientID string
	KafkaBrokers  []string

	OrderEventsTopic         string
	OrderEventsConsumerGroup string
	PaymentEventsTopic       string
	NotificationEventsTopic  string
	AnalyticsEventsTopic     string

	RunMigrations bool
	MigrationFile string
}

type SePayConfig struct {
	Environment                 string
	BankCode                    string
	BankAccountNumber           string
	BankAccountName             string
	AllowedAccountNumbers       []string
	PaymentCodePrefix           string
	TransferDescriptionTemplate string
	QRTemplate                  string
	PaymentExpiresMinutes       int
	WebhookAuthMode             string
	WebhookSecret               string
	WebhookSecrets              []string
	WebhookAPIKey               string
	TimestampToleranceSeconds   int
	APIBaseURL                  string
	APIToken                    string
	ReconcileEnabled            bool
	ReconcileInterval           time.Duration
	ReconcileBatch              int
}

func Load() (Config, error) {
	if err := loadDotEnv(); err != nil {
		return Config{}, err
	}

	cfg := Config{
		AppName:         getEnv("APP_NAME", "payment-service"),
		AppEnv:          getEnv("APP_ENV", "development"),
		APIPrefix:       strings.Trim(getEnv("API_PREFIX", "api/v1"), "/"),
		DatabaseURL:     strings.TrimSpace(os.Getenv("DATABASE_URL")),
		RedisEnabled:    parseBool(getEnv("REDIS_ENABLED", "true")),
		RedisURL:        strings.TrimSpace(os.Getenv("REDIS_URL")),
		JWTAccessSecret: strings.TrimSpace(os.Getenv("JWT_ACCESS_SECRET")),
		OrderServiceBaseURL: strings.TrimRight(
			strings.TrimSpace(getEnv("ORDER_SERVICE_BASE_URL", "http://api-gateway:8080/api/v1")),
			"/",
		),

		GatewayProvider: strings.ToLower(strings.TrimSpace(getEnv("PAYMENT_GATEWAY", "mock"))),
		SePay: SePayConfig{
			Environment:                 strings.ToLower(strings.TrimSpace(getEnv("SEPAY_ENVIRONMENT", "live"))),
			BankCode:                    strings.TrimSpace(os.Getenv("SEPAY_BANK_CODE")),
			BankAccountNumber:           strings.TrimSpace(os.Getenv("SEPAY_BANK_ACCOUNT_NUMBER")),
			BankAccountName:             strings.TrimSpace(os.Getenv("SEPAY_BANK_ACCOUNT_NAME")),
			AllowedAccountNumbers:       parseCSV(getEnv("SEPAY_ALLOWED_ACCOUNT_NUMBERS", os.Getenv("SEPAY_BANK_ACCOUNT_NUMBER"))),
			PaymentCodePrefix:           strings.ToUpper(strings.TrimSpace(getEnv("SEPAY_PAYMENT_CODE_PREFIX", "EMX"))),
			TransferDescriptionTemplate: strings.TrimSpace(getEnv("SEPAY_TRANSFER_DESCRIPTION_TEMPLATE", "{paymentCode} thanh toan don {orderCode}")),
			QRTemplate:                  strings.TrimSpace(getEnv("SEPAY_QR_TEMPLATE", "compact")),
			WebhookAuthMode:             strings.ToLower(strings.TrimSpace(getEnv("SEPAY_WEBHOOK_AUTH_MODE", "hmac"))),
			WebhookSecret:               strings.TrimSpace(os.Getenv("SEPAY_WEBHOOK_SECRET")),
			WebhookSecrets:              parseCSV(getEnv("SEPAY_WEBHOOK_SECRETS", os.Getenv("SEPAY_WEBHOOK_SECRET"))),
			WebhookAPIKey:               strings.TrimSpace(os.Getenv("SEPAY_WEBHOOK_API_KEY")),
			APIBaseURL:                  strings.TrimRight(strings.TrimSpace(getEnv("SEPAY_API_BASE_URL", "https://my.sepay.vn/userapi")), "/"),
			APIToken:                    strings.TrimSpace(os.Getenv("SEPAY_API_TOKEN")),
			ReconcileEnabled:            parseBool(getEnv("SEPAY_RECONCILE_ENABLED", "false")),
		},
		PaymentExpiryEnabled: parseBool(getEnv("PAYMENT_EXPIRY_WORKER_ENABLED", "true")),

		KafkaEnabled:  parseBool(getEnv("KAFKA_ENABLED", "true")),
		KafkaClientID: getEnv("KAFKA_CLIENT_ID", "payment-service"),
		KafkaBrokers:  parseCSV(getEnv("KAFKA_BROKERS", "localhost:9092")),

		OrderEventsTopic:         getEnv("ORDER_EVENTS_TOPIC", "order.events"),
		OrderEventsConsumerGroup: getEnv("ORDER_EVENTS_CONSUMER_GROUP", "payment-service-order-events-group"),
		PaymentEventsTopic:       getEnv("PAYMENT_EVENTS_TOPIC", "payment.events"),
		NotificationEventsTopic:  getEnv("NOTIFICATION_EVENTS_TOPIC", "notification.events"),
		AnalyticsEventsTopic:     getEnv("ANALYTICS_EVENTS_TOPIC", "analytics.events"),

		RunMigrations: parseBool(getEnv("DB_MIGRATIONS_RUN", "true")),
		MigrationFile: getEnv("MIGRATION_FILE", "migrations/0001_init_payment_service.sql"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	if len(cfg.JWTAccessSecret) < 32 {
		return Config{}, fmt.Errorf("JWT_ACCESS_SECRET must be at least 32 characters")
	}

	port, err := strconv.Atoi(getEnv("PORT", "3012"))
	if err != nil || port <= 0 {
		return Config{}, fmt.Errorf("invalid PORT")
	}
	cfg.Port = port

	if cfg.APIPrefix == "" {
		cfg.APIPrefix = "api/v1"
	}

	idemTTL, err := strconv.Atoi(getEnv("IDEMPOTENCY_RECORD_TTL_MINUTES", "60"))
	if err != nil || idemTTL < 1 {
		return Config{}, fmt.Errorf("IDEMPOTENCY_RECORD_TTL_MINUTES must be >= 1")
	}
	cfg.IdempotencyRecordTTLMinutes = idemTTL

	idemLockTTL, err := strconv.Atoi(getEnv("IDEMPOTENCY_LOCK_TTL_SECONDS", "30"))
	if err != nil || idemLockTTL < 5 {
		return Config{}, fmt.Errorf("IDEMPOTENCY_LOCK_TTL_SECONDS must be >= 5")
	}
	cfg.IdempotencyLockTTLSeconds = idemLockTTL

	webhookTTL, err := strconv.Atoi(getEnv("WEBHOOK_IDEMPOTENCY_TTL_MINUTES", "1440"))
	if err != nil || webhookTTL < 5 {
		return Config{}, fmt.Errorf("WEBHOOK_IDEMPOTENCY_TTL_MINUTES must be >= 5")
	}
	cfg.WebhookIdempotencyTTLMin = webhookTTL

	dependencyTimeoutMs, err := strconv.Atoi(getEnv("DEPENDENCY_TIMEOUT_MS", "5000"))
	if err != nil || dependencyTimeoutMs < 100 {
		return Config{}, fmt.Errorf("DEPENDENCY_TIMEOUT_MS must be >= 100")
	}
	cfg.DependencyTimeout = time.Duration(dependencyTimeoutMs) * time.Millisecond

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

	if cfg.RedisEnabled && cfg.RedisURL == "" {
		return Config{}, fmt.Errorf("REDIS_URL is required when REDIS_ENABLED=true")
	}

	if cfg.GatewayProvider == "" {
		cfg.GatewayProvider = "mock"
	}
	if cfg.GatewayProvider != "mock" && cfg.GatewayProvider != "vnpay" && cfg.GatewayProvider != "sepay" {
		return Config{}, fmt.Errorf("PAYMENT_GATEWAY must be mock, vnpay, or sepay")
	}

	sepayExpiryMin, err := strconv.Atoi(getEnv("SEPAY_PAYMENT_EXPIRES_MINUTES", "15"))
	if err != nil || sepayExpiryMin < 1 {
		return Config{}, fmt.Errorf("SEPAY_PAYMENT_EXPIRES_MINUTES must be >= 1")
	}
	cfg.SePay.PaymentExpiresMinutes = sepayExpiryMin

	sepayToleranceSeconds, err := strconv.Atoi(getEnv("SEPAY_TIMESTAMP_TOLERANCE_SECONDS", "300"))
	if err != nil || sepayToleranceSeconds < 1 {
		return Config{}, fmt.Errorf("SEPAY_TIMESTAMP_TOLERANCE_SECONDS must be >= 1")
	}
	cfg.SePay.TimestampToleranceSeconds = sepayToleranceSeconds

	reconcileIntervalMs, err := strconv.Atoi(getEnv("SEPAY_RECONCILE_INTERVAL_MS", "1800000"))
	if err != nil || reconcileIntervalMs < 1000 {
		return Config{}, fmt.Errorf("SEPAY_RECONCILE_INTERVAL_MS must be >= 1000")
	}
	cfg.SePay.ReconcileInterval = time.Duration(reconcileIntervalMs) * time.Millisecond

	reconcileBatch, err := strconv.Atoi(getEnv("SEPAY_RECONCILE_BATCH_SIZE", "100"))
	if err != nil || reconcileBatch < 1 || reconcileBatch > 5000 {
		return Config{}, fmt.Errorf("SEPAY_RECONCILE_BATCH_SIZE must be between 1 and 5000")
	}
	cfg.SePay.ReconcileBatch = reconcileBatch

	expiryIntervalMs, err := strconv.Atoi(getEnv("PAYMENT_EXPIRY_WORKER_INTERVAL_MS", "60000"))
	if err != nil || expiryIntervalMs < 1000 {
		return Config{}, fmt.Errorf("PAYMENT_EXPIRY_WORKER_INTERVAL_MS must be >= 1000")
	}
	cfg.PaymentExpiryInterval = time.Duration(expiryIntervalMs) * time.Millisecond

	expiryBatch, err := strconv.Atoi(getEnv("PAYMENT_EXPIRY_WORKER_BATCH_SIZE", "100"))
	if err != nil || expiryBatch < 1 || expiryBatch > 1000 {
		return Config{}, fmt.Errorf("PAYMENT_EXPIRY_WORKER_BATCH_SIZE must be between 1 and 1000")
	}
	cfg.PaymentExpiryBatch = expiryBatch

	if cfg.GatewayProvider == "sepay" {
		if cfg.SePay.Environment != "live" && cfg.SePay.Environment != "test" {
			return Config{}, fmt.Errorf("SEPAY_ENVIRONMENT must be live or test")
		}
		if cfg.SePay.BankCode == "" {
			return Config{}, fmt.Errorf("SEPAY_BANK_CODE is required when PAYMENT_GATEWAY=sepay")
		}
		if cfg.SePay.BankAccountNumber == "" {
			return Config{}, fmt.Errorf("SEPAY_BANK_ACCOUNT_NUMBER is required when PAYMENT_GATEWAY=sepay")
		}
		if cfg.SePay.PaymentCodePrefix == "" {
			return Config{}, fmt.Errorf("SEPAY_PAYMENT_CODE_PREFIX is required when PAYMENT_GATEWAY=sepay")
		}
		if cfg.SePay.WebhookAuthMode != "hmac" && cfg.SePay.WebhookAuthMode != "apikey" && cfg.SePay.WebhookAuthMode != "auto" && cfg.SePay.WebhookAuthMode != "none" {
			return Config{}, fmt.Errorf("SEPAY_WEBHOOK_AUTH_MODE must be hmac, apikey, auto, or none")
		}
		hasSePayWebhookSecret := cfg.SePay.WebhookSecret != "" || len(cfg.SePay.WebhookSecrets) > 0
		if cfg.SePay.WebhookAuthMode == "hmac" && cfg.AppEnv == "production" && !hasSePayWebhookSecret {
			return Config{}, fmt.Errorf("SEPAY_WEBHOOK_SECRET or SEPAY_WEBHOOK_SECRETS is required in production when SEPAY_WEBHOOK_AUTH_MODE=hmac")
		}
		if cfg.SePay.WebhookAuthMode == "apikey" && cfg.AppEnv == "production" && cfg.SePay.WebhookAPIKey == "" {
			return Config{}, fmt.Errorf("SEPAY_WEBHOOK_API_KEY is required in production when SEPAY_WEBHOOK_AUTH_MODE=apikey")
		}
		if cfg.SePay.WebhookAuthMode == "auto" && cfg.AppEnv == "production" && !hasSePayWebhookSecret && cfg.SePay.WebhookAPIKey == "" {
			return Config{}, fmt.Errorf("SEPAY_WEBHOOK_SECRET, SEPAY_WEBHOOK_SECRETS, or SEPAY_WEBHOOK_API_KEY is required in production when SEPAY_WEBHOOK_AUTH_MODE=auto")
		}
		if cfg.SePay.ReconcileEnabled && cfg.SePay.APIToken == "" {
			return Config{}, fmt.Errorf("SEPAY_API_TOKEN is required when SEPAY_RECONCILE_ENABLED=true")
		}
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

func loadDotEnv() error {
	for _, path := range dotEnvCandidates() {
		loaded, err := loadDotEnvFile(path)
		if err != nil {
			return err
		}
		if loaded {
			return nil
		}
	}
	return nil
}

func dotEnvCandidates() []string {
	for _, key := range []string{"PAYMENT_SERVICE_ENV_FILE", "ENV_FILE"} {
		if path := strings.TrimSpace(os.Getenv(key)); path != "" {
			return []string{path}
		}
	}

	candidates := make([]string, 0, 2)
	if cwd, err := os.Getwd(); err == nil && filepath.Base(cwd) == "payment-service" {
		candidates = append(candidates, ".env")
	} else {
		candidates = append(candidates, "services/payment-service/.env")
	}
	candidates = append(candidates, ".env")

	seen := make(map[string]struct{}, len(candidates))
	unique := make([]string, 0, len(candidates))
	for _, path := range candidates {
		path = strings.TrimSpace(path)
		if path == "" {
			continue
		}
		if _, ok := seen[path]; ok {
			continue
		}
		seen[path] = struct{}{}
		unique = append(unique, path)
	}
	return unique
}

func loadDotEnvFile(path string) (bool, error) {
	file, err := os.Open(filepath.Clean(path))
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, fmt.Errorf("open env file %s: %w", path, err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	lineNumber := 0
	for scanner.Scan() {
		lineNumber++
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
		key, value, ok := strings.Cut(line, "=")
		key = strings.TrimSpace(key)
		if !ok || !isEnvKey(key) {
			return false, fmt.Errorf("invalid env file %s line %d", path, lineNumber)
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		value = parseDotEnvValue(value)
		if err := os.Setenv(key, value); err != nil {
			return false, fmt.Errorf("set env %s from %s: %w", key, path, err)
		}
	}
	if err := scanner.Err(); err != nil {
		return false, fmt.Errorf("read env file %s: %w", path, err)
	}
	return true, nil
}

func parseDotEnvValue(value string) string {
	value = strings.TrimSpace(value)
	if len(value) < 2 {
		return value
	}
	if strings.HasPrefix(value, `"`) && strings.HasSuffix(value, `"`) {
		if unquoted, err := strconv.Unquote(value); err == nil {
			return unquoted
		}
	}
	if strings.HasPrefix(value, `'`) && strings.HasSuffix(value, `'`) {
		return strings.TrimSuffix(strings.TrimPrefix(value, `'`), `'`)
	}
	return value
}

func isEnvKey(key string) bool {
	if key == "" {
		return false
	}
	for i, r := range key {
		if i == 0 {
			if r != '_' && (r < 'A' || r > 'Z') && (r < 'a' || r > 'z') {
				return false
			}
			continue
		}
		if r != '_' && (r < 'A' || r > 'Z') && (r < 'a' || r > 'z') && (r < '0' || r > '9') {
			return false
		}
	}
	return true
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
