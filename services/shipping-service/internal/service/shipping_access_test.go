package service

import (
	"testing"

	"shipping-service/internal/domain"
)

func TestEnsureCanReadRestrictsShipmentOwners(t *testing.T) {
	shipment := domain.Shipment{
		BuyerID:  "buyer-owner",
		SellerID: "seller-owner",
	}

	cases := []struct {
		name    string
		user    domain.UserContext
		wantErr bool
	}{
		{name: "buyer owner", user: domain.UserContext{UserID: "buyer-owner", Role: domain.RoleCustomer}},
		{name: "other buyer", user: domain.UserContext{UserID: "buyer-other", Role: domain.RoleCustomer}, wantErr: true},
		{name: "seller owner", user: domain.UserContext{UserID: "seller-owner", Role: domain.RoleSeller}},
		{name: "other seller", user: domain.UserContext{UserID: "seller-other", Role: domain.RoleSeller}, wantErr: true},
		{name: "warehouse staff", user: domain.UserContext{UserID: "warehouse", Role: domain.RoleWarehouse}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := ensureCanRead(tc.user, shipment)
			if tc.wantErr && err == nil {
				t.Fatal("expected access to be denied")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("expected access to be allowed, got %v", err)
			}
		})
	}
}
