package service

import (
	"testing"
	"time"

	"payment-service-go/internal/domain"
)

func TestSePayTransferTimeParsesVietnamBankTimestamp(t *testing.T) {
	t.Parallel()

	got := sePayTransferTime(SePayWebhookPayload{TransactionDate: "2026-05-31 13:36:48"}, time.Time{})
	want := time.Date(2026, 5, 31, 6, 36, 48, 0, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("unexpected transfer time: got %s want %s", got, want)
	}
}

func TestCanRecoverFailedSePayPaymentWhenTransferWasBeforeExpiry(t *testing.T) {
	t.Parallel()

	expiresAt := time.Date(2026, 5, 31, 6, 50, 50, 0, time.UTC)
	payment := domain.Payment{
		Status:    domain.PaymentStatusFailed,
		ExpiresAt: &expiresAt,
	}

	beforeExpiry := time.Date(2026, 5, 31, 6, 36, 48, 0, time.UTC)
	if !canRecoverFailedSePayPayment(payment, beforeExpiry) {
		t.Fatalf("expected failed SePay payment to be recoverable when transfer happened before expiry")
	}

	afterExpiry := time.Date(2026, 5, 31, 6, 51, 0, 0, time.UTC)
	if canRecoverFailedSePayPayment(payment, afterExpiry) {
		t.Fatalf("expected failed SePay payment not to be recoverable after expiry")
	}
}

func TestPaymentGroupResponseKeepsChildAllocations(t *testing.T) {
	t.Parallel()

	sellerA := "11111111-1111-4111-8111-111111111111"
	sellerB := "22222222-2222-4222-8222-222222222222"
	group := domain.PaymentGroup{
		ID:        "33333333-3333-4333-8333-333333333333",
		UserID:    "44444444-4444-4444-8444-444444444444",
		Provider:  "sepay",
		Status:    domain.PaymentStatusRequiresAction,
		Currency:  "VND",
		Amount:    350000,
		Metadata:  map[string]any{"paymentInstructions": map[string]any{"paymentCode": "EMXGROUP"}},
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}
	items := []domain.PaymentGroupItem{
		{GroupID: group.ID, Amount: 100000, Payment: domain.Payment{ID: "55555555-5555-4555-8555-555555555555", OrderID: "66666666-6666-4666-8666-666666666666", SellerID: &sellerA, Status: domain.PaymentStatusRequiresAction}},
		{GroupID: group.ID, Amount: 250000, Payment: domain.Payment{ID: "77777777-7777-4777-8777-777777777777", OrderID: "88888888-8888-4888-8888-888888888888", SellerID: &sellerB, Status: domain.PaymentStatusRequiresAction}},
	}

	response := toPaymentGroupResponse(group, items)
	if response["amount"] != float64(350000) {
		t.Fatalf("unexpected group total: %v", response["amount"])
	}
	payments, ok := response["payments"].([]map[string]any)
	if !ok || len(payments) != 2 {
		t.Fatalf("expected two allocated child payments, got %#v", response["payments"])
	}
	if payments[0]["amount"] != float64(100000) || payments[1]["amount"] != float64(250000) {
		t.Fatalf("unexpected child allocations: %#v", payments)
	}
	if _, ok := response["paymentInstructions"]; !ok {
		t.Fatalf("expected payment instructions in group response")
	}
}

func TestUniqueTrimmedStringsPreservesFirstOrder(t *testing.T) {
	t.Parallel()

	got := uniqueTrimmedStrings([]string{" order-b ", "order-a", "order-b", "", "order-a"})
	if len(got) != 2 || got[0] != "order-b" || got[1] != "order-a" {
		t.Fatalf("unexpected normalized order ids: %#v", got)
	}
}
