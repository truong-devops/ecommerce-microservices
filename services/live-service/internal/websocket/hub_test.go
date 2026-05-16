package websocket

import (
	"context"
	"testing"
)

func TestHubRegisterBroadcastAndUnregister(t *testing.T) {
	hub := NewHub()
	client := &Client{SessionID: "live-1", Send: make(chan any, 1)}

	if count := hub.Register(client); count != 1 {
		t.Fatalf("expected count 1 after register, got %d", count)
	}
	if err := hub.Broadcast(context.Background(), "live-1", map[string]any{"type": "live:viewer:count"}); err != nil {
		t.Fatalf("Broadcast returned error: %v", err)
	}
	select {
	case payload := <-client.Send:
		if payload.(map[string]any)["type"] != "live:viewer:count" {
			t.Fatalf("unexpected payload: %+v", payload)
		}
	default:
		t.Fatal("expected payload to be delivered")
	}
	if count := hub.Unregister(client); count != 0 {
		t.Fatalf("expected count 0 after unregister, got %d", count)
	}
}
