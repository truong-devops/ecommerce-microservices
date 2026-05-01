package repository

import (
	"context"
	"errors"
	"fmt"
	"math"
	"regexp"
	"time"

	"review-service-go/internal/domain"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type ReviewRepository interface {
	EnsureIndexes(ctx context.Context) error
	Create(ctx context.Context, payload CreateReviewPayload) (domain.Review, error)
	FindByID(ctx context.Context, id string) (*domain.Review, error)
	FindActiveDuplicate(ctx context.Context, orderID, productID, buyerID string) (*domain.Review, error)
	UpdateByID(ctx context.Context, id string, payload UpdateReviewPayload) (*domain.Review, error)
	List(ctx context.Context, query domain.ListReviewsQuery) ([]domain.Review, int64, error)
	GetProductSummary(ctx context.Context, productID string) (domain.ProductSummary, error)
}

type CreateReviewPayload struct {
	OrderID   string
	ProductID string
	SellerID  string
	BuyerID   string
	Rating    int
	Title     *string
	Content   string
	Images    []string
	Status    domain.ReviewStatus
}

type UpdateReviewPayload struct {
	Rating           *int
	Title            *string
	Content          *string
	Images           *[]string
	Status           *domain.ReviewStatus
	ModerationReason *string
	ModeratedBy      *string
	ModeratedAt      *time.Time
	Reply            *domain.ReviewReply
	DeletedAt        *time.Time
}

type mongoReviewRepository struct {
	collection *mongo.Collection
}

type reviewRecord struct {
	ID               primitive.ObjectID  `bson:"_id,omitempty"`
	OrderID          string              `bson:"orderId"`
	ProductID        string              `bson:"productId"`
	SellerID         string              `bson:"sellerId"`
	BuyerID          string              `bson:"buyerId"`
	Rating           int                 `bson:"rating"`
	Title            *string             `bson:"title,omitempty"`
	Content          string              `bson:"content"`
	Images           []string            `bson:"images"`
	Status           domain.ReviewStatus `bson:"status"`
	ModerationReason *string             `bson:"moderationReason,omitempty"`
	ModeratedBy      *string             `bson:"moderatedBy,omitempty"`
	ModeratedAt      *time.Time          `bson:"moderatedAt,omitempty"`
	Reply            *domain.ReviewReply `bson:"reply,omitempty"`
	DeletedAt        *time.Time          `bson:"deletedAt,omitempty"`
	CreatedAt        time.Time           `bson:"createdAt"`
	UpdatedAt        time.Time           `bson:"updatedAt"`
}

func NewMongoReviewRepository(db *mongo.Database) ReviewRepository {
	return &mongoReviewRepository{
		collection: db.Collection("reviews"),
	}
}

func (r *mongoReviewRepository) EnsureIndexes(ctx context.Context) error {
	models := []mongo.IndexModel{
		{
			Keys: bson.D{{Key: "orderId", Value: 1}, {Key: "productId", Value: 1}, {Key: "buyerId", Value: 1}},
			Options: options.Index().SetUnique(true).SetPartialFilterExpression(bson.M{
				"status": bson.M{"$in": []domain.ReviewStatus{domain.ReviewStatusPublished, domain.ReviewStatusHidden, domain.ReviewStatusRejected}},
			}),
		},
		{
			Keys: bson.D{{Key: "productId", Value: 1}, {Key: "status", Value: 1}, {Key: "createdAt", Value: -1}},
		},
		{
			Keys: bson.D{{Key: "sellerId", Value: 1}, {Key: "status", Value: 1}, {Key: "createdAt", Value: -1}},
		},
	}

	_, err := r.collection.Indexes().CreateMany(ctx, models)
	return err
}

func (r *mongoReviewRepository) Create(ctx context.Context, payload CreateReviewPayload) (domain.Review, error) {
	now := time.Now().UTC()
	record := reviewRecord{
		OrderID:   payload.OrderID,
		ProductID: payload.ProductID,
		SellerID:  payload.SellerID,
		BuyerID:   payload.BuyerID,
		Rating:    payload.Rating,
		Title:     payload.Title,
		Content:   payload.Content,
		Images:    payload.Images,
		Status:    payload.Status,
		CreatedAt: now,
		UpdatedAt: now,
	}

	result, err := r.collection.InsertOne(ctx, record)
	if err != nil {
		return domain.Review{}, err
	}

	id, ok := result.InsertedID.(primitive.ObjectID)
	if !ok {
		return domain.Review{}, fmt.Errorf("unexpected inserted id type")
	}

	record.ID = id
	return toDomain(record), nil
}

func (r *mongoReviewRepository) FindByID(ctx context.Context, id string) (*domain.Review, error) {
	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, nil
	}

	var record reviewRecord
	err = r.collection.FindOne(ctx, bson.M{"_id": objectID}).Decode(&record)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, nil
		}
		return nil, err
	}

	review := toDomain(record)
	return &review, nil
}

func (r *mongoReviewRepository) FindActiveDuplicate(ctx context.Context, orderID, productID, buyerID string) (*domain.Review, error) {
	filter := bson.M{
		"orderId":   orderID,
		"productId": productID,
		"buyerId":   buyerID,
		"status": bson.M{
			"$in": []domain.ReviewStatus{domain.ReviewStatusPublished, domain.ReviewStatusHidden, domain.ReviewStatusRejected},
		},
	}

	var record reviewRecord
	err := r.collection.FindOne(ctx, filter).Decode(&record)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, nil
		}
		return nil, err
	}

	review := toDomain(record)
	return &review, nil
}

func (r *mongoReviewRepository) UpdateByID(ctx context.Context, id string, payload UpdateReviewPayload) (*domain.Review, error) {
	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, nil
	}

	set := bson.M{"updatedAt": time.Now().UTC()}
	if payload.Rating != nil {
		set["rating"] = *payload.Rating
	}
	if payload.Title != nil {
		set["title"] = *payload.Title
	}
	if payload.Content != nil {
		set["content"] = *payload.Content
	}
	if payload.Images != nil {
		set["images"] = *payload.Images
	}
	if payload.Status != nil {
		set["status"] = *payload.Status
	}
	if payload.ModerationReason != nil {
		set["moderationReason"] = *payload.ModerationReason
	}
	if payload.ModeratedBy != nil {
		set["moderatedBy"] = *payload.ModeratedBy
	}
	if payload.ModeratedAt != nil {
		set["moderatedAt"] = *payload.ModeratedAt
	}
	if payload.Reply != nil {
		set["reply"] = payload.Reply
	}
	if payload.DeletedAt != nil {
		set["deletedAt"] = *payload.DeletedAt
	}

	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var updated reviewRecord
	err = r.collection.FindOneAndUpdate(ctx, bson.M{"_id": objectID}, bson.M{"$set": set}, opts).Decode(&updated)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, nil
		}
		return nil, err
	}

	review := toDomain(updated)
	return &review, nil
}

func (r *mongoReviewRepository) List(ctx context.Context, query domain.ListReviewsQuery) ([]domain.Review, int64, error) {
	condition := bson.M{}
	if query.Status != nil {
		condition["status"] = *query.Status
	} else {
		condition["status"] = bson.M{"$ne": domain.ReviewStatusDeleted}
	}

	if query.ProductID != nil {
		condition["productId"] = *query.ProductID
	}
	if query.SellerID != nil {
		condition["sellerId"] = *query.SellerID
	}
	if query.BuyerID != nil {
		condition["buyerId"] = *query.BuyerID
	}
	if query.Rating != nil {
		condition["rating"] = *query.Rating
	}
	if query.Search != nil {
		search := regexp.QuoteMeta(*query.Search)
		condition["$or"] = []bson.M{
			{"title": bson.M{"$regex": search, "$options": "i"}},
			{"content": bson.M{"$regex": search, "$options": "i"}},
		}
	}

	total, err := r.collection.CountDocuments(ctx, condition)
	if err != nil {
		return nil, 0, err
	}

	sortField := string(query.SortBy)
	if sortField == "" {
		sortField = string(domain.ReviewSortByCreatedAt)
	}
	sortOrder := -1
	if query.SortOrder == domain.SortOrderASC {
		sortOrder = 1
	}

	page := query.Page
	if page <= 0 {
		page = 1
	}
	pageSize := query.PageSize
	if pageSize <= 0 {
		pageSize = 20
	}

	findOpts := options.Find().
		SetSort(bson.D{{Key: sortField, Value: sortOrder}}).
		SetSkip(int64((page - 1) * pageSize)).
		SetLimit(int64(pageSize))

	cursor, err := r.collection.Find(ctx, condition, findOpts)
	if err != nil {
		return nil, 0, err
	}
	defer cursor.Close(ctx)

	items := make([]domain.Review, 0, pageSize)
	for cursor.Next(ctx) {
		var record reviewRecord
		if err := cursor.Decode(&record); err != nil {
			return nil, 0, err
		}
		items = append(items, toDomain(record))
	}

	if err := cursor.Err(); err != nil {
		return nil, 0, err
	}

	return items, total, nil
}

func (r *mongoReviewRepository) GetProductSummary(ctx context.Context, productID string) (domain.ProductSummary, error) {
	matchCondition := bson.M{
		"productId": productID,
		"status":    domain.ReviewStatusPublished,
	}

	type avgResult struct {
		AverageRating float64 `bson:"averageRating"`
		TotalReviews  int64   `bson:"totalReviews"`
	}

	avgPipeline := mongo.Pipeline{
		{{Key: "$match", Value: matchCondition}},
		{{Key: "$group", Value: bson.M{
			"_id":           nil,
			"averageRating": bson.M{"$avg": "$rating"},
			"totalReviews":  bson.M{"$sum": 1},
		}}},
	}

	avgCursor, err := r.collection.Aggregate(ctx, avgPipeline)
	if err != nil {
		return domain.ProductSummary{}, err
	}
	defer avgCursor.Close(ctx)

	averageRating := 0.0
	totalReviews := int64(0)
	if avgCursor.Next(ctx) {
		var res avgResult
		if err := avgCursor.Decode(&res); err != nil {
			return domain.ProductSummary{}, err
		}
		averageRating = math.Round(res.AverageRating*100) / 100
		totalReviews = res.TotalReviews
	}

	starsPipeline := mongo.Pipeline{
		{{Key: "$match", Value: matchCondition}},
		{{Key: "$group", Value: bson.M{
			"_id":   "$rating",
			"count": bson.M{"$sum": 1},
		}}},
	}

	starsCursor, err := r.collection.Aggregate(ctx, starsPipeline)
	if err != nil {
		return domain.ProductSummary{}, err
	}
	defer starsCursor.Close(ctx)

	starDistribution := map[string]int{"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
	for starsCursor.Next(ctx) {
		var item struct {
			ID    int `bson:"_id"`
			Count int `bson:"count"`
		}
		if err := starsCursor.Decode(&item); err != nil {
			return domain.ProductSummary{}, err
		}
		starDistribution[fmt.Sprintf("%d", item.ID)] = item.Count
	}

	return domain.ProductSummary{
		ProductID:        productID,
		AverageRating:    averageRating,
		TotalReviews:     totalReviews,
		StarDistribution: starDistribution,
	}, nil
}

func toDomain(record reviewRecord) domain.Review {
	return domain.Review{
		ID:               record.ID.Hex(),
		OrderID:          record.OrderID,
		ProductID:        record.ProductID,
		SellerID:         record.SellerID,
		BuyerID:          record.BuyerID,
		Rating:           record.Rating,
		Title:            record.Title,
		Content:          record.Content,
		Images:           record.Images,
		Status:           record.Status,
		ModerationReason: record.ModerationReason,
		ModeratedBy:      record.ModeratedBy,
		ModeratedAt:      record.ModeratedAt,
		Reply:            record.Reply,
		DeletedAt:        record.DeletedAt,
		CreatedAt:        record.CreatedAt,
		UpdatedAt:        record.UpdatedAt,
	}
}
