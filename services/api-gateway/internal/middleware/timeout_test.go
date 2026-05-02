package middleware

import (
	"net/http/httptest"
	"testing"
)

func TestIsWebSocketUpgrade(t *testing.T) {
	req := httptest.NewRequest("GET", "http://example.com/ws", nil)
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")

	if !isWebSocketUpgrade(req) {
		t.Fatalf("expected websocket upgrade request")
	}
}

func TestIsWebSocketUpgradeFalse(t *testing.T) {
	req := httptest.NewRequest("GET", "http://example.com/ws", nil)
	req.Header.Set("Connection", "keep-alive")
	req.Header.Set("Upgrade", "")

	if isWebSocketUpgrade(req) {
		t.Fatalf("expected non-websocket request")
	}
}
