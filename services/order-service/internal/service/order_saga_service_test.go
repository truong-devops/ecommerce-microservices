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

func TestTargetOrderStatusForShipment(t *testing.T) {
	tests := []struct {
		shipmentStatus string
		want           domain.OrderStatus
		ok             bool
	}{
		{shipmentStatus: "AWB_CREATED", want: domain.OrderStatusProcessing, ok: true},
		{shipmentStatus: "PICKED_UP", want: domain.OrderStatusShipped, ok: true},
		{shipmentStatus: "OUT_FOR_DELIVERY", want: domain.OrderStatusShipped, ok: true},
		{shipmentStatus: "delivered", want: domain.OrderStatusDelivered, ok: true},
		{shipmentStatus: "RETURNED", ok: false},
	}

	for _, tc := range tests {
		got, ok := targetOrderStatusForShipment(tc.shipmentStatus)
		if ok != tc.ok || got != tc.want {
			t.Fatalf("target for %s = %q, %v; want %q, %v", tc.shipmentStatus, got, ok, tc.want, tc.ok)
		}
	}
}

func TestOrderTransitionsForDeliveredShipment(t *testing.T) {
	got := orderTransitionsForShipment(domain.OrderStatusConfirmed, domain.OrderStatusDelivered)
	want := []domain.OrderStatus{domain.OrderStatusProcessing, domain.OrderStatusShipped, domain.OrderStatusDelivered}
	if len(got) != len(want) {
		t.Fatalf("unexpected transition count: got %v want %v", got, want)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("unexpected transitions: got %v want %v", got, want)
		}
	}

	if got := orderTransitionsForShipment(domain.OrderStatusDelivered, domain.OrderStatusDelivered); len(got) != 0 {
		t.Fatalf("completed order must not transition again: %v", got)
	}
}
