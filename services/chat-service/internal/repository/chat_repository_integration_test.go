package repository

import (
	"context"
	"os"
	"testing"
	"time"

	"chat-service/internal/domain"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func TestCreateMessageIdempotencyAndUnreadCounter(t *testing.T) {
	mongoURI := os.Getenv("MONGO_TEST_URI")
	if mongoURI == "" {
		t.Skip("MONGO_TEST_URI is not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(mongoURI))
	if err != nil {
		t.Skipf("skip integration test, mongo unavailable: %v", err)
	}
	defer client.Disconnect(context.Background())

	if err := client.Ping(ctx, nil); err != nil {
		t.Skipf("skip integration test, mongo ping failed: %v", err)
	}

	dbName := "chat_integration_test_" + time.Now().UTC().Format("20060102150405")
	db := client.Database(dbName)
	defer db.Drop(context.Background())

	repo := NewChatRepository(db)
	if err := repo.EnsureIndexes(ctx); err != nil {
		t.Fatalf("ensure indexes: %v", err)
	}

	conversation, _, err := repo.CreateConversation(ctx, CreateConversationInput{
		Key:      "buyer-1|seller-1|order:order-1",
		BuyerID:  "buyer-1",
		SellerID: "seller-1",
		Context: domain.ConversationContext{
			OrderID: toPtr("order-1"),
		},
	})
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}

	payload := map[string]any{
		"conversationId": conversation.ID,
		"message": map[string]any{
			"clientMessageId": "buyer-msg-1",
		},
	}

	first, err := repo.CreateMessageAndOutbox(ctx, SendMessageTxInput{
		ConversationID:  conversation.ID,
		SenderID:        "buyer-1",
		SenderRole:      domain.RoleCustomer,
		ClientMessageID: "buyer-msg-1",
		Text:            "hello",
		SentAt:          time.Now().UTC(),
		EventType:       domain.EventMessageCreated,
		EventPayload:    payload,
	})
	if err != nil {
		t.Fatalf("first send: %v", err)
	}
	if !first.Created {
		t.Fatalf("expected first send to create message")
	}

	second, err := repo.CreateMessageAndOutbox(ctx, SendMessageTxInput{
		ConversationID:  conversation.ID,
		SenderID:        "buyer-1",
		SenderRole:      domain.RoleCustomer,
		ClientMessageID: "buyer-msg-1",
		Text:            "hello",
		SentAt:          time.Now().UTC(),
		EventType:       domain.EventMessageCreated,
		EventPayload:    payload,
	})
	if err != nil {
		t.Fatalf("second send: %v", err)
	}
	if second.Created {
		t.Fatalf("expected second send to be idempotent")
	}
	if second.Message.ID != first.Message.ID {
		t.Fatalf("expected same message id, got %s and %s", first.Message.ID, second.Message.ID)
	}

	convAfterSend, err := repo.FindConversationByID(ctx, conversation.ID)
	if err != nil {
		t.Fatalf("find conversation after send: %v", err)
	}
	if convAfterSend == nil {
		t.Fatalf("conversation not found after send")
	}
	if convAfterSend.Unread.Seller != 1 {
		t.Fatalf("expected unread.seller = 1, got %d", convAfterSend.Unread.Seller)
	}

	if _, err := repo.MarkMessagesRead(ctx, conversation.ID, domain.RoleSeller, time.Now().UTC()); err != nil {
		t.Fatalf("mark messages read: %v", err)
	}
	if err := repo.MarkConversationRead(ctx, conversation.ID, domain.RoleSeller, time.Now().UTC()); err != nil {
		t.Fatalf("mark conversation read: %v", err)
	}

	convAfterRead, err := repo.FindConversationByID(ctx, conversation.ID)
	if err != nil {
		t.Fatalf("find conversation after read: %v", err)
	}
	if convAfterRead == nil {
		t.Fatalf("conversation not found after read")
	}
	if convAfterRead.Unread.Seller != 0 {
		t.Fatalf("expected unread.seller = 0, got %d", convAfterRead.Unread.Seller)
	}

	outboxCount, err := db.Collection("outbox_events").CountDocuments(ctx, bson.M{"eventType": domain.EventMessageCreated})
	if err != nil {
		t.Fatalf("count outbox events: %v", err)
	}
	if outboxCount != 1 {
		t.Fatalf("expected exactly 1 outbox event for idempotent sends, got %d", outboxCount)
	}
}

func toPtr(value string) *string {
	return &value
}
