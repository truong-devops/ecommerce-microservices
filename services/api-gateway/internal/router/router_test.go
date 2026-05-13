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

