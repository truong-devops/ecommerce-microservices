package service

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"

	"payment-service-go/internal/domain"
)

const mockValidSignature = "valid-mock-signature"

type CreatePaymentIntentGatewayInput struct {
	OrderID         string
	Amount          float64
	Currency        string
	Provider        string
	AutoCapture     bool
	SimulatedStatus *domain.PaymentStatus
	Metadata        map[string]any
}

type CreatePaymentIntentGatewayOutput struct {
	ProviderPaymentID    string
	GatewayTransactionID string
	Status               domain.PaymentStatus
	RequiresActionURL    *string
	RawPayload           map[string]any
}

type ParseWebhookGatewayInput struct {
	Provider             string
	ProviderEventID      string
	Status               domain.PaymentStatus
	Signature            *string
	Amount               *float64
	Currency             *string
	PaymentID            *string
	OrderID              *string
	GatewayTransactionID *string
	ProviderPaymentID    *string
	Metadata             map[string]any
	RawPayload           map[string]any
}

type ParseWebhookGatewayOutput struct {
	IsValid              bool
	Reason               *string
	Status               domain.PaymentStatus
	GatewayTransactionID *string
	Amount               *float64
	Currency             *string
	RawPayload           map[string]any
}

type CreateRefundGatewayInput struct {
	PaymentID string
	Amount    float64
	Currency  string
	Reason    *string
}

type CreateRefundGatewayOutput struct {
	ProviderRefundID     string
	GatewayTransactionID string
	Status               domain.RefundStatus
	RawPayload           map[string]any
}

type PaymentGateway interface {
	CreatePaymentIntent(input CreatePaymentIntentGatewayInput) (CreatePaymentIntentGatewayOutput, error)
	ParseWebhook(input ParseWebhookGatewayInput) (ParseWebhookGatewayOutput, error)
	CreateRefund(input CreateRefundGatewayInput) (CreateRefundGatewayOutput, error)
}

type MockPaymentGateway struct{}

func NewMockPaymentGateway() *MockPaymentGateway {
	return &MockPaymentGateway{}
}

func (g *MockPaymentGateway) CreatePaymentIntent(input CreatePaymentIntentGatewayInput) (CreatePaymentIntentGatewayOutput, error) {
	status := domain.PaymentStatusAuthorized
	if input.AutoCapture {
		status = domain.PaymentStatusCaptured
	}
	if input.SimulatedStatus != nil {
		status = *input.SimulatedStatus
	}

	var actionURL *string
	if status == domain.PaymentStatusRequiresAction {
		v := "https://mock-gateway.local/3ds/" + randID(12)
		actionURL = &v
	}

	return CreatePaymentIntentGatewayOutput{
		ProviderPaymentID:    "mock_pay_" + randID(16),
		GatewayTransactionID: "mock_txn_" + randID(16),
		Status:               status,
		RequiresActionURL:    actionURL,
		RawPayload: map[string]any{
			"source":  "mock-gateway",
			"status":  status,
			"orderId": input.OrderID,
		},
	}, nil
}

func (g *MockPaymentGateway) ParseWebhook(input ParseWebhookGatewayInput) (ParseWebhookGatewayOutput, error) {
	if input.Signature != nil && *input.Signature != "" && *input.Signature != mockValidSignature {
		reason := "Invalid mock signature"
		return ParseWebhookGatewayOutput{IsValid: false, Reason: &reason, Status: input.Status}, nil
	}

	rawPayload := map[string]any{
		"source":          "mock-gateway-webhook",
		"providerEventId": input.ProviderEventID,
		"status":          input.Status,
	}
	for k, v := range input.RawPayload {
		rawPayload[k] = v
	}

	return ParseWebhookGatewayOutput{
		IsValid:              true,
		Status:               input.Status,
		GatewayTransactionID: input.GatewayTransactionID,
		Amount:               input.Amount,
		Currency:             input.Currency,
		RawPayload:           rawPayload,
	}, nil
}

func (g *MockPaymentGateway) CreateRefund(input CreateRefundGatewayInput) (CreateRefundGatewayOutput, error) {
	return CreateRefundGatewayOutput{
		ProviderRefundID:     "mock_ref_" + randID(16),
		GatewayTransactionID: "mock_ref_txn_" + randID(16),
		Status:               domain.RefundStatusSucceeded,
		RawPayload: map[string]any{
			"source":    "mock-gateway-refund",
			"paymentId": input.PaymentID,
			"amount":    input.Amount,
			"reason":    derefString(input.Reason),
		},
	}, nil
}

func randID(length int) string {
	if length < 2 {
		length = 2
	}
	b := make([]byte, (length+1)/2)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("fallback%d", length)
	}
	out := hex.EncodeToString(b)
	if len(out) > length {
		return out[:length]
	}
	return out
}

func derefString(v *string) any {
	if v == nil {
		return nil
	}
	return *v
}
