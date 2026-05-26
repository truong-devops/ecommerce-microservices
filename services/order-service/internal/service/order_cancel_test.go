package service

import (
	"testing"

	"order-service/internal/domain"
)

func TestCustomerCanOnlyCancelPendingOrder(t *testing.T) {
	customer := domain.UserContext{UserID: "customer-1", Role: domain.RoleCustomer}

	if err := assertCanCancelOrder(customer, domain.Order{UserID: customer.UserID, Status: domain.OrderStatusPending}); err != nil {
		t.Fatalf("expected pending order cancellation to be allowed: %v", err)
	}

	for _, status := range []domain.OrderStatus{domain.OrderStatusConfirmed, domain.OrderStatusProcessing, domain.OrderStatusShipped, domain.OrderStatusDelivered} {
		if err := assertCanCancelOrder(customer, domain.Order{UserID: customer.UserID, Status: status}); err == nil {
			t.Fatalf("expected customer cancellation to be rejected for %s order", status)
		}
	}
}

func TestSellerCanOnlyAccessOwnOrder(t *testing.T) {
	seller := domain.UserContext{UserID: "seller-1", Role: domain.RoleSeller}

	if err := assertCanReadOrder(seller, domain.Order{SellerID: seller.UserID}); err != nil {
		t.Fatalf("expected seller to read own order: %v", err)
	}
	if err := assertCanReadOrder(seller, domain.Order{SellerID: "seller-2"}); err == nil {
		t.Fatalf("expected seller read access to another seller order to be rejected")
	}
	if err := assertCanCancelOrder(seller, domain.Order{SellerID: "seller-2", Status: domain.OrderStatusPending}); err == nil {
		t.Fatalf("expected seller cancellation of another seller order to be rejected")
	}
}

func TestSellerCanOnlyUpdatePendingOrderBeforeDispatch(t *testing.T) {
	seller := domain.UserContext{UserID: "seller-1", Role: domain.RoleSeller}

	for _, next := range []domain.OrderStatus{domain.OrderStatusConfirmed, domain.OrderStatusCancelled} {
		if err := assertCanManuallyUpdateOrderStatus(seller, domain.OrderStatusPending, next); err != nil {
			t.Fatalf("expected pending order transition to %s to be allowed: %v", next, err)
		}
	}

	for _, transition := range [][2]domain.OrderStatus{
		{domain.OrderStatusConfirmed, domain.OrderStatusCancelled},
		{domain.OrderStatusConfirmed, domain.OrderStatusFailed},
		{domain.OrderStatusProcessing, domain.OrderStatusFailed},
	} {
		if err := assertCanManuallyUpdateOrderStatus(seller, transition[0], transition[1]); err == nil {
			t.Fatalf("expected seller transition from %s to %s to be rejected", transition[0], transition[1])
		}
	}
}

func TestConfirmedOrderCannotBeCancelledAfterDispatchStarts(t *testing.T) {
	if err := assertCanTransition(domain.OrderStatusConfirmed, domain.OrderStatusCancelled); err == nil {
		t.Fatalf("expected confirmed order cancellation to be rejected after dispatch starts")
	}
}
