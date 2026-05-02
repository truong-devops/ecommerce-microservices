package service

import "testing"

func TestResolveRecipientIDChatMessageCreated(t *testing.T) {
	t.Run("uses explicit recipientId", func(t *testing.T) {
		payload := map[string]any{
			"recipientId": "user-recipient",
			"buyerId":     "buyer-1",
			"sellerId":    "seller-1",
			"senderId":    "buyer-1",
		}

		got := resolveRecipientID("chat.message.created", payload)
		if got != "user-recipient" {
			t.Fatalf("expected explicit recipient id, got %q", got)
		}
	})

	t.Run("derives recipient from sender and participants", func(t *testing.T) {
		payload := map[string]any{
			"buyerId":  "buyer-1",
			"sellerId": "seller-1",
			"senderId": "seller-1",
		}

		got := resolveRecipientID("chat.message.created", payload)
		if got != "buyer-1" {
			t.Fatalf("expected buyer recipient, got %q", got)
		}
	})
}

func TestMapEventToNotificationsChatMessageCreated(t *testing.T) {
	payload := map[string]any{
		"recipientId": "seller-1",
		"buyerId":     "buyer-1",
		"sellerId":    "seller-1",
		"senderId":    "buyer-1",
		"message": map[string]any{
			"text": "Xin chao seller, cho minh hoi ve san pham nay.",
		},
	}

	mapped := mapEventToNotifications("chat.message.created", payload)
	if len(mapped) != 1 {
		t.Fatalf("expected one notification, got %d", len(mapped))
	}

	item := mapped[0]
	if item.RecipientID != "seller-1" {
		t.Fatalf("expected recipient seller-1, got %q", item.RecipientID)
	}
	if item.EventType == nil || *item.EventType != "chat.message.created" {
		t.Fatalf("expected event type chat.message.created")
	}
	if item.Subject == nil || *item.Subject != "New message" {
		t.Fatalf("unexpected subject: %#v", item.Subject)
	}
	if item.Content == "" {
		t.Fatalf("content should not be empty")
	}
}
