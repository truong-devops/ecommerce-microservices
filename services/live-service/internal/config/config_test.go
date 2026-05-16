package config

import "testing"

func TestLoadConfigForFoundation(t *testing.T) {
	t.Setenv("MONGO_URI", "mongodb://localhost:27017")
	t.Setenv("JWT_ACCESS_SECRET", "dev-shared-jwt-access-secret-min-32-chars")
	t.Setenv("REDIS_ENABLED", "false")
	t.Setenv("KAFKA_ENABLED", "false")
	t.Setenv("PRODUCT_SERVICE_BASE_URL", "http://product-service:8080")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if cfg.AppName != "live-service" {
		t.Fatalf("expected default app name live-service, got %q", cfg.AppName)
	}
	if cfg.Port != 3013 {
		t.Fatalf("expected default port 3013, got %d", cfg.Port)
	}
	if cfg.APIPrefix != "api/v1" {
		t.Fatalf("expected api/v1 prefix, got %q", cfg.APIPrefix)
	}
}
