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
	if !canConfirmCheckout(domain.Order{PaymentMethod: "ONLINE"}, state) {
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
		if canConfirmCheckout(domain.Order{PaymentMethod: "ONLINE"}, &state) {
			t.Fatalf("did not expect checkout to be confirmable for state %+v", state)
		}
	}
	if canConfirmCheckout(domain.Order{PaymentMethod: "ONLINE"}, nil) {
		t.Fatalf("nil state must not be confirmable")
	}
}

func TestCanConfirmCODCheckoutAfterInventoryReservation(t *testing.T) {
	state := &domain.OrderSagaState{InventoryStatus: domain.SagaInventoryStatusReserved}
	if !canConfirmCheckout(domain.Order{PaymentMethod: "COD"}, state) {
		t.Fatalf("expected COD checkout to be confirmable after inventory reservation")
	}
}
