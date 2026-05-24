package proxy

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestIsWebSocketUpgrade(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/live/ws", nil)
	request.Header.Set("Connection", "Upgrade")
	request.Header.Set("Upgrade", "websocket")
	if !isWebSocketUpgrade(request) {
		t.Fatal("expected websocket upgrade request to be detected")
	}
}

func TestIsWebSocketUpgradeFalseForRegularRequest(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/live/sessions", nil)
	if isWebSocketUpgrade(request) {
		t.Fatal("expected regular request not to be detected as websocket upgrade")
	}
}
