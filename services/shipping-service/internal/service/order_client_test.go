package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestOrderClientGetOrderByIDSuccess(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer token-123" {
			t.Fatalf("missing auth header: %s", r.Header.Get("Authorization"))
		}
		if r.URL.Path != "/api/v1/orders/order-1" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{"id":"order-1","userId":"user-1","status":"CONFIRMED","currency":"USD"}}`))
	}))
	defer srv.Close()

	client := NewOrderClient(srv.URL+"/api/v1", 2*time.Second)
	order, err := client.GetOrderByID(context.Background(), "order-1", "token-123")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if order == nil || order.ID != "order-1" || order.UserID != "user-1" || order.Currency != "USD" {
		t.Fatalf("unexpected order snapshot: %+v", order)
	}
}

func TestVerifyWebhookSignature(t *testing.T) {
	t.Parallel()

	req := ShippingWebhookRequest{
		ProviderEventID: "evt_1",
		Status:          "PENDING",
	}
	secret := "dev-shipping-webhook-signing-secret"
	svc := &ShippingService{webhookSigningSecret: secret}

	payload := canonicalize(map[string]any{
		"provider": "ghn",
		"payload":  req,
	})
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	signature := hex.EncodeToString(mac.Sum(nil))

	if err := svc.verifyWebhookSignature("ghn", signature, req); err != nil {
		t.Fatalf("expected valid signature, got %v", err)
	}
	if err := svc.verifyWebhookSignature("ghn", "invalid-signature", req); err == nil {
		t.Fatalf("expected invalid signature error")
	}
}
