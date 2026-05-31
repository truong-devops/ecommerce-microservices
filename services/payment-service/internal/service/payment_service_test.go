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
