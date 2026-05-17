package repository

import (
	"context"
	"errors"
	"time"

	"live-service/internal/domain"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type ListSessionsFilter struct {
	SellerID string
	Status   domain.LiveSessionStatus
	Page     int
	PageSize int
}

type Repository interface {
	Ping(ctx context.Context) error
	EnsureIndexes(ctx context.Context) error
	CreateSession(ctx context.Context, session domain.LiveSession) (domain.LiveSession, error)
	FindSessionByID(ctx context.Context, sessionID string) (*domain.LiveSession, error)
	ListSessions(ctx context.Context, filter ListSessionsFilter) ([]domain.LiveSession, int64, error)
	UpdateSession(ctx context.Context, session domain.LiveSession) error
	UpsertPinnedProduct(ctx context.Context, product domain.LiveProduct) (domain.LiveProduct, error)
	UnpinProduct(ctx context.Context, sessionID, productID string, at time.Time) (*domain.LiveProduct, error)
	ListPinnedProducts(ctx context.Context, sessionID string) ([]domain.LiveProduct, error)
	FindMessageByClientID(ctx context.Context, sessionID, clientMessageID string) (*domain.LiveMessage, error)
	CreateMessage(ctx context.Context, message domain.LiveMessage) (domain.LiveMessage, error)
}

type LiveRepository struct {
	db       *mongo.Database
	sessions *mongo.Collection
	products *mongo.Collection
	messages *mongo.Collection
}

func NewLiveRepository(db *mongo.Database) *LiveRepository {
	return &LiveRepository{
		db:       db,
		sessions: db.Collection("live_sessions"),
		products: db.Collection("live_session_products"),
		messages: db.Collection("live_messages"),
	}
}

func (r *LiveRepository) Ping(ctx context.Context) error {
	return r.db.Client().Ping(ctx, nil)
}

func (r *LiveRepository) EnsureIndexes(ctx context.Context) error {
	sessionIndexes := []mongo.IndexModel{
		{Keys: bson.D{{Key: "sessionId", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "sellerId", Value: 1}, {Key: "status", Value: 1}, {Key: "createdAt", Value: -1}}},
		{Keys: bson.D{{Key: "status", Value: 1}, {Key: "startedAt", Value: -1}}},
	}
	if _, err := r.sessions.Indexes().CreateMany(ctx, sessionIndexes); err != nil {
		return err
	}

	productIndexes := []mongo.IndexModel{
		{Keys: bson.D{{Key: "sessionId", Value: 1}, {Key: "pinStatus", Value: 1}, {Key: "pinnedAt", Value: -1}}},
		{Keys: bson.D{{Key: "sessionId", Value: 1}, {Key: "productId", Value: 1}}, Options: options.Index().SetUnique(true)},
	}
	if _, err := r.products.Indexes().CreateMany(ctx, productIndexes); err != nil {
		return err
	}

	messageIndexes := []mongo.IndexModel{
		{Keys: bson.D{{Key: "sessionId", Value: 1}, {Key: "createdAt", Value: -1}}},
		{
			Keys:    bson.D{{Key: "sessionId", Value: 1}, {Key: "clientMessageId", Value: 1}},
			Options: options.Index().SetUnique(true).SetSparse(true),
		},
	}
	_, err := r.messages.Indexes().CreateMany(ctx, messageIndexes)
	return err
}

func (r *LiveRepository) CreateSession(ctx context.Context, session domain.LiveSession) (domain.LiveSession, error) {
	doc := sessionToDoc(session)
	doc.ID = primitive.NewObjectID()
	if _, err := r.sessions.InsertOne(ctx, doc); err != nil {
		return domain.LiveSession{}, err
	}
	return mapSession(doc), nil
}

func (r *LiveRepository) FindSessionByID(ctx context.Context, sessionID string) (*domain.LiveSession, error) {
	var doc liveSessionDoc
	err := r.sessions.FindOne(ctx, bson.M{"sessionId": sessionID}).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	mapped := mapSession(doc)
	return &mapped, nil
}

func (r *LiveRepository) ListSessions(ctx context.Context, filter ListSessionsFilter) ([]domain.LiveSession, int64, error) {
	query := bson.M{}
	if filter.SellerID != "" {
		query["sellerId"] = filter.SellerID
	}
	if filter.Status != "" {
		query["status"] = filter.Status
	}

	total, err := r.sessions.CountDocuments(ctx, query)
	if err != nil {
		return nil, 0, err
	}

	page := filter.Page
	if page < 1 {
		page = 1
	}
	pageSize := filter.PageSize
	if pageSize < 1 {
		pageSize = 20
	}
	opts := options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}}).
		SetSkip(int64((page - 1) * pageSize)).
		SetLimit(int64(pageSize))

	cur, err := r.sessions.Find(ctx, query, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cur.Close(ctx)

	items := make([]domain.LiveSession, 0)
	for cur.Next(ctx) {
		var doc liveSessionDoc
		if err := cur.Decode(&doc); err != nil {
			return nil, 0, err
		}
		items = append(items, mapSession(doc))
	}
	if err := cur.Err(); err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func (r *LiveRepository) UpdateSession(ctx context.Context, session domain.LiveSession) error {
	doc := sessionToDoc(session)
	update := bson.M{"$set": bson.M{
		"title":              doc.Title,
		"description":        doc.Description,
		"thumbnailUrl":       doc.ThumbnailURL,
		"playbackUrl":        doc.PlaybackURL,
		"media":              doc.Media,
		"sourceType":         doc.SourceType,
		"status":             doc.Status,
		"defaultLanguage":    doc.DefaultLanguage,
		"supportedLanguages": doc.SupportedLanguages,
		"metricsSnapshot":    doc.MetricsSnapshot,
		"scheduledAt":        doc.ScheduledAt,
		"startedAt":          doc.StartedAt,
		"endedAt":            doc.EndedAt,
		"updatedAt":          doc.UpdatedAt,
	}}
	res, err := r.sessions.UpdateOne(ctx, bson.M{"sessionId": session.SessionID}, update)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return mongo.ErrNoDocuments
	}
	return nil
}

func (r *LiveRepository) UpsertPinnedProduct(ctx context.Context, product domain.LiveProduct) (domain.LiveProduct, error) {
	doc := productToDoc(product)
	if doc.ID.IsZero() {
		doc.ID = primitive.NewObjectID()
	}
	update := bson.M{"$set": bson.M{
		"sessionId":        doc.SessionID,
		"productId":        doc.ProductID,
		"sellerId":         doc.SellerID,
		"nameSnapshot":     doc.NameSnapshot,
		"priceSnapshot":    doc.PriceSnapshot,
		"currencySnapshot": doc.CurrencySnapshot,
		"imageSnapshot":    doc.ImageSnapshot,
		"statusSnapshot":   doc.StatusSnapshot,
		"pinStatus":        doc.PinStatus,
		"sortOrder":        doc.SortOrder,
		"pinnedAt":         doc.PinnedAt,
		"unpinnedAt":       nil,
		"pinnedBy":         doc.PinnedBy,
	}, "$setOnInsert": bson.M{"_id": doc.ID}}
	_, err := r.products.UpdateOne(ctx, bson.M{"sessionId": doc.SessionID, "productId": doc.ProductID}, update, options.Update().SetUpsert(true))
	if err != nil {
		return domain.LiveProduct{}, err
	}
	return product, nil
}

func (r *LiveRepository) UnpinProduct(ctx context.Context, sessionID, productID string, at time.Time) (*domain.LiveProduct, error) {
	update := bson.M{"$set": bson.M{"pinStatus": domain.ProductPinStatusUnpinned, "unpinnedAt": at}}
	var doc liveProductDoc
	err := r.products.FindOneAndUpdate(
		ctx,
		bson.M{"sessionId": sessionID, "productId": productID, "pinStatus": domain.ProductPinStatusPinned},
		update,
		options.FindOneAndUpdate().SetReturnDocument(options.After),
	).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	mapped := mapProduct(doc)
	return &mapped, nil
}

func (r *LiveRepository) ListPinnedProducts(ctx context.Context, sessionID string) ([]domain.LiveProduct, error) {
	cur, err := r.products.Find(
		ctx,
		bson.M{"sessionId": sessionID, "pinStatus": domain.ProductPinStatusPinned},
		options.Find().SetSort(bson.D{{Key: "pinnedAt", Value: -1}}),
	)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	items := make([]domain.LiveProduct, 0)
	for cur.Next(ctx) {
		var doc liveProductDoc
		if err := cur.Decode(&doc); err != nil {
			return nil, err
		}
		items = append(items, mapProduct(doc))
	}
	return items, cur.Err()
}

func (r *LiveRepository) FindMessageByClientID(ctx context.Context, sessionID, clientMessageID string) (*domain.LiveMessage, error) {
	if clientMessageID == "" {
		return nil, nil
	}
	var doc liveMessageDoc
	err := r.messages.FindOne(ctx, bson.M{"sessionId": sessionID, "clientMessageId": clientMessageID}).Decode(&doc)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	mapped := mapMessage(doc)
	return &mapped, nil
}

func (r *LiveRepository) CreateMessage(ctx context.Context, message domain.LiveMessage) (domain.LiveMessage, error) {
	doc := messageToDoc(message)
	doc.ID = primitive.NewObjectID()
	if _, err := r.messages.InsertOne(ctx, doc); err != nil {
		return domain.LiveMessage{}, err
	}
	return mapMessage(doc), nil
}

type liveSessionDoc struct {
	ID                 primitive.ObjectID         `bson:"_id,omitempty"`
	SessionID          string                     `bson:"sessionId"`
	SellerID           string                     `bson:"sellerId"`
	Title              string                     `bson:"title"`
	Description        string                     `bson:"description,omitempty"`
	ThumbnailURL       string                     `bson:"thumbnailUrl,omitempty"`
	PlaybackURL        string                     `bson:"playbackUrl"`
	Media              *domain.LiveMedia          `bson:"media,omitempty"`
	SourceType         domain.LiveSourceType      `bson:"sourceType"`
	Status             domain.LiveSessionStatus   `bson:"status"`
	DefaultLanguage    string                     `bson:"defaultLanguage"`
	SupportedLanguages []string                   `bson:"supportedLanguages"`
	MetricsSnapshot    domain.LiveMetricsSnapshot `bson:"metricsSnapshot"`
	ScheduledAt        *time.Time                 `bson:"scheduledAt,omitempty"`
	StartedAt          *time.Time                 `bson:"startedAt,omitempty"`
	EndedAt            *time.Time                 `bson:"endedAt,omitempty"`
	CreatedAt          time.Time                  `bson:"createdAt"`
	UpdatedAt          time.Time                  `bson:"updatedAt"`
}

type liveProductDoc struct {
	ID               primitive.ObjectID      `bson:"_id,omitempty"`
	SessionID        string                  `bson:"sessionId"`
	ProductID        string                  `bson:"productId"`
	SellerID         string                  `bson:"sellerId"`
	NameSnapshot     string                  `bson:"nameSnapshot"`
	PriceSnapshot    float64                 `bson:"priceSnapshot"`
	CurrencySnapshot string                  `bson:"currencySnapshot"`
	ImageSnapshot    string                  `bson:"imageSnapshot,omitempty"`
	StatusSnapshot   string                  `bson:"statusSnapshot"`
	PinStatus        domain.ProductPinStatus `bson:"pinStatus"`
	SortOrder        int                     `bson:"sortOrder"`
	PinnedAt         time.Time               `bson:"pinnedAt"`
	UnpinnedAt       *time.Time              `bson:"unpinnedAt,omitempty"`
	PinnedBy         string                  `bson:"pinnedBy"`
}

type liveMessageDoc struct {
	ID              primitive.ObjectID       `bson:"_id,omitempty"`
	MessageID       string                   `bson:"messageId"`
	SessionID       string                   `bson:"sessionId"`
	SenderID        string                   `bson:"senderId"`
	SenderRole      domain.Role              `bson:"senderRole"`
	Text            string                   `bson:"text"`
	ClientMessageID string                   `bson:"clientMessageId,omitempty"`
	Language        string                   `bson:"language"`
	Status          domain.LiveMessageStatus `bson:"status"`
	CreatedAt       time.Time                `bson:"createdAt"`
}

func sessionToDoc(s domain.LiveSession) liveSessionDoc {
	return liveSessionDoc{
		SessionID:          s.SessionID,
		SellerID:           s.SellerID,
		Title:              s.Title,
		Description:        s.Description,
		ThumbnailURL:       s.ThumbnailURL,
		PlaybackURL:        s.PlaybackURL,
		Media:              s.Media,
		SourceType:         s.SourceType,
		Status:             s.Status,
		DefaultLanguage:    s.DefaultLanguage,
		SupportedLanguages: s.SupportedLanguages,
		MetricsSnapshot:    s.MetricsSnapshot,
		ScheduledAt:        s.ScheduledAt,
		StartedAt:          s.StartedAt,
		EndedAt:            s.EndedAt,
		CreatedAt:          s.CreatedAt,
		UpdatedAt:          s.UpdatedAt,
	}
}

func mapSession(d liveSessionDoc) domain.LiveSession {
	return domain.LiveSession{
		ID:                 d.ID.Hex(),
		SessionID:          d.SessionID,
		SellerID:           d.SellerID,
		Title:              d.Title,
		Description:        d.Description,
		ThumbnailURL:       d.ThumbnailURL,
		PlaybackURL:        d.PlaybackURL,
		Media:              d.Media,
		SourceType:         d.SourceType,
		Status:             d.Status,
		DefaultLanguage:    d.DefaultLanguage,
		SupportedLanguages: d.SupportedLanguages,
		MetricsSnapshot:    d.MetricsSnapshot,
		ScheduledAt:        d.ScheduledAt,
		StartedAt:          d.StartedAt,
		EndedAt:            d.EndedAt,
		CreatedAt:          d.CreatedAt,
		UpdatedAt:          d.UpdatedAt,
	}
}

func productToDoc(p domain.LiveProduct) liveProductDoc {
	return liveProductDoc{
		SessionID:        p.SessionID,
		ProductID:        p.ProductID,
		SellerID:         p.SellerID,
		NameSnapshot:     p.NameSnapshot,
		PriceSnapshot:    p.PriceSnapshot,
		CurrencySnapshot: p.CurrencySnapshot,
		ImageSnapshot:    p.ImageSnapshot,
		StatusSnapshot:   p.StatusSnapshot,
		PinStatus:        p.PinStatus,
		SortOrder:        p.SortOrder,
		PinnedAt:         p.PinnedAt,
		UnpinnedAt:       p.UnpinnedAt,
		PinnedBy:         p.PinnedBy,
	}
}

func mapProduct(d liveProductDoc) domain.LiveProduct {
	return domain.LiveProduct{
		ID:               d.ID.Hex(),
		SessionID:        d.SessionID,
		ProductID:        d.ProductID,
		SellerID:         d.SellerID,
		NameSnapshot:     d.NameSnapshot,
		PriceSnapshot:    d.PriceSnapshot,
		CurrencySnapshot: d.CurrencySnapshot,
		ImageSnapshot:    d.ImageSnapshot,
		StatusSnapshot:   d.StatusSnapshot,
		PinStatus:        d.PinStatus,
		SortOrder:        d.SortOrder,
		PinnedAt:         d.PinnedAt,
		UnpinnedAt:       d.UnpinnedAt,
		PinnedBy:         d.PinnedBy,
	}
}

func messageToDoc(m domain.LiveMessage) liveMessageDoc {
	return liveMessageDoc{
		MessageID:       m.MessageID,
		SessionID:       m.SessionID,
		SenderID:        m.SenderID,
		SenderRole:      m.SenderRole,
		Text:            m.Text,
		ClientMessageID: m.ClientMessageID,
		Language:        m.Language,
		Status:          m.Status,
		CreatedAt:       m.CreatedAt,
	}
}

func mapMessage(d liveMessageDoc) domain.LiveMessage {
	return domain.LiveMessage{
		ID:              d.ID.Hex(),
		MessageID:       d.MessageID,
		SessionID:       d.SessionID,
		SenderID:        d.SenderID,
		SenderRole:      d.SenderRole,
		Text:            d.Text,
		ClientMessageID: d.ClientMessageID,
		Language:        d.Language,
		Status:          d.Status,
		CreatedAt:       d.CreatedAt,
	}
}
