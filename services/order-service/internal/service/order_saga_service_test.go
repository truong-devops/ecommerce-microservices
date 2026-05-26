package service

import (
	"testing"

	"order-service/internal/domain"
)

func TestCheckoutPrerequisitesSatisfiedForOnlinePayment(t *testing.T) {
	state := &domain.OrderSagaState{
		InventoryStatus: domain.SagaInventoryStatusReserved,
		PaymentStatus:   domain.SagaPaymentStatusCaptured,
	}
	if !checkoutPrerequisitesSatisfied(domain.Order{PaymentMethod: "ONLINE"}, state) {
		t.Fatalf("expected checkout prerequisites to be satisfied")
	}
}

func TestCheckoutPrerequisitesForOnlineRequireInventoryAndPayment(t *testing.T) {
	cases := []domain.OrderSagaState{
		{InventoryStatus: domain.SagaInventoryStatusPending, PaymentStatus: domain.SagaPaymentStatusCaptured},
		{InventoryStatus: domain.SagaInventoryStatusReserved, PaymentStatus: domain.SagaPaymentStatusPending},
		{InventoryStatus: domain.SagaInventoryStatusFailed, PaymentStatus: domain.SagaPaymentStatusCaptured},
	}
	for _, state := range cases {
		if checkoutPrerequisitesSatisfied(domain.Order{PaymentMethod: "ONLINE"}, &state) {
			t.Fatalf("did not expect checkout prerequisites to be satisfied for state %+v", state)
		}
	}
	if checkoutPrerequisitesSatisfied(domain.Order{PaymentMethod: "ONLINE"}, nil) {
		t.Fatalf("nil state must not satisfy checkout prerequisites")
	}
}

func TestCheckoutPrerequisitesSatisfiedForCODAfterInventoryReservation(t *testing.T) {
	state := &domain.OrderSagaState{InventoryStatus: domain.SagaInventoryStatusReserved}
	if !checkoutPrerequisitesSatisfied(domain.Order{PaymentMethod: "COD"}, state) {
		t.Fatalf("expected COD checkout prerequisites after inventory reservation")
	}
}

func TestSellerCanOnlyConfirmCompletedCheckout(t *testing.T) {
	order := domain.Order{PaymentMethod: "COD"}
	state := &domain.OrderSagaState{
		SagaStatus:      domain.SagaStatusPending,
		InventoryStatus: domain.SagaInventoryStatusReserved,
	}
	if canSellerConfirmCheckout(order, state) {
		t.Fatalf("expected pending checkout saga to reject seller confirmation")
	}

	state.SagaStatus = domain.SagaStatusCompleted
	if !canSellerConfirmCheckout(order, state) {
		t.Fatalf("expected completed COD checkout to allow seller confirmation")
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
