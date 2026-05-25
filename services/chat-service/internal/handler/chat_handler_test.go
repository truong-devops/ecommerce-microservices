package handler

import (
	"net/http/httptest"
	"testing"
)

func TestIsAllowedOriginAllowsAuthenticatedNativeSocketHandshake(t *testing.T) {
	handler := NewChatHandler(nil, nil, []string{"https://buyer.dt-commerce.site"})
	request := httptest.NewRequest("GET", "http://chat/api/v1/chat/ws", nil)

	if !handler.isAllowedOrigin(request) {
		t.Fatal("expected native WebSocket handshake without Origin to be allowed after JWT middleware")
	}
}

func TestIsAllowedOriginValidatesBrowserOrigin(t *testing.T) {
	handler := NewChatHandler(nil, nil, []string{"https://buyer.dt-commerce.site"})
	allowed := httptest.NewRequest("GET", "http://chat/api/v1/chat/ws", nil)
	allowed.Header.Set("Origin", "https://buyer.dt-commerce.site")
	rejected := httptest.NewRequest("GET", "http://chat/api/v1/chat/ws", nil)
	rejected.Header.Set("Origin", "https://attacker.example")

	if !handler.isAllowedOrigin(allowed) {
		t.Fatal("expected configured browser origin to be allowed")
	}
	if handler.isAllowedOrigin(rejected) {
		t.Fatal("expected unexpected browser origin to be rejected")
	}
}
