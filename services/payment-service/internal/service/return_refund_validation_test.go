package service

import (
	"strings"
	"testing"

	"payment-service-go/internal/domain"
)

func TestValidateOrderReturnRefundApprovedEvent(t *testing.T) {
	sellerID := "33333333-3333-4333-8333-333333333333"
	payment := domain.Payment{
		ID:       "payment-1",
		OrderID:  "11111111-1111-4111-8111-111111111111",
		UserID:   "22222222-2222-4222-8222-222222222222",
		SellerID: &sellerID,
		Amount:   109000,
		Currency: "VND",
	}
	valid := OrderReturnRefundApprovedEvent{
		ReturnRequestID: "44444444-4444-4444-8444-444444444444",
		OrderID:         payment.OrderID,
		CustomerID:      payment.UserID,
		SellerID:        sellerID,
		RefundAmount:    payment.Amount,
		Currency:        "vnd",
	}

	if err := validateOrderReturnRefundApprovedEvent(payment, valid); err != nil {
		t.Fatalf("valid event rejected: %v", err)
	}

	tests := []struct {
		name    string
		mutate  func(*OrderReturnRefundApprovedEvent)
		message string
	}{
		{name: "missing return", mutate: func(e *OrderReturnRefundApprovedEvent) { e.ReturnRequestID = "" }, message: "returnRequestId"},
		{name: "wrong order", mutate: func(e *OrderReturnRefundApprovedEvent) { e.OrderID = "other-order" }, message: "order"},
		{name: "wrong customer", mutate: func(e *OrderReturnRefundApprovedEvent) { e.CustomerID = "other-customer" }, message: "customer"},
		{name: "wrong seller", mutate: func(e *OrderReturnRefundApprovedEvent) { e.SellerID = "other-seller" }, message: "seller"},
		{name: "wrong amount", mutate: func(e *OrderReturnRefundApprovedEvent) { e.RefundAmount-- }, message: "amount"},
		{name: "wrong currency", mutate: func(e *OrderReturnRefundApprovedEvent) { e.Currency = "USD" }, message: "currency"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			event := valid
			test.mutate(&event)
			err := validateOrderReturnRefundApprovedEvent(payment, event)
			if err == nil || !strings.Contains(err.Error(), test.message) {
				t.Fatalf("expected %q validation error, got %v", test.message, err)
			}
		})
	}
}
