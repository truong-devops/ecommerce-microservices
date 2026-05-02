package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"chat-service/internal/domain"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type ChatRepository struct {
	db            *mongo.Database
	conversations *mongo.Collection
	messages      *mongo.Collection
	outbox        *mongo.Collection
}

type CreateConversationInput struct {
	Key      string
	BuyerID  string
	SellerID string
	Context  domain.ConversationContext
}

type ListConversationFilter struct {
	Role     domain.Role
	UserID   string
	Page     int
	PageSize int
}

type SendMessageTxInput struct {
	ConversationID  string
	SenderID        string
	SenderRole      domain.Role
	ClientMessageID string
	Text            string
	SentAt          time.Time
	EventType       string
	EventPayload    map[string]any
}

type SendMessageTxResult struct {
	Message domain.Message
	Created bool
}

func NewChatRepository(db *mongo.Database) *ChatRepository {
	return &ChatRepository{
		db:            db,
		conversations: db.Collection("conversations"),
		messages:      db.Collection("messages"),
		outbox:        db.Collection("outbox_events"),
	}
}

func (r *ChatRepository) Ping(ctx context.Context) error {
	return r.db.Client().Ping(ctx, nil)
}

func (r *ChatRepository) EnsureIndexes(ctx context.Context) error {
	convIndexes := []mongo.IndexModel{
		{Keys: bson.D{{Key: "key", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "buyerId", Value: 1}, {Key: "updatedAt", Value: -1}}},
		{Keys: bson.D{{Key: "sellerId", Value: 1}, {Key: "updatedAt", Value: -1}}},
	}
	if _, err := r.conversations.Indexes().CreateMany(ctx, convIndexes); err != nil {
		return err
	}

	messageIndexes := []mongo.IndexModel{
		{Keys: bson.D{{Key: "conversationId", Value: 1}, {Key: "seq", Value: -1}}},
		{
			Keys:    bson.D{{Key: "conversationId", Value: 1}, {Key: "clientMessageId", Value: 1}},
			Options: options.Index().SetUnique(true).SetSparse(true),
		},
	}
	if _, err := r.messages.Indexes().CreateMany(ctx, messageIndexes); err != nil {
		return err
	}

	outboxIndexes := []mongo.IndexModel{
		{Keys: bson.D{{Key: "status", Value: 1}, {Key: "nextRetryAt", Value: 1}, {Key: "createdAt", Value: 1}}},
	}
	_, err := r.outbox.Indexes().CreateMany(ctx, outboxIndexes)
	return err
}

func (r *ChatRepository) CreateConversation(ctx context.Context, input CreateConversationInput) (domain.Conversation, bool, error) {
	now := time.Now().UTC()
	doc := conversationDoc{
		ID:       primitive.NewObjectID(),
		Key:      input.Key,
		Type:     domain.ConversationTypeBuyerSeller,
		BuyerID:  input.BuyerID,
		SellerID: input.SellerID,
		Context: conversationContextDoc{
			ProductID: input.Context.ProductID,
			OrderID:   input.Context.OrderID,
			ShopID:    input.Context.ShopID,
		},
		Unread:    conversationUnreadDoc{},
		NextSeq:   0,
		Status:    domain.ConversationStatusActive,
		CreatedAt: now,
		UpdatedAt: now,
	}

	_, err := r.conversations.InsertOne(ctx, doc)
	if err == nil {
		return mapConversation(doc), true, nil
	}

	if !mongo.IsDuplicateKeyError(err) {
		return domain.Conversation{}, false, err
	}

	existing, findErr := r.FindConversationByKey(ctx, input.Key)
	if findErr != nil {
		return domain.Conversation{}, false, findErr
	}
	if existing == nil {
		return domain.Conversation{}, false, fmt.Errorf("conversation conflict but not found")
	}
	return *existing, false, nil
}

func (r *ChatRepository) FindConversationByKey(ctx context.Context, key string) (*domain.Conversation, error) {
	var doc conversationDoc
	err := r.conversations.FindOne(ctx, bson.M{"key": key}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	mapped := mapConversation(doc)
	return &mapped, nil
}

func (r *ChatRepository) FindConversationByID(ctx context.Context, id string) (*domain.Conversation, error) {
	oid, err := parseObjectID(id)
	if err != nil {
		return nil, nil
	}

	var doc conversationDoc
	err = r.conversations.FindOne(ctx, bson.M{"_id": oid}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	mapped := mapConversation(doc)
	return &mapped, nil
}

func (r *ChatRepository) ListConversations(ctx context.Context, filter ListConversationFilter) ([]domain.Conversation, int64, error) {
	query := bson.M{}
	switch filter.Role {
	case domain.RoleCustomer, domain.RoleBuyer:
		query["buyerId"] = filter.UserID
	case domain.RoleSeller:
		query["sellerId"] = filter.UserID
	default:
	}

	total, err := r.conversations.CountDocuments(ctx, query)
	if err != nil {
		return nil, 0, err
	}

	skip := int64((filter.Page - 1) * filter.PageSize)
	opts := options.Find().SetSort(bson.D{{Key: "updatedAt", Value: -1}}).SetSkip(skip).SetLimit(int64(filter.PageSize))
	cur, err := r.conversations.Find(ctx, query, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cur.Close(ctx)

	items := make([]domain.Conversation, 0)
	for cur.Next(ctx) {
		var doc conversationDoc
		if err := cur.Decode(&doc); err != nil {
			return nil, 0, err
		}
		items = append(items, mapConversation(doc))
	}
	if err := cur.Err(); err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func (r *ChatRepository) ListMessages(ctx context.Context, conversationID string, beforeSeq int64, limit int) ([]domain.Message, error) {
	convOID, err := parseObjectID(conversationID)
	if err != nil {
		return nil, nil
	}
	query := bson.M{"conversationId": convOID}
	if beforeSeq > 0 {
		query["seq"] = bson.M{"$lt": beforeSeq}
	}

	opts := options.Find().SetSort(bson.D{{Key: "seq", Value: -1}}).SetLimit(int64(limit))
	cur, err := r.messages.Find(ctx, query, opts)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	items := make([]domain.Message, 0)
	for cur.Next(ctx) {
		var doc messageDoc
		if err := cur.Decode(&doc); err != nil {
			return nil, err
		}
		items = append(items, mapMessage(doc))
	}
	if err := cur.Err(); err != nil {
		return nil, err
	}

	for i, j := 0, len(items)-1; i < j; i, j = i+1, j-1 {
		items[i], items[j] = items[j], items[i]
	}

	return items, nil
}

func (r *ChatRepository) FindMessageByClientID(ctx context.Context, conversationID, clientMessageID string) (*domain.Message, error) {
	if strings.TrimSpace(clientMessageID) == "" {
		return nil, nil
	}

	convOID, err := parseObjectID(conversationID)
	if err != nil {
		return nil, nil
	}
	query := bson.M{"conversationId": convOID, "clientMessageId": strings.TrimSpace(clientMessageID)}

	var doc messageDoc
	err = r.messages.FindOne(ctx, query).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	mapped := mapMessage(doc)
	return &mapped, nil
}

func (r *ChatRepository) NextSequence(ctx context.Context, conversationID string) (int64, error) {
	oid, err := parseObjectID(conversationID)
	if err != nil {
		return 0, err
	}

	filter := bson.M{"_id": oid, "status": domain.ConversationStatusActive}
	update := bson.M{"$inc": bson.M{"nextSeq": 1}, "$set": bson.M{"updatedAt": time.Now().UTC()}}
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)

	var updated conversationDoc
	err = r.conversations.FindOneAndUpdate(ctx, filter, update, opts).Decode(&updated)
	if err == mongo.ErrNoDocuments {
		return 0, errors.New("conversation_not_active")
	}
	if err != nil {
		return 0, err
	}
	return updated.NextSeq, nil
}

func (r *ChatRepository) InsertMessage(ctx context.Context, msg domain.Message) (domain.Message, error) {
	convOID, err := parseObjectID(msg.ConversationID)
	if err != nil {
		return domain.Message{}, err
	}

	doc := messageDoc{
		ID:              primitive.NewObjectID(),
		ConversationID:  convOID,
		Seq:             msg.Seq,
		ClientMessageID: strings.TrimSpace(msg.ClientMessageID),
		SenderID:        msg.SenderID,
		SenderRole:      msg.SenderRole,
		Kind:            msg.Kind,
		Text:            msg.Text,
		SentAt:          msg.SentAt,
	}
	if doc.ClientMessageID == "" {
		doc.ClientMessageID = ""
	}

	_, err = r.messages.InsertOne(ctx, doc)
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			if existing, findErr := r.FindMessageByClientID(ctx, msg.ConversationID, msg.ClientMessageID); findErr == nil && existing != nil {
				return *existing, nil
			}
		}
		return domain.Message{}, err
	}
	return mapMessage(doc), nil
}

func (r *ChatRepository) UpdateConversationOnMessage(ctx context.Context, conversationID string, last domain.LastMessage, incBuyer, incSeller int64) error {
	oid, err := parseObjectID(conversationID)
	if err != nil {
		return err
	}

	inc := bson.M{}
	if incBuyer != 0 {
		inc["unread.buyer"] = incBuyer
	}
	if incSeller != 0 {
		inc["unread.seller"] = incSeller
	}

	update := bson.M{
		"$set": bson.M{
			"lastMessage": bson.M{
				"messageId":   last.MessageID,
				"senderId":    last.SenderID,
				"textPreview": last.TextPreview,
				"sentAt":      last.SentAt,
			},
			"updatedAt": time.Now().UTC(),
		},
	}
	if len(inc) > 0 {
		update["$inc"] = inc
	}

	_, err = r.conversations.UpdateByID(ctx, oid, update)
	return err
}

func (r *ChatRepository) CreateMessageAndOutbox(ctx context.Context, input SendMessageTxInput) (SendMessageTxResult, error) {
	convOID, err := parseObjectID(input.ConversationID)
	if err != nil {
		return SendMessageTxResult{}, err
	}

	session, err := r.db.Client().StartSession()
	if err != nil {
		return SendMessageTxResult{}, err
	}
	defer session.EndSession(ctx)

	result := SendMessageTxResult{}
	_, err = session.WithTransaction(ctx, func(sc mongo.SessionContext) (any, error) {
		clientMessageID := strings.TrimSpace(input.ClientMessageID)
		if clientMessageID != "" {
			var existing messageDoc
			findErr := r.messages.FindOne(sc, bson.M{
				"conversationId":  convOID,
				"clientMessageId": clientMessageID,
			}).Decode(&existing)
			if findErr == nil {
				result = SendMessageTxResult{Message: mapMessage(existing), Created: false}
				return nil, nil
			}
			if findErr != nil && findErr != mongo.ErrNoDocuments {
				return nil, findErr
			}
		}

		now := input.SentAt.UTC()
		var updated conversationDoc
		findAndUpdateErr := r.conversations.FindOneAndUpdate(
			sc,
			bson.M{"_id": convOID, "status": domain.ConversationStatusActive},
			bson.M{"$inc": bson.M{"nextSeq": 1}, "$set": bson.M{"updatedAt": now}},
			options.FindOneAndUpdate().SetReturnDocument(options.After),
		).Decode(&updated)
		if findAndUpdateErr == mongo.ErrNoDocuments {
			return nil, errors.New("conversation_not_active")
		}
		if findAndUpdateErr != nil {
			return nil, findAndUpdateErr
		}

		doc := messageDoc{
			ID:              primitive.NewObjectID(),
			ConversationID:  convOID,
			Seq:             updated.NextSeq,
			ClientMessageID: clientMessageID,
			SenderID:        input.SenderID,
			SenderRole:      input.SenderRole,
			Kind:            domain.MessageKindText,
			Text:            input.Text,
			SentAt:          now,
		}
		if _, insertErr := r.messages.InsertOne(sc, doc); insertErr != nil {
			if mongo.IsDuplicateKeyError(insertErr) && clientMessageID != "" {
				var existing messageDoc
				findErr := r.messages.FindOne(sc, bson.M{
					"conversationId":  convOID,
					"clientMessageId": clientMessageID,
				}).Decode(&existing)
				if findErr == nil {
					result = SendMessageTxResult{Message: mapMessage(existing), Created: false}
					return nil, nil
				}
			}
			return nil, insertErr
		}

		inc := bson.M{}
		if input.SenderRole == domain.RoleSeller {
			inc["unread.buyer"] = int64(1)
		} else {
			inc["unread.seller"] = int64(1)
		}

		if _, updateErr := r.conversations.UpdateByID(sc, convOID, bson.M{
			"$set": bson.M{
				"lastMessage": bson.M{
					"messageId":   doc.ID.Hex(),
					"senderId":    input.SenderID,
					"textPreview": trimPreview(input.Text, 120),
					"sentAt":      now,
				},
				"updatedAt": now,
			},
			"$inc": inc,
		}); updateErr != nil {
			return nil, updateErr
		}

		eventPayload := copyMap(input.EventPayload)
		if messagePayload, ok := eventPayload["message"].(map[string]any); ok {
			messagePayload["id"] = doc.ID.Hex()
			messagePayload["seq"] = doc.Seq
			messagePayload["conversationId"] = input.ConversationID
			messagePayload["senderId"] = doc.SenderID
			messagePayload["senderRole"] = doc.SenderRole
			messagePayload["kind"] = doc.Kind
			messagePayload["text"] = doc.Text
			messagePayload["sentAt"] = doc.SentAt.UTC().Format(time.RFC3339Nano)
			eventPayload["message"] = messagePayload
		}

		outbox := outboxDoc{
			ID:          primitive.NewObjectID(),
			AggregateID: input.ConversationID,
			EventType:   input.EventType,
			Payload:     eventPayload,
			Status:      domain.OutboxStatusPending,
			RetryCount:  0,
			CreatedAt:   now,
		}
		if _, insertErr := r.outbox.InsertOne(sc, outbox); insertErr != nil {
			return nil, insertErr
		}

		result = SendMessageTxResult{Message: mapMessage(doc), Created: true}
		return nil, nil
	})
	if err != nil {
		if isMongoTransactionUnsupported(err) {
			return r.createMessageAndOutboxFallback(ctx, input)
		}
		return SendMessageTxResult{}, err
	}

	return result, nil
}

func (r *ChatRepository) createMessageAndOutboxFallback(ctx context.Context, input SendMessageTxInput) (SendMessageTxResult, error) {
	if strings.TrimSpace(input.ClientMessageID) != "" {
		existing, err := r.FindMessageByClientID(ctx, input.ConversationID, input.ClientMessageID)
		if err != nil {
			return SendMessageTxResult{}, err
		}
		if existing != nil {
			return SendMessageTxResult{Message: *existing, Created: false}, nil
		}
	}

	seq, err := r.NextSequence(ctx, input.ConversationID)
	if err != nil {
		return SendMessageTxResult{}, err
	}

	message, err := r.InsertMessage(ctx, domain.Message{
		ConversationID:  input.ConversationID,
		Seq:             seq,
		ClientMessageID: strings.TrimSpace(input.ClientMessageID),
		SenderID:        input.SenderID,
		SenderRole:      input.SenderRole,
		Kind:            domain.MessageKindText,
		Text:            input.Text,
		SentAt:          input.SentAt.UTC(),
	})
	if err != nil {
		return SendMessageTxResult{}, err
	}

	incBuyer := int64(0)
	incSeller := int64(0)
	if input.SenderRole == domain.RoleSeller {
		incBuyer = 1
	} else {
		incSeller = 1
	}

	if err := r.UpdateConversationOnMessage(ctx, input.ConversationID, domain.LastMessage{
		MessageID:   message.ID,
		SenderID:    message.SenderID,
		TextPreview: trimPreview(message.Text, 120),
		SentAt:      message.SentAt,
	}, incBuyer, incSeller); err != nil {
		return SendMessageTxResult{}, err
	}

	eventPayload := copyMap(input.EventPayload)
	if messagePayload, ok := eventPayload["message"].(map[string]any); ok {
		messagePayload["id"] = message.ID
		messagePayload["seq"] = message.Seq
		messagePayload["conversationId"] = input.ConversationID
		messagePayload["senderId"] = message.SenderID
		messagePayload["senderRole"] = message.SenderRole
		messagePayload["kind"] = message.Kind
		messagePayload["text"] = message.Text
		messagePayload["sentAt"] = message.SentAt.UTC().Format(time.RFC3339Nano)
		eventPayload["message"] = messagePayload
	}

	if err := r.InsertOutboxEvent(ctx, input.ConversationID, input.EventType, eventPayload); err != nil {
		return SendMessageTxResult{}, err
	}

	return SendMessageTxResult{Message: message, Created: true}, nil
}

func (r *ChatRepository) MarkConversationRead(ctx context.Context, conversationID string, role domain.Role, readAt time.Time) error {
	oid, err := parseObjectID(conversationID)
	if err != nil {
		return err
	}

	set := bson.M{"updatedAt": readAt}
	switch role {
	case domain.RoleCustomer, domain.RoleBuyer:
		set["unread.buyer"] = int64(0)
	case domain.RoleSeller:
		set["unread.seller"] = int64(0)
	default:
		set["unread.buyer"] = int64(0)
		set["unread.seller"] = int64(0)
	}

	_, err = r.conversations.UpdateByID(ctx, oid, bson.M{"$set": set})
	return err
}

func (r *ChatRepository) MarkMessagesRead(ctx context.Context, conversationID string, role domain.Role, readAt time.Time) (int64, error) {
	oid, err := parseObjectID(conversationID)
	if err != nil {
		return 0, err
	}

	filter := bson.M{"conversationId": oid}
	set := bson.M{}
	switch role {
	case domain.RoleCustomer, domain.RoleBuyer:
		filter["senderRole"] = bson.M{"$ne": domain.RoleCustomer}
		filter["readByBuyerAt"] = bson.M{"$exists": false}
		set["readByBuyerAt"] = readAt
	case domain.RoleSeller:
		filter["senderRole"] = bson.M{"$ne": domain.RoleSeller}
		filter["readBySellerAt"] = bson.M{"$exists": false}
		set["readBySellerAt"] = readAt
	default:
		return 0, nil
	}

	result, err := r.messages.UpdateMany(ctx, filter, bson.M{"$set": set})
	if err != nil {
		return 0, err
	}
	return result.ModifiedCount, nil
}

func (r *ChatRepository) InsertOutboxEvent(ctx context.Context, aggregateID, eventType string, payload map[string]any) error {
	doc := outboxDoc{
		ID:          primitive.NewObjectID(),
		AggregateID: aggregateID,
		EventType:   eventType,
		Payload:     payload,
		Status:      domain.OutboxStatusPending,
		RetryCount:  0,
		CreatedAt:   time.Now().UTC(),
	}
	_, err := r.outbox.InsertOne(ctx, doc)
	return err
}

func trimPreview(value string, max int) string {
	if len(value) <= max {
		return value
	}
	return value[:max]
}

func copyMap(input map[string]any) map[string]any {
	if input == nil {
		return map[string]any{}
	}
	out := make(map[string]any, len(input))
	for key, value := range input {
		out[key] = value
	}
	return out
}

func isMongoTransactionUnsupported(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "transaction numbers are only allowed on a replica set member or mongos") ||
		strings.Contains(message, "this mongo deployment does not support retryable writes") ||
		strings.Contains(message, "transaction is not supported")
}

func (r *ChatRepository) FindDispatchableOutboxEvents(ctx context.Context, batchSize int) ([]domain.OutboxEvent, error) {
	now := time.Now().UTC()
	filter := bson.M{
		"$or": []bson.M{
			{"status": domain.OutboxStatusPending},
			{"status": domain.OutboxStatusFailed, "nextRetryAt": bson.M{"$lte": now}},
		},
	}
	opts := options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}}).SetLimit(int64(batchSize))
	cur, err := r.outbox.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	items := make([]domain.OutboxEvent, 0)
	for cur.Next(ctx) {
		var doc outboxDoc
		if err := cur.Decode(&doc); err != nil {
			return nil, err
		}
		items = append(items, mapOutbox(doc))
	}
	if err := cur.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (r *ChatRepository) MarkOutboxPublished(ctx context.Context, id string) error {
	oid, err := parseObjectID(id)
	if err != nil {
		return err
	}
	_, err = r.outbox.UpdateByID(ctx, oid, bson.M{
		"$set": bson.M{
			"status":      domain.OutboxStatusPublished,
			"publishedAt": time.Now().UTC(),
			"nextRetryAt": nil,
		},
	})
	return err
}

func (r *ChatRepository) MarkOutboxFailed(ctx context.Context, id string, retryCount int, nextRetryAt *time.Time) error {
	oid, err := parseObjectID(id)
	if err != nil {
		return err
	}
	_, err = r.outbox.UpdateByID(ctx, oid, bson.M{
		"$set": bson.M{
			"status":      domain.OutboxStatusFailed,
			"retryCount":  retryCount,
			"nextRetryAt": nextRetryAt,
		},
	})
	return err
}

func parseObjectID(id string) (primitive.ObjectID, error) {
	return primitive.ObjectIDFromHex(strings.TrimSpace(id))
}

type conversationContextDoc struct {
	ProductID *string `bson:"productId,omitempty"`
	OrderID   *string `bson:"orderId,omitempty"`
	ShopID    *string `bson:"shopId,omitempty"`
}

type conversationLastMessageDoc struct {
	MessageID   string    `bson:"messageId"`
	SenderID    string    `bson:"senderId"`
	TextPreview string    `bson:"textPreview"`
	SentAt      time.Time `bson:"sentAt"`
}

type conversationUnreadDoc struct {
	Buyer  int64 `bson:"buyer"`
	Seller int64 `bson:"seller"`
}

type conversationDoc struct {
	ID          primitive.ObjectID          `bson:"_id,omitempty"`
	Key         string                      `bson:"key"`
	Type        domain.ConversationType     `bson:"type"`
	BuyerID     string                      `bson:"buyerId"`
	SellerID    string                      `bson:"sellerId"`
	Context     conversationContextDoc      `bson:"context"`
	LastMessage *conversationLastMessageDoc `bson:"lastMessage,omitempty"`
	Unread      conversationUnreadDoc       `bson:"unread"`
	NextSeq     int64                       `bson:"nextSeq"`
	Status      domain.ConversationStatus   `bson:"status"`
	CreatedAt   time.Time                   `bson:"createdAt"`
	UpdatedAt   time.Time                   `bson:"updatedAt"`
}

type messageDoc struct {
	ID              primitive.ObjectID `bson:"_id,omitempty"`
	ConversationID  primitive.ObjectID `bson:"conversationId"`
	Seq             int64              `bson:"seq"`
	ClientMessageID string             `bson:"clientMessageId,omitempty"`
	SenderID        string             `bson:"senderId"`
	SenderRole      domain.Role        `bson:"senderRole"`
	Kind            domain.MessageKind `bson:"kind"`
	Text            string             `bson:"text"`
	SentAt          time.Time          `bson:"sentAt"`
	EditedAt        *time.Time         `bson:"editedAt,omitempty"`
	DeletedAt       *time.Time         `bson:"deletedAt,omitempty"`
	ReadByBuyerAt   *time.Time         `bson:"readByBuyerAt,omitempty"`
	ReadBySellerAt  *time.Time         `bson:"readBySellerAt,omitempty"`
}

type outboxDoc struct {
	ID          primitive.ObjectID  `bson:"_id,omitempty"`
	AggregateID string              `bson:"aggregateId"`
	EventType   string              `bson:"eventType"`
	Payload     map[string]any      `bson:"payload"`
	Status      domain.OutboxStatus `bson:"status"`
	RetryCount  int                 `bson:"retryCount"`
	NextRetryAt *time.Time          `bson:"nextRetryAt,omitempty"`
	CreatedAt   time.Time           `bson:"createdAt"`
	PublishedAt *time.Time          `bson:"publishedAt,omitempty"`
}

func mapConversation(doc conversationDoc) domain.Conversation {
	mapped := domain.Conversation{
		ID:       doc.ID.Hex(),
		Key:      doc.Key,
		Type:     doc.Type,
		BuyerID:  doc.BuyerID,
		SellerID: doc.SellerID,
		Context: domain.ConversationContext{
			ProductID: doc.Context.ProductID,
			OrderID:   doc.Context.OrderID,
			ShopID:    doc.Context.ShopID,
		},
		Unread:    domain.UnreadCount{Buyer: doc.Unread.Buyer, Seller: doc.Unread.Seller},
		NextSeq:   doc.NextSeq,
		Status:    doc.Status,
		CreatedAt: doc.CreatedAt,
		UpdatedAt: doc.UpdatedAt,
	}
	if doc.LastMessage != nil {
		mapped.LastMessage = &domain.LastMessage{
			MessageID:   doc.LastMessage.MessageID,
			SenderID:    doc.LastMessage.SenderID,
			TextPreview: doc.LastMessage.TextPreview,
			SentAt:      doc.LastMessage.SentAt,
		}
	}
	return mapped
}

func mapMessage(doc messageDoc) domain.Message {
	return domain.Message{
		ID:              doc.ID.Hex(),
		ConversationID:  doc.ConversationID.Hex(),
		Seq:             doc.Seq,
		ClientMessageID: doc.ClientMessageID,
		SenderID:        doc.SenderID,
		SenderRole:      doc.SenderRole,
		Kind:            doc.Kind,
		Text:            doc.Text,
		SentAt:          doc.SentAt,
		EditedAt:        doc.EditedAt,
		DeletedAt:       doc.DeletedAt,
		ReadByBuyerAt:   doc.ReadByBuyerAt,
		ReadBySellerAt:  doc.ReadBySellerAt,
	}
}

func mapOutbox(doc outboxDoc) domain.OutboxEvent {
	return domain.OutboxEvent{
		ID:          doc.ID.Hex(),
		AggregateID: doc.AggregateID,
		EventType:   doc.EventType,
		Payload:     doc.Payload,
		Status:      doc.Status,
		RetryCount:  doc.RetryCount,
		NextRetryAt: doc.NextRetryAt,
		CreatedAt:   doc.CreatedAt,
		PublishedAt: doc.PublishedAt,
	}
}
