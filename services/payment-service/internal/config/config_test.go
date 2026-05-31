package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadAcceptsSePayGatewayWithRequiredConfig(t *testing.T) {
	isolateDotEnv(t)
	t.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/db")
	t.Setenv("JWT_ACCESS_SECRET", "dev-shared-jwt-access-secret-min-32-chars")
	t.Setenv("PAYMENT_GATEWAY", "sepay")
	t.Setenv("SEPAY_BANK_CODE", "Vietcombank")
	t.Setenv("SEPAY_BANK_ACCOUNT_NUMBER", "0010000000355")
	t.Setenv("SEPAY_WEBHOOK_AUTH_MODE", "none")
	t.Setenv("REDIS_ENABLED", "false")
	t.Setenv("KAFKA_ENABLED", "false")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if cfg.GatewayProvider != "sepay" {
		t.Fatalf("expected sepay gateway, got %s", cfg.GatewayProvider)
	}
	if cfg.SePay.PaymentCodePrefix != "EMX" {
		t.Fatalf("expected default payment code prefix, got %s", cfg.SePay.PaymentCodePrefix)
	}
	if cfg.SePay.APIBaseURL != "https://my.sepay.vn/userapi" {
		t.Fatalf("expected default SePay userapi base URL, got %s", cfg.SePay.APIBaseURL)
	}
}

func TestLoadRequiresSePayBankAccount(t *testing.T) {
	isolateDotEnv(t)
	t.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/db")
	t.Setenv("JWT_ACCESS_SECRET", "dev-shared-jwt-access-secret-min-32-chars")
	t.Setenv("PAYMENT_GATEWAY", "sepay")
	t.Setenv("SEPAY_BANK_CODE", "Vietcombank")
	t.Setenv("SEPAY_WEBHOOK_AUTH_MODE", "none")
	t.Setenv("REDIS_ENABLED", "false")
	t.Setenv("KAFKA_ENABLED", "false")

	if _, err := Load(); err == nil {
		t.Fatalf("expected missing bank account config to fail")
	}
}

func TestLoadRequiresSePayAPITokenWhenReconcileEnabled(t *testing.T) {
	isolateDotEnv(t)
	t.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/db")
	t.Setenv("JWT_ACCESS_SECRET", "dev-shared-jwt-access-secret-min-32-chars")
	t.Setenv("PAYMENT_GATEWAY", "sepay")
	t.Setenv("SEPAY_BANK_CODE", "Vietcombank")
	t.Setenv("SEPAY_BANK_ACCOUNT_NUMBER", "0010000000355")
	t.Setenv("SEPAY_WEBHOOK_AUTH_MODE", "none")
	t.Setenv("SEPAY_RECONCILE_ENABLED", "true")
	t.Setenv("REDIS_ENABLED", "false")
	t.Setenv("KAFKA_ENABLED", "false")

	if _, err := Load(); err == nil {
		t.Fatalf("expected missing SePay API token to fail when reconciliation is enabled")
	}
}

func TestLoadAcceptsSePayTestEnvironment(t *testing.T) {
	isolateDotEnv(t)
	t.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/db")
	t.Setenv("JWT_ACCESS_SECRET", "dev-shared-jwt-access-secret-min-32-chars")
	t.Setenv("PAYMENT_GATEWAY", "sepay")
	t.Setenv("SEPAY_ENVIRONMENT", "test")
	t.Setenv("SEPAY_BANK_CODE", "Vietcombank")
	t.Setenv("SEPAY_BANK_ACCOUNT_NUMBER", "0010000000355")
	t.Setenv("SEPAY_WEBHOOK_AUTH_MODE", "none")
	t.Setenv("REDIS_ENABLED", "false")
	t.Setenv("KAFKA_ENABLED", "false")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if cfg.SePay.Environment != "test" {
		t.Fatalf("expected test SePay environment, got %s", cfg.SePay.Environment)
	}
}

func TestLoadReadsExplicitDotEnvFile(t *testing.T) {
	envPath := filepath.Join(t.TempDir(), ".env")
	envKeys := []string{
		"DATABASE_URL",
		"JWT_ACCESS_SECRET",
		"REDIS_ENABLED",
		"KAFKA_ENABLED",
		"PAYMENT_GATEWAY",
		"SEPAY_ENVIRONMENT",
		"SEPAY_BANK_CODE",
		"SEPAY_BANK_ACCOUNT_NUMBER",
		"SEPAY_ALLOWED_ACCOUNT_NUMBERS",
		"SEPAY_WEBHOOK_AUTH_MODE",
		"SEPAY_WEBHOOK_SECRET",
		"SEPAY_WEBHOOK_SECRETS",
		"SEPAY_PAYMENT_CODE_PREFIX",
		"SEPAY_TRANSFER_DESCRIPTION_TEMPLATE",
	}
	restoreEnvAfterLoad(t, envKeys...)
	t.Setenv("PAYMENT_SERVICE_ENV_FILE", envPath)

	content := strings.Join([]string{
		"DATABASE_URL=postgresql://user:pass@localhost:5432/db",
		"JWT_ACCESS_SECRET=dev-shared-jwt-access-secret-min-32-chars",
		"REDIS_ENABLED=false",
		"KAFKA_ENABLED=false",
		"PAYMENT_GATEWAY=sepay",
		"SEPAY_ENVIRONMENT=test",
		"SEPAY_BANK_CODE=TPB",
		"SEPAY_BANK_ACCOUNT_NUMBER=10004262634",
		"SEPAY_ALLOWED_ACCOUNT_NUMBERS=10004262634,10000000000",
		"SEPAY_WEBHOOK_AUTH_MODE=none",
		"SEPAY_WEBHOOK_SECRET=old-secret",
		"SEPAY_WEBHOOK_SECRETS=old-secret,new-secret",
		"SEPAY_PAYMENT_CODE_PREFIX=DT",
		`SEPAY_TRANSFER_DESCRIPTION_TEMPLATE="{paymentCode} don {orderCode}"`,
	}, "\n")
	if err := os.WriteFile(envPath, []byte(content), 0o600); err != nil {
		t.Fatalf("write env file: %v", err)
	}

	cfg, err := Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if cfg.GatewayProvider != "sepay" {
		t.Fatalf("expected sepay gateway, got %s", cfg.GatewayProvider)
	}
	if cfg.SePay.BankCode != "TPB" {
		t.Fatalf("expected bank code from env file, got %s", cfg.SePay.BankCode)
	}
	if cfg.SePay.PaymentCodePrefix != "DT" {
		t.Fatalf("expected payment code prefix from env file, got %s", cfg.SePay.PaymentCodePrefix)
	}
	if cfg.SePay.TransferDescriptionTemplate != "{paymentCode} don {orderCode}" {
		t.Fatalf("expected unquoted transfer description, got %s", cfg.SePay.TransferDescriptionTemplate)
	}
	if len(cfg.SePay.AllowedAccountNumbers) != 2 {
		t.Fatalf("expected two allowed account numbers, got %d", len(cfg.SePay.AllowedAccountNumbers))
	}
	if len(cfg.SePay.WebhookSecrets) != 2 {
		t.Fatalf("expected two webhook secrets, got %d", len(cfg.SePay.WebhookSecrets))
	}
}

func isolateDotEnv(t *testing.T) {
	t.Helper()
	t.Setenv("PAYMENT_SERVICE_ENV_FILE", filepath.Join(t.TempDir(), "missing.env"))
}

func restoreEnvAfterLoad(t *testing.T, keys ...string) {
	t.Helper()
	original := make(map[string]string, len(keys))
	exists := make(map[string]bool, len(keys))
	for _, key := range keys {
		original[key], exists[key] = os.LookupEnv(key)
	}
	t.Cleanup(func() {
		for _, key := range keys {
			if exists[key] {
				_ = os.Setenv(key, original[key])
				continue
			}
			_ = os.Unsetenv(key)
		}
	})
}
