package service

import (
	"testing"

	"chat-service/internal/domain"
)

func TestBuildConversationKey(t *testing.T) {
	orderID := "order-123"
	productID := "product-abc"
	shopID := "shop-1"

	key := buildConversationKey("buyer-1", "seller-1", domain.ConversationContext{
		OrderID:   &orderID,
		ProductID: &productID,
		ShopID:    &shopID,
	})

	expected := "buyer-1|seller-1|order:order-123|product:product-abc|shop:shop-1"
	if key != expected {
		t.Fatalf("expected key %q, got %q", expected, key)
	}
}

func TestHasConversationAccess(t *testing.T) {
	conversation := domain.Conversation{
		BuyerID:  "buyer-1",
		SellerID: "seller-1",
	}

	if !hasConversationAccess(domain.UserContext{UserID: "buyer-1", Role: domain.RoleCustomer}, conversation) {
		t.Fatalf("buyer should have access")
	}
	if !hasConversationAccess(domain.UserContext{UserID: "seller-1", Role: domain.RoleSeller}, conversation) {
		t.Fatalf("seller should have access")
	}
	if hasConversationAccess(domain.UserContext{UserID: "buyer-2", Role: domain.RoleCustomer}, conversation) {
		t.Fatalf("other buyer should not have access")
	}
	if !hasConversationAccess(domain.UserContext{UserID: "admin-1", Role: domain.RoleAdmin}, conversation) {
		t.Fatalf("admin should have access")
	}
}
