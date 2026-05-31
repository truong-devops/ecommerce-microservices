package service

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"

	"payment-service-go/internal/config"
	"payment-service-go/internal/domain"
)

func TestSePayGatewayCreatePaymentIntentBuildsQRInstructions(t *testing.T) {
	gateway := NewSePayGateway(config.SePayConfig{
		BankCode:                    "Vietcombank",
		BankAccountNumber:           "0010000000355",
		BankAccountName:             "EMALL COMPANY",
		PaymentCodePrefix:           "EMX",
		TransferDescriptionTemplate: "{paymentCode} thanh toan don {orderCode}",
		QRTemplate:                  "compact",
		PaymentExpiresMinutes:       15,
	})

	orderNumber := "ORD-20260531-123"
	result, err := gateway.CreatePaymentIntent(CreatePaymentIntentGatewayInput{
		OrderID:     "11111111-1111-4111-8111-111111111111",
		OrderNumber: &orderNumber,
		Amount:      235000,
		Currency:    "VND",
		Provider:    "sepay",
	})
	if err != nil {
		t.Fatalf("create payment intent: %v", err)
	}
	if result.Status != domain.PaymentStatusPending {
		t.Fatalf("expected PENDING, got %s", result.Status)
	}
	if result.Instructions == nil {
		t.Fatalf("expected payment instructions")
	}
	if !strings.HasPrefix(result.ProviderPaymentID, "EMX") {
		t.Fatalf("expected EMX payment code, got %s", result.ProviderPaymentID)
	}
	if !strings.Contains(result.Instructions.QRImageURL, "qr.sepay.vn/img") ||
		!strings.Contains(result.Instructions.QRImageURL, "amount=235000") ||
		!strings.Contains(result.Instructions.QRImageURL, "acc=0010000000355") {
		t.Fatalf("unexpected QR URL: %s", result.Instructions.QRImageURL)
	}
	if !strings.Contains(result.Instructions.TransferDescription, result.ProviderPaymentID) {
		t.Fatalf("description must include payment code: %s", result.Instructions.TransferDescription)
	}
}

func TestSePayGatewayRejectsNonWholeVND(t *testing.T) {
	gateway := NewSePayGateway(config.SePayConfig{BankCode: "VCB", BankAccountNumber: "123"})

	if _, err := gateway.CreatePaymentIntent(CreatePaymentIntentGatewayInput{
		OrderID:  "11111111-1111-4111-8111-111111111111",
		Amount:   25.50,
		Currency: "VND",
	}); err == nil {
		t.Fatalf("expected decimal VND amount to fail")
	}
	if _, err := gateway.CreatePaymentIntent(CreatePaymentIntentGatewayInput{
		OrderID:  "11111111-1111-4111-8111-111111111111",
		Amount:   235000,
		Currency: "USD",
	}); err == nil {
		t.Fatalf("expected non-VND currency to fail")
	}
}

func TestSePayGatewayVerifyWebhookHMAC(t *testing.T) {
	secret := "test-secret"
	now := time.Unix(1_800_000_000, 0).UTC()
	body := []byte(`{"id":123,"transferType":"in"}`)
	timestamp := "1800000000"
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp))
	mac.Write([]byte("."))
	mac.Write(body)

	headers := http.Header{}
	headers.Set("X-SePay-Timestamp", timestamp)
	headers.Set("X-SePay-Signature", "sha256="+hex.EncodeToString(mac.Sum(nil)))

	gateway := NewSePayGateway(config.SePayConfig{
		WebhookAuthMode:           "hmac",
		WebhookSecret:             secret,
		TimestampToleranceSeconds: 300,
	})
	if err := gateway.VerifyWebhook(headers, body, now); err != nil {
		t.Fatalf("verify webhook: %v", err)
	}

	if err := gateway.VerifyWebhook(headers, []byte(`{"id":124}`), now); err == nil {
		t.Fatalf("expected tampered body to fail signature verification")
	}

	headers.Set("X-SePay-Timestamp", "1799999000")
	if err := gateway.VerifyWebhook(headers, body, now); err == nil {
		t.Fatalf("expected stale timestamp to fail signature verification")
	}
}

func TestSePayGatewayVerifyWebhookHMACAcceptsRotatedSecrets(t *testing.T) {
	activeSecret := "active-secret"
	now := time.Unix(1_800_000_000, 0).UTC()
	body := []byte(`{"id":123,"transferType":"in"}`)
	timestamp := "1800000000"
	mac := hmac.New(sha256.New, []byte(activeSecret))
	mac.Write([]byte(timestamp))
	mac.Write([]byte("."))
	mac.Write(body)

	headers := http.Header{}
	headers.Set("X-SePay-Timestamp", timestamp)
	headers.Set("X-SePay-Signature", "sha256="+hex.EncodeToString(mac.Sum(nil)))

	gateway := NewSePayGateway(config.SePayConfig{
		WebhookAuthMode:           "hmac",
		WebhookSecret:             "old-secret",
		WebhookSecrets:            []string{"old-secret", activeSecret},
		TimestampToleranceSeconds: 300,
	})
	if err := gateway.VerifyWebhook(headers, body, now); err != nil {
		t.Fatalf("verify webhook with rotated secrets: %v", err)
	}
}

func TestSePayGatewayVerifyWebhookAPIKey(t *testing.T) {
	gateway := NewSePayGateway(config.SePayConfig{
		WebhookAuthMode: "apikey",
		WebhookAPIKey:   "expected-key",
	})

	headers := http.Header{}
	headers.Set("Authorization", "Bearer expected-key")
	if err := gateway.VerifyWebhook(headers, []byte(`{}`), time.Now().UTC()); err != nil {
		t.Fatalf("verify api key: %v", err)
	}

	headers.Set("Authorization", "Bearer wrong-key")
	if err := gateway.VerifyWebhook(headers, []byte(`{}`), time.Now().UTC()); err == nil {
		t.Fatalf("expected invalid api key to fail")
	}
}

func TestSePayGatewayVerifyWebhookAutoMode(t *testing.T) {
	gateway := NewSePayGateway(config.SePayConfig{
		WebhookAuthMode: "auto",
		WebhookSecret:   "wrong-secret",
		WebhookAPIKey:   "expected-key",
	})

	headers := http.Header{}
	headers.Set("X-SePay-Timestamp", strconv.FormatInt(time.Now().UTC().Unix(), 10))
	headers.Set("X-SePay-Signature", "sha256=invalid")
	headers.Set("Authorization", "Bearer expected-key")

	if err := gateway.VerifyWebhook(headers, []byte(`{}`), time.Now().UTC()); err != nil {
		t.Fatalf("auto mode should accept valid api key fallback: %v", err)
	}
}

func TestSePayGatewayParseWebhookPayloadFallbackCode(t *testing.T) {
	gateway := NewSePayGateway(config.SePayConfig{PaymentCodePrefix: "EMX"})
	payload, _, err := gateway.ParseWebhookPayload([]byte(`{
		"id": 123,
		"referenceCode": "FT123",
		"content": "Thanh toan EMXABC123DEF456",
		"transferType": "in",
		"transferAmount": 235000
	}`))
	if err != nil {
		t.Fatalf("parse payload: %v", err)
	}
	if payload.ProviderEventID() != "123" {
		t.Fatalf("unexpected provider event id: %s", payload.ProviderEventID())
	}
	if payload.Code != "EMXABC123DEF456" {
		t.Fatalf("expected fallback code extraction, got %s", payload.Code)
	}
}
