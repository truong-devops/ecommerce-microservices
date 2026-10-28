package service

import (
	"testing"

	"order-service/internal/domain"
)

func TestValidateCreateReturnRequest(t *testing.T) {
	tests := []struct {
		name    string
		request CreateReturnRequest
		wantErr bool
	}{
		{name: "valid", request: CreateReturnRequest{ReasonCode: "DAMAGED", ReasonDetail: "Sản phẩm bị vỡ khi mở hộp", EvidenceURLs: []string{"https://media.example/evidence.jpg"}}},
		{name: "invalid reason", request: CreateReturnRequest{ReasonCode: "CHANGED_MIND", ReasonDetail: "Tôi không còn nhu cầu sử dụng"}, wantErr: true},
		{name: "detail too short", request: CreateReturnRequest{ReasonCode: "OTHER", ReasonDetail: "hỏng"}, wantErr: true},
		{name: "unsafe evidence scheme", request: CreateReturnRequest{ReasonCode: "DAMAGED", ReasonDetail: "Sản phẩm bị vỡ khi mở hộp", EvidenceURLs: []string{"file:///tmp/evidence.jpg"}}, wantErr: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateCreateReturnRequest(test.request)
			if (err != nil) != test.wantErr {
				t.Fatalf("validateCreateReturnRequest() error = %v, wantErr %v", err, test.wantErr)
			}
		})
	}
}

func TestValidateCustomerRefundCredited(t *testing.T) {
	request := domain.ReturnRequest{
		ID: "return-1", OrderID: "order-1", CustomerID: "customer-1",
		Status: domain.ReturnRequestStatusRefundPending, RefundAmount: 125_000, Currency: "VND",
	}
	valid := CustomerRefundCreditedEvent{
		OrderID: "order-1", PaymentID: "payment-1", CustomerID: "customer-1",
		WalletID: "wallet-1", Currency: "VND", RefundedAmount: 125_000,
	}

	tests := []struct {
		name    string
		request domain.ReturnRequest
		event   CustomerRefundCreditedEvent
		wantErr bool
	}{
		{name: "valid", request: request, event: valid},
		{name: "wrong status", request: func() domain.ReturnRequest {
			value := request
			value.Status = domain.ReturnRequestStatusReturning
			return value
		}(), event: valid, wantErr: true},
		{name: "wrong customer", request: request, event: func() CustomerRefundCreditedEvent { value := valid; value.CustomerID = "customer-2"; return value }(), wantErr: true},
		{name: "wrong currency", request: request, event: func() CustomerRefundCreditedEvent { value := valid; value.Currency = "USD"; return value }(), wantErr: true},
		{name: "partial amount", request: request, event: func() CustomerRefundCreditedEvent { value := valid; value.RefundedAmount = 25_000; return value }(), wantErr: true},
		{name: "missing payment", request: request, event: func() CustomerRefundCreditedEvent { value := valid; value.PaymentID = ""; return value }(), wantErr: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateCustomerRefundCredited(test.request, test.event)
			if (err != nil) != test.wantErr {
				t.Fatalf("validateCustomerRefundCredited() error = %v, wantErr %v", err, test.wantErr)
			}
		})
	}
}

func TestReturnPermissions(t *testing.T) {
	request := domain.ReturnRequest{CustomerID: "customer-1", SellerID: "seller-1"}
	if err := assertCanReadReturn(domain.UserContext{UserID: "customer-1", Role: domain.RoleCustomer}, request); err != nil {
		t.Fatalf("owner customer should read: %v", err)
	}
	if err := assertCanManageReturn(domain.UserContext{UserID: "seller-1", Role: domain.RoleSeller}, request); err != nil {
		t.Fatalf("owner seller should manage: %v", err)
	}
	if err := assertCanManageReturn(domain.UserContext{UserID: "other-seller", Role: domain.RoleSeller}, request); err == nil {
		t.Fatal("another seller must not manage return")
	}
	if err := assertCanReadReturn(domain.UserContext{UserID: "admin", Role: domain.RoleAdmin}, request); err != nil {
		t.Fatalf("admin should read: %v", err)
	}
}
