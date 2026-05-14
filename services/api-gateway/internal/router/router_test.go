package router

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"api-gateway/internal/config"
	"api-gateway/internal/observability"

	"go.uber.org/zap"
)

func TestPrivateV1RoutesRequireAuth(t *testing.T) {
	cfg := testGatewayConfig()
	metrics := observability.NewMetrics("api-gateway-router-test")

	handler, err := New(cfg, zap.NewNop(), metrics, nil)
	if err != nil {
		t.Fatalf("create router: %v", err)
	}

	paths := []string{
		"/api/v1/payments",
		"/api/v1/notifications",
		"/api/v1/users/me",
		"/api/v1/inventory/stocks/SKU-001",
		"/api/v1/shipping",
		"/api/v1/analytics/overview",
	}

	for _, path := range paths {
		t.Run(path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("expected status %d for %s, got %d", http.StatusUnauthorized, path, rec.Code)
			}
		})
	}
}

func TestPublicShopRoutesAreMounted(t *testing.T) {
	cfg := testGatewayConfig()
	metrics := observability.NewMetrics("api-gateway-router-test")

	handler, err := New(cfg, zap.NewNop(), metrics, nil)
	if err != nil {
		t.Fatalf("create router: %v", err)
	}

	paths := []string{
		"/api/shops/11111111-1111-4111-8111-111111111111/decor",
		"/api/v1/shops/11111111-1111-4111-8111-111111111111/decor",
	}

	for _, path := range paths {
		t.Run(path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code == http.StatusNotFound {
				t.Fatalf("expected mounted proxy route for %s, got %d", path, rec.Code)
			}
		})
	}
}

func TestPublicVideoRoutesAreMounted(t *testing.T) {
	cfg := testGatewayConfig()
	metrics := observability.NewMetrics("api-gateway-router-video-public-test")

	handler, err := New(cfg, zap.NewNop(), metrics, nil)
	if err != nil {
		t.Fatalf("create router: %v", err)
	}

	tests := []struct {
		method string
		path   string
	}{
		{method: http.MethodGet, path: "/api/v1/videos/feed"},
		{method: http.MethodGet, path: "/api/v1/videos/video-123"},
		{method: http.MethodPost, path: "/api/v1/videos/video-123/events/view-started"},
		{method: http.MethodPost, path: "/api/v1/videos/video-123/events/product-clicked"},
	}

	for _, tc := range tests {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, nil)
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code == http.StatusUnauthorized || rec.Code == http.StatusNotFound {
				t.Fatalf("expected mounted public video route for %s %s, got %d", tc.method, tc.path, rec.Code)
			}
		})
	}
}

func TestPrivateVideoManagementRoutesRequireAuth(t *testing.T) {
	cfg := testGatewayConfig()
	metrics := observability.NewMetrics("api-gateway-router-video-private-test")

	handler, err := New(cfg, zap.NewNop(), metrics, nil)
	if err != nil {
		t.Fatalf("create router: %v", err)
	}

	tests := []struct {
		method string
		path   string
	}{
		{method: http.MethodPost, path: "/api/v1/videos"},
		{method: http.MethodPatch, path: "/api/v1/videos/video-123"},
		{method: http.MethodDelete, path: "/api/v1/videos/video-123"},
	}

	for _, tc := range tests {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, nil)
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("expected status %d for %s %s, got %d", http.StatusUnauthorized, tc.method, tc.path, rec.Code)
			}
		})
	}
}

func TestPublicGoogleOAuthRoutesAreMounted(t *testing.T) {
	cfg := testGatewayConfig()
	metrics := observability.NewMetrics("api-gateway-router-test")

	handler, err := New(cfg, zap.NewNop(), metrics, nil)
	if err != nil {
		t.Fatalf("create router: %v", err)
	}

	tests := []struct {
		method string
		path   string
	}{
		{method: http.MethodGet, path: "/api/auth/oauth/google/authorize"},
		{method: http.MethodGet, path: "/api/v1/auth/oauth/google/authorize"},
		{method: http.MethodGet, path: "/api/auth/oauth/google/callback?code=test&state=test"},
		{method: http.MethodGet, path: "/api/v1/auth/oauth/google/callback?code=test&state=test"},
		{method: http.MethodPost, path: "/api/auth/oauth/exchange-ticket"},
		{method: http.MethodPost, path: "/api/v1/auth/oauth/exchange-ticket"},
	}

	for _, tc := range tests {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, nil)
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code == http.StatusUnauthorized || rec.Code == http.StatusNotFound {
				t.Fatalf("expected mounted public proxy route for %s %s, got %d", tc.method, tc.path, rec.Code)
			}
		})
	}
}

func testGatewayConfig() *config.Config {
	timeout := 100 * time.Millisecond
	services := map[string]config.ServiceConfig{
		config.ServiceAuth:         {Name: config.ServiceAuth, URL: "http://127.0.0.1:1", Timeout: timeout},
		config.ServiceUser:         {Name: config.ServiceUser, URL: "http://127.0.0.1:1", Timeout: timeout},
		config.ServiceProduct:      {Name: config.ServiceProduct, URL: "http://127.0.0.1:1", Timeout: timeout},
		config.ServiceMedia:        {Name: config.ServiceMedia, URL: "http://127.0.0.1:1", Timeout: timeout},
		config.ServiceCart:         {Name: config.ServiceCart, URL: "http://127.0.0.1:1", Timeout: timeout},
		config.ServiceOrder:        {Name: config.ServiceOrder, URL: "http://127.0.0.1:1", Timeout: timeout},
		config.ServicePayment:      {Name: config.ServicePayment, URL: "http://127.0.0.1:1", Timeout: timeout},
		config.ServiceInventory:    {Name: config.ServiceInventory, URL: "http://127.0.0.1:1", Timeout: timeout},
		config.ServiceShipping:     {Name: config.ServiceShipping, URL: "http://127.0.0.1:1", Timeout: timeout},
		config.ServiceReview:       {Name: config.ServiceReview, URL: "http://127.0.0.1:1", Timeout: timeout},
		config.ServiceNotification: {Name: config.ServiceNotification, URL: "http://127.0.0.1:1", Timeout: timeout},
		config.ServiceAnalytics:    {Name: config.ServiceAnalytics, URL: "http://127.0.0.1:1", Timeout: timeout},
		config.ServiceChat:         {Name: config.ServiceChat, URL: "http://127.0.0.1:1", Timeout: timeout},
	}

	return &config.Config{
		AppName:            "api-gateway-test",
		AppEnv:             "test",
		Port:               "0",
		JWTSecret:          "dev-shared-jwt-access-secret-min-32-chars",
		CORSAllowedOrigins: []string{"*"},
		Server: config.ServerConfig{
			RequestTimeout:  1 * time.Second,
			ShutdownTimeout: 1 * time.Second,
		},
		RateLimit: config.RateLimitConfig{
			RPS:   1000,
			Burst: 1000,
		},
		Services: services,
	}
}
