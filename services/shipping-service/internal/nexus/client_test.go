package nexus

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSignMatchesCanonicalRequest(t *testing.T) {
	body := []byte(`{"external":{"externalOrderId":"order-1"}}`)
	got := Sign(http.MethodPost, CreateOrderPath, "2026-05-26T10:30:00Z", "nonce-1", body, "secret")
	want := "6ab937feae0446d751519d88d068729b21c79a2870cb2011c02287e3d876a970"
	if got != want {
		t.Fatalf("unexpected signature: %s", got)
	}
}

func TestSignHealthRequestUsesEmptyBody(t *testing.T) {
	signature := Sign(http.MethodGet, "/merchant/integrations/health", "2026-05-26T10:30:00Z", "nonce-1", nil, "secret")
	if !VerifySignature(http.MethodGet, "/merchant/integrations/health", "2026-05-26T10:30:00Z", "nonce-1", nil, "secret", signature) {
		t.Fatal("expected health signature using empty request body to verify")
	}
}

func TestClientCreateOrderUsesSignedRawBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var input CreateOrderRequest
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			t.Fatal(err)
		}
		if r.URL.Path != CreateOrderPath || r.Header.Get("Idempotency-Key") != "PARTNER:shop-1:order-1" {
			t.Fatalf("unexpected request: %s %s", r.URL.Path, r.Header.Get("Idempotency-Key"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{"shipmentCode":"NX-001","status":"CREATED"}}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, "PARTNER", "key", "secret", time.Second)
	response, err := client.CreateOrder(context.Background(), "PARTNER:shop-1:order-1", CreateOrderRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if response.Data.ShipmentCode != "NX-001" {
		t.Fatalf("unexpected response: %+v", response)
	}
}
