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
