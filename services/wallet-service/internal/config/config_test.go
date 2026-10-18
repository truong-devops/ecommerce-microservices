package config

import (
	"testing"
	"time"
)

func TestLoadValidWalletConfig(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/wallet")
	t.Setenv("JWT_ACCESS_SECRET", "dev-shared-jwt-access-secret-min-32-chars")
	t.Setenv("BANK_ACCOUNT_ENCRYPTION_KEY", "dev-bank-account-encryption-key-32-chars")
	t.Setenv("KAFKA_ENABLED", "false")
	t.Setenv("WALLET_HOLD_DURATION_SECONDS", "45")
	t.Setenv("WALLET_RELEASE_INTERVAL_MS", "1000")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if cfg.AppName != "wallet-service" || cfg.HoldDuration != 45*time.Second {
		t.Fatalf("unexpected config: %+v", cfg)
	}
	if cfg.PaymentEventsTopic != "payment.events" || cfg.OrderEventsTopic != "order.events" || cfg.KafkaStartOffset != "first" {
		t.Fatalf("unexpected event topics: %+v", cfg)
	}
}

func TestLoadRejectsInvalidKafkaStartOffset(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/wallet")
	t.Setenv("JWT_ACCESS_SECRET", "dev-shared-jwt-access-secret-min-32-chars")
	t.Setenv("BANK_ACCOUNT_ENCRYPTION_KEY", "dev-bank-account-encryption-key-32-chars")
	t.Setenv("KAFKA_START_OFFSET", "middle")
	if _, err := Load(); err == nil {
		t.Fatal("expected invalid Kafka start offset to fail")
	}
}

func TestLoadRejectsInvalidHoldDuration(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/wallet")
	t.Setenv("JWT_ACCESS_SECRET", "dev-shared-jwt-access-secret-min-32-chars")
	t.Setenv("BANK_ACCOUNT_ENCRYPTION_KEY", "dev-bank-account-encryption-key-32-chars")
	t.Setenv("WALLET_HOLD_DURATION_SECONDS", "0")

	if _, err := Load(); err == nil {
		t.Fatal("expected invalid hold duration to fail")
	}
}

func TestLoadRequiresJWTSecret(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/wallet")
	t.Setenv("JWT_ACCESS_SECRET", "short")
	t.Setenv("BANK_ACCOUNT_ENCRYPTION_KEY", "dev-bank-account-encryption-key-32-chars")

	if _, err := Load(); err == nil {
		t.Fatal("expected short JWT secret to fail")
	}
}

func TestLoadAcceptsManualVietQRAndRejectsUnknownProvider(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/wallet")
	t.Setenv("JWT_ACCESS_SECRET", "dev-shared-jwt-access-secret-min-32-chars")
	t.Setenv("BANK_ACCOUNT_ENCRYPTION_KEY", "dev-bank-account-encryption-key-32-chars")
	t.Setenv("PAYOUT_PROVIDER", "manual_vietqr")

	cfg, err := Load()
	if err != nil || cfg.PayoutProvider != "manual_vietqr" {
		t.Fatalf("manual provider config=%+v err=%v", cfg, err)
	}
	t.Setenv("PAYOUT_PROVIDER", "unknown")
	if _, err := Load(); err == nil {
		t.Fatal("expected unknown payout provider to fail")
	}
}

func TestLoadAcceptsSePayPayoutWebhook(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/wallet")
	t.Setenv("JWT_ACCESS_SECRET", "dev-shared-jwt-access-secret-min-32-chars")
	t.Setenv("BANK_ACCOUNT_ENCRYPTION_KEY", "dev-bank-account-encryption-key-32-chars")
	t.Setenv("PAYOUT_PROVIDER", "manual_vietqr")
	t.Setenv("SEPAY_PAYOUT_WEBHOOK_ENABLED", "true")
	t.Setenv("SEPAY_PAYOUT_SOURCE_ACCOUNT_NUMBER", "10004262634")
	t.Setenv("SEPAY_PAYOUT_WEBHOOK_AUTH_MODE", "apikey")
	t.Setenv("SEPAY_PAYOUT_WEBHOOK_API_KEY", "test-payout-webhook-key")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if !cfg.SePayPayoutWebhook.Enabled || cfg.SePayPayoutWebhook.SourceAccountNumber != "10004262634" {
		t.Fatalf("unexpected payout webhook config: %+v", cfg.SePayPayoutWebhook)
	}
}

func TestLoadRejectsEnabledSePayPayoutWebhookWithoutAPIKey(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/wallet")
	t.Setenv("JWT_ACCESS_SECRET", "dev-shared-jwt-access-secret-min-32-chars")
	t.Setenv("BANK_ACCOUNT_ENCRYPTION_KEY", "dev-bank-account-encryption-key-32-chars")
	t.Setenv("PAYOUT_PROVIDER", "manual_vietqr")
	t.Setenv("SEPAY_PAYOUT_WEBHOOK_ENABLED", "true")
	t.Setenv("SEPAY_PAYOUT_SOURCE_ACCOUNT_NUMBER", "10004262634")
	t.Setenv("SEPAY_PAYOUT_WEBHOOK_AUTH_MODE", "apikey")
	t.Setenv("SEPAY_PAYOUT_WEBHOOK_API_KEY", "")
	t.Setenv("SEPAY_WEBHOOK_API_KEY", "")

	if _, err := Load(); err == nil {
		t.Fatal("expected missing payout webhook API key to fail")
	}
}
