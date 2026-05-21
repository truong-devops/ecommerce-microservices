package service

import (
	"testing"

	"payment-service-go/internal/domain"
)

func TestMockPaymentGatewayDefaultAutoCapture(t *testing.T) {
	gateway := NewMockPaymentGateway()

	result, err := gateway.CreatePaymentIntent(CreatePaymentIntentGatewayInput{
		OrderID:     "11111111-1111-4111-8111-111111111111",
		Amount:      25.50,
		Currency:    "USD",
		Provider:    "mock",
		AutoCapture: true,
	})
	if err != nil {
		t.Fatalf("create payment intent: %v", err)
	}
	if result.Status != domain.PaymentStatusCaptured {
		t.Fatalf("expected CAPTURED, got %s", result.Status)
	}
	if result.ProviderPaymentID == "" || result.GatewayTransactionID == "" {
		t.Fatalf("expected provider and gateway ids")
	}
}

func TestMockPaymentGatewaySimulatedFailure(t *testing.T) {
	gateway := NewMockPaymentGateway()
	status := domain.PaymentStatusFailed

	result, err := gateway.CreatePaymentIntent(CreatePaymentIntentGatewayInput{
		OrderID:         "11111111-1111-4111-8111-111111111111",
		Amount:          25.50,
		Currency:        "USD",
		Provider:        "mock",
		AutoCapture:     true,
		SimulatedStatus: &status,
	})
	if err != nil {
		t.Fatalf("create payment intent: %v", err)
	}
	if result.Status != domain.PaymentStatusFailed {
		t.Fatalf("expected FAILED, got %s", result.Status)
	}
}
