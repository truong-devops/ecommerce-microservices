package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"product-service/internal/config"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

func TestRouterUsesConfiguredAPIPrefixOnly(t *testing.T) {
	handler := New(config.Config{AppName: "product-service", APIPrefix: "custom/v2", JWTAccessSecret: "01234567890123456789012345678901"}, zap.NewNop(), nil, nil, nil, nil, nil)
	routes, ok := handler.(chi.Routes)
	if !ok {
		t.Fatalf("router does not expose chi routes")
	}

	paths := map[string]bool{}
	if err := chi.Walk(routes, func(method string, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		paths[method+" "+route] = true
		return nil
	}); err != nil {
		t.Fatalf("walk routes: %v", err)
	}

	expected := []string{
		"GET /custom/v2/health",
		"GET /custom/v2/videos/{videoId}/comments",
		"POST /custom/v2/videos/{videoId}/comments",
		"POST /custom/v2/videos/{videoId}/events/view-started",
		"POST /custom/v2/videos/{videoId}/events/view-qualified",
		"POST /custom/v2/videos/{videoId}/events/product-clicked",
		"POST /custom/v2/videos/{videoId}/events/add-to-cart",
	}
	for _, route := range expected {
		if !paths[route] {
			t.Fatalf("missing expected route %s in %#v", route, paths)
		}
	}

	forbidden := []string{
		"GET /health",
		"GET /api/health",
		"GET /api/v1/products",
		"GET /api/products",
		"POST /custom/v2/videos/{videoId}/events/{eventType}",
	}
	for _, route := range forbidden {
		if paths[route] {
			t.Fatalf("unexpected route %s", route)
		}
	}

	assertNotFound(t, handler, http.MethodGet, "/api/v1/products")
	assertNotFound(t, handler, http.MethodPost, "/custom/v2/videos/video-1/events/not-real")
	assertRouteExists(t, handler, http.MethodGet, "/custom/v2/products")
	assertRouteExists(t, handler, http.MethodGet, "/custom/v2/videos/video-1/comments")
	assertRouteExists(t, handler, http.MethodPost, "/custom/v2/videos")
}

func assertNotFound(t *testing.T, handler http.Handler, method string, path string) {
	t.Helper()
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(method, path, nil))
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("%s %s expected 404, got %d", method, path, recorder.Code)
	}
}

func assertRouteExists(t *testing.T, handler http.Handler, method string, path string) {
	t.Helper()
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(method, path, nil))
	if recorder.Code == http.StatusNotFound {
		t.Fatalf("%s %s should be mounted", method, path)
	}
}
