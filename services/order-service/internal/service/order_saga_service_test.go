package service

import (
	"testing"

	"order-service/internal/domain"
)

func TestCanConfirmCheckout(t *testing.T) {
	state := &domain.OrderSagaState{
		InventoryStatus: domain.SagaInventoryStatusReserved,
		PaymentStatus:   domain.SagaPaymentStatusCaptured,
	}
	if !canConfirmCheckout(state) {
		t.Fatalf("expected checkout to be confirmable")
	}
}

func TestCanConfirmCheckoutRequiresBothInventoryAndPayment(t *testing.T) {
	cases := []domain.OrderSagaState{
		{InventoryStatus: domain.SagaInventoryStatusPending, PaymentStatus: domain.SagaPaymentStatusCaptured},
		{InventoryStatus: domain.SagaInventoryStatusReserved, PaymentStatus: domain.SagaPaymentStatusPending},
		{InventoryStatus: domain.SagaInventoryStatusFailed, PaymentStatus: domain.SagaPaymentStatusCaptured},
	}
	for _, state := range cases {
		if canConfirmCheckout(&state) {
			t.Fatalf("did not expect checkout to be confirmable for state %+v", state)
		}
	}
	if canConfirmCheckout(nil) {
		t.Fatalf("nil state must not be confirmable")
	}
}
