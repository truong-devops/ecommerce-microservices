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
	if cfg.LiveMediaMode != "p2p_legacy" {
		t.Fatalf("expected p2p_legacy media mode, got %q", cfg.LiveMediaMode)
	}
}

func TestLoadConfigForMediaEngine(t *testing.T) {
	t.Setenv("MONGO_URI", "mongodb://localhost:27017")
	t.Setenv("JWT_ACCESS_SECRET", "dev-shared-jwt-access-secret-min-32-chars")
	t.Setenv("REDIS_ENABLED", "false")
	t.Setenv("KAFKA_ENABLED", "false")
	t.Setenv("PRODUCT_SERVICE_BASE_URL", "http://product-service:8080")
	t.Setenv("LIVE_MEDIA_MODE", "media_engine")
	t.Setenv("LIVE_MEDIA_PROVIDER", "MEDIAMTX")
	t.Setenv("LIVE_MEDIA_INGEST_PROTOCOL", "WHIP")
	t.Setenv("LIVE_MEDIA_PLAYBACK_PROTOCOL", "HLS")
	t.Setenv("LIVE_MEDIA_INGEST_BASE_URL", "http://localhost:8889")
	t.Setenv("LIVE_MEDIA_PLAYBACK_BASE_URL", "http://localhost:8888")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if cfg.LiveMediaMode != "media_engine" {
		t.Fatalf("expected media_engine mode, got %q", cfg.LiveMediaMode)
	}
	if cfg.LiveMediaProvider != "MEDIAMTX" || cfg.LiveMediaIngestProtocol != "WHIP" || cfg.LiveMediaPlaybackProtocol != "HLS" {
		t.Fatalf("unexpected media settings: provider=%q ingest=%q playback=%q", cfg.LiveMediaProvider, cfg.LiveMediaIngestProtocol, cfg.LiveMediaPlaybackProtocol)
	}
}

func TestLoadConfigRejectsInvalidMediaMode(t *testing.T) {
	t.Setenv("MONGO_URI", "mongodb://localhost:27017")
	t.Setenv("JWT_ACCESS_SECRET", "dev-shared-jwt-access-secret-min-32-chars")
	t.Setenv("REDIS_ENABLED", "false")
	t.Setenv("KAFKA_ENABLED", "false")
	t.Setenv("PRODUCT_SERVICE_BASE_URL", "http://product-service:8080")
	t.Setenv("LIVE_MEDIA_MODE", "invalid")

	if _, err := Load(); err == nil {
		t.Fatal("expected invalid LIVE_MEDIA_MODE to fail")
	}
}

func TestLoadConfigRejectsInvalidMediaEngineProvider(t *testing.T) {
	t.Setenv("MONGO_URI", "mongodb://localhost:27017")
	t.Setenv("JWT_ACCESS_SECRET", "dev-shared-jwt-access-secret-min-32-chars")
	t.Setenv("REDIS_ENABLED", "false")
	t.Setenv("KAFKA_ENABLED", "false")
	t.Setenv("PRODUCT_SERVICE_BASE_URL", "http://product-service:8080")
	t.Setenv("LIVE_MEDIA_MODE", "media_engine")
	t.Setenv("LIVE_MEDIA_PROVIDER", "UNKNOWN")

	if _, err := Load(); err == nil {
		t.Fatal("expected invalid LIVE_MEDIA_PROVIDER to fail")
	}
}
