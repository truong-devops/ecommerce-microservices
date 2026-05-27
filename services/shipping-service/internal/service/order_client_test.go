package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"shipping-service/internal/domain"
	"shipping-service/internal/nexus"
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

func TestHandleNexusWebhookPing(t *testing.T) {
	t.Parallel()

	client := nexus.NewClient("https://ops.nexus-ex.site", "PARTNER", "api-key", "api-secret-long-value", time.Second)
	svc := NewShippingService(nil, nil, "dev-shipping-webhook-signing-secret", 1440, NexusIntegration{
		WebhookEnabled: true, Client: client, WebhookSecret: "webhook-secret-long-value",
	})
	rawBody := []byte(`{"eventId":"evt_ping_1","eventType":"webhook.ping","occurredAt":"2026-05-26T10:30:00Z","data":{}}`)
	timestamp := time.Now().UTC().Format(time.RFC3339)
	headers := NexusWebhookHeaders{
		PartnerCode: "PARTNER", Timestamp: timestamp, Nonce: "nonce-1", EventID: "evt_ping_1",
		Signature: nexus.Sign("POST", "/api/v1/shipments/webhooks/nexus", timestamp, "nonce-1", rawBody, "webhook-secret-long-value"),
	}
	response, err := svc.HandleNexusWebhook(context.Background(), "request-1", headers, rawBody)
	if err != nil {
		t.Fatal(err)
	}
	if response["processed"] != true {
		t.Fatalf("unexpected webhook ping response: %+v", response)
	}
}

func TestNexusShipmentStatusMapping(t *testing.T) {
	cases := map[string]domain.ShipmentStatus{
		"CREATED":          domain.ShipmentStatusAWBCreated,
		"PICKUP_COMPLETED": domain.ShipmentStatusPickedUp,
		"IN_TRANSIT":       domain.ShipmentStatusInTransit,
		"OUT_FOR_DELIVERY": domain.ShipmentStatusOutForDelivery,
		"DELIVERED":        domain.ShipmentStatusDelivered,
		"DELIVERY_FAILED":  domain.ShipmentStatusFailed,
		"RETURN_COMPLETED": domain.ShipmentStatusReturned,
		"CANCELLED":        domain.ShipmentStatusCancelled,
	}
	for raw, expected := range cases {
		got, ok := nexusShipmentStatus(raw)
		if !ok || got != expected {
			t.Fatalf("unexpected mapping for %s: %s", raw, got)
		}
	}
}

func TestNexusOutboundOnlyForMappedSeller(t *testing.T) {
	svc := NewShippingService(nil, nil, "dev-shipping-webhook-signing-secret", 1440, NexusIntegration{
		Enabled: true,
		Mappings: map[string]nexus.MerchantMapping{
			"seller-test": {ShopID: "seller-test", Active: true},
		},
	})
	if !svc.nexusOutboundEnabledForSeller("seller-test") {
		t.Fatal("expected mapped test seller to be enabled for Nexus outbound")
	}
	if svc.nexusOutboundEnabledForSeller("another-seller") {
		t.Fatal("expected unmapped seller not to be sent to Nexus")
	}
}

func TestNexusExternalOrderCodeUsesBuyerFacingCode(t *testing.T) {
	if got := nexusExternalOrderCode(map[string]any{"orderCode": "EMX9000004", "orderNumber": "ORD-20260527-000004"}); got != "EMX9000004" {
		t.Fatalf("expected buyer-facing order code, got %q", got)
	}
	if got := nexusExternalOrderCode(map[string]any{"orderNumber": "ORD-20260527-000004"}); got != "ORD-20260527-000004" {
		t.Fatalf("expected fallback order number, got %q", got)
	}
}

func TestSellerClientGetPickupAddressSuccess(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Internal-Service-Token") != "service-token" {
			t.Fatalf("missing internal token: %s", r.Header.Get("X-Internal-Service-Token"))
		}
		if r.URL.Path != "/api/v1/internal/users/seller-1/pickup-address" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{"sellerId":"seller-1","shopName":"Shop A","senderName":"Shop A","phone":"0901","address":"1 Nguyen Hue","province":"Ho Chi Minh","provinceCode":"79","ward":"Phuong Ben Nghe","wardCode":"26734"}}`))
	}))
	defer srv.Close()

	client := NewSellerClient(srv.URL+"/api/v1", "service-token", time.Second)
	pickup, err := client.GetPickupAddress(context.Background(), "seller-1")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if pickup == nil || pickup.ProvinceCode != "79" || pickup.Ward != "Phuong Ben Nghe" {
		t.Fatalf("unexpected pickup profile: %+v", pickup)
	}
}

func TestNexusPlatformMerchantMapping(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "nexus-mapping.json")
	err := os.WriteFile(path, []byte(`{
		"shopName": "DT Commerce Marketplace",
		"merchantId": "41100000",
		"activeSellerIds": ["9f8a2776-a0d3-4013-ac02-6784166eadd6"],
		"provinceHubMappings": {"79": "HCM-001"},
		"active": true
	}`), 0o600)
	if err != nil {
		t.Fatal(err)
	}

	mappings, err := nexus.LoadMerchantMappings(path)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	mapping, ok := mappings["9f8a2776-a0d3-4013-ac02-6784166eadd6"]
	if !ok {
		t.Fatal("expected seller mapping")
	}
	if mapping.MerchantID != "41100000" || mapping.ShopName != "DT Commerce Marketplace" || mapping.ProvinceHubMappings["79"] != "HCM-001" {
		t.Fatalf("unexpected mapping: %+v", mapping)
	}
}

func TestNexusDynamicSenderUsesSellerPickupAddress(t *testing.T) {
	t.Parallel()

	svc := NewShippingService(nil, nil, "dev-shipping-webhook-signing-secret", 1440, NexusIntegration{})
	pickup := &SellerPickupAddress{
		ShopName:     "Shop A",
		Phone:        "0901",
		Address:      "1 Nguyen Hue",
		Province:     "Ho Chi Minh",
		ProvinceCode: "79",
		Ward:         "Phuong Ben Nghe",
	}
	sender := nexus.AddressContact{
		Name:     firstNonEmpty(pickup.SenderName, pickup.ShopName),
		Phone:    pickup.Phone,
		Address:  pickup.Address,
		Ward:     pickup.Ward,
		Province: pickup.Province,
		HubCode:  nexusHubCodeForPickup(map[string]string{"79": "HCM-001"}, pickup),
	}
	if !nexusSenderIsComplete(sender) || strings.TrimSpace(sender.Ward) == "" {
		t.Fatalf("expected complete sender: %+v", sender)
	}
	if sender.HubCode != "HCM-001" {
		t.Fatalf("expected mapped hub code, got %q", sender.HubCode)
	}
	_ = svc
}
