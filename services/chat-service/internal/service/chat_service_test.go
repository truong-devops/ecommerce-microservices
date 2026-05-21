package service

import (
	"testing"
	"time"

	"chat-service/internal/domain"
)

func TestBuildConversationKey(t *testing.T) {
	key := buildConversationKey("buyer-1", "seller-1")

	expected := "buyer-1|seller-1"
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

func TestChatPubSubEnvelopeAddsVersionAndMessageMetadata(t *testing.T) {
	occurredAt := time.Date(2026, 5, 21, 9, 0, 0, 123, time.UTC)
	envelope := chatPubSubEnvelope(domain.EventMessageCreated, " conversation-1 ", " message-1 ", occurredAt, map[string]any{
		"message": map[string]any{"id": "message-1"},
	})

	if envelope["type"] != domain.EventMessageCreated {
		t.Fatalf("unexpected type: %v", envelope["type"])
	}
	if envelope["version"] != 1 {
		t.Fatalf("unexpected version: %v", envelope["version"])
	}
	if envelope["conversationId"] != "conversation-1" {
		t.Fatalf("unexpected conversationId: %v", envelope["conversationId"])
	}
	if envelope["messageId"] != "message-1" {
		t.Fatalf("unexpected messageId: %v", envelope["messageId"])
	}
	if envelope["occurredAt"] != occurredAt.Format(time.RFC3339Nano) {
		t.Fatalf("unexpected occurredAt: %v", envelope["occurredAt"])
	}
	if envelope["message"] == nil {
		t.Fatal("expected original payload fields to be preserved")
	}
}
