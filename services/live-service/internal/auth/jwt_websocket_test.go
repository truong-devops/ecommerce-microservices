package auth

import (
	"net/http/httptest"
	"testing"
)

func TestExtractTokenFromWebSocketSubprotocol(t *testing.T) {
	req := httptest.NewRequest("GET", "http://example.com/api/v1/live/ws?sessionId=abc", nil)
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Sec-WebSocket-Protocol", "live.v1, access-token.test.jwt.token")

	token := extractTokenFromWebSocketSubprotocol(req)
	if token != "test.jwt.token" {
		t.Fatalf("expected token to be extracted, got %q", token)
	}
}

func TestExtractTokenFromWebSocketSubprotocolMissing(t *testing.T) {
	req := httptest.NewRequest("GET", "http://example.com/api/v1/live/ws?sessionId=abc", nil)
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Sec-WebSocket-Protocol", "live.v1")

	token := extractTokenFromWebSocketSubprotocol(req)
	if token != "" {
		t.Fatalf("expected empty token, got %q", token)
	}
}
