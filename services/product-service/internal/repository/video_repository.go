package repository

import (
	"context"
	"errors"
	"regexp"
	"time"

	"product-service/internal/domain"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type VideoRepository interface {
	EnsureIndexes(ctx context.Context) error
	CreateVideo(ctx context.Context, payload CreateVideoPayload) (domain.ProductVideo, error)
	FindByVideoID(ctx context.Context, videoID string, includeArchived bool) (*domain.ProductVideo, error)
	UpdateByVideoID(ctx context.Context, videoID string, set bson.M) (*domain.ProductVideo, error)
	ListManaged(ctx context.Context, query domain.ListProductVideosQuery, sellerID string) ([]domain.ProductVideo, int64, error)
	ListFeed(ctx context.Context, query domain.ListProductVideosQuery) ([]domain.ProductVideo, int64, error)
	FindPublishedByVideoID(ctx context.Context, videoID string) (*domain.ProductVideo, error)
	IncrementMetricsOnce(ctx context.Context, videoID string, eventKey string, increments map[string]int64) (bool, error)
	IncrementCommentCount(ctx context.Context, videoID string) error
	CreateComment(ctx context.Context, payload CreateVideoCommentPayload) (domain.VideoComment, bool, error)
	ListComments(ctx context.Context, videoID string, query domain.ListVideoCommentsQuery) ([]domain.VideoComment, int64, error)
}

type mongoVideoRepository struct {
	collection        *mongo.Collection
	commentCollection *mongo.Collection
}

type CreateVideoPayload struct {
	VideoID     string
	SellerID    string
	Title       string
	Description *string
	Status      domain.ProductVideoStatus
	Products    []domain.VideoProductTag
}

type CreateVideoCommentPayload struct {
	CommentID       string
	VideoID         string
	UserID          string
	UserRole        domain.Role
	Text            string
	ClientCommentID string
}

type productVideoRecord struct {
	ID                 primitive.ObjectID          `bson:"_id,omitempty"`
	VideoID            string                      `bson:"videoId"`
	SellerID           string                      `bson:"sellerId"`
	Title              string                      `bson:"title"`
	Description        *string                     `bson:"description,omitempty"`
	Status             domain.ProductVideoStatus   `bson:"status"`
	MediaObjectKey     *string                     `bson:"mediaObjectKey,omitempty"`
	MediaURL           *string                     `bson:"mediaUrl,omitempty"`
	ThumbnailObjectKey *string                     `bson:"thumbnailObjectKey,omitempty"`
	ThumbnailURL       *string                     `bson:"thumbnailUrl,omitempty"`
	MimeType           *string                     `bson:"mimeType,omitempty"`
	SizeBytes          *int64                      `bson:"sizeBytes,omitempty"`
	DurationSec        *float64                    `bson:"durationSec,omitempty"`
	Products           []domain.VideoProductTag    `bson:"products"`
	Moderation         domain.VideoModeration      `bson:"moderation"`
	MetricsSnapshot    domain.VideoMetricsSnapshot `bson:"metricsSnapshot"`
	RecentEventKeys    []string                    `bson:"recentEventKeys,omitempty"`
	PublishedAt        *primitive.DateTime         `bson:"publishedAt,omitempty"`
	HiddenAt           *primitive.DateTime         `bson:"hiddenAt,omitempty"`
	ArchivedAt         *primitive.DateTime         `bson:"archivedAt,omitempty"`
	CreatedAt          primitive.DateTime          `bson:"createdAt"`
	UpdatedAt          primitive.DateTime          `bson:"updatedAt"`
}

type videoCommentRecord struct {
	ID              primitive.ObjectID        `bson:"_id,omitempty"`
	CommentID       string                    `bson:"commentId"`
	VideoID         string                    `bson:"videoId"`
	UserID          string                    `bson:"userId"`
	UserRole        domain.Role               `bson:"userRole"`
	Text            string                    `bson:"text"`
	Status          domain.VideoCommentStatus `bson:"status"`
	ClientCommentID string                    `bson:"clientCommentId,omitempty"`
	CreatedAt       primitive.DateTime        `bson:"createdAt"`
	UpdatedAt       primitive.DateTime        `bson:"updatedAt"`
	HiddenAt        *primitive.DateTime       `bson:"hiddenAt,omitempty"`
	DeletedAt       *primitive.DateTime       `bson:"deletedAt,omitempty"`
}

func NewMongoVideoRepository(db *mongo.Database) VideoRepository {
	return &mongoVideoRepository{
		collection:        db.Collection("product_videos"),
		commentCollection: db.Collection("product_video_comments"),
	}
}

func (r *mongoVideoRepository) EnsureIndexes(ctx context.Context) error {
	models := []mongo.IndexModel{
		{Keys: bson.D{{Key: "videoId", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "sellerId", Value: 1}, {Key: "createdAt", Value: -1}}},
		{Keys: bson.D{{Key: "sellerId", Value: 1}, {Key: "status", Value: 1}, {Key: "updatedAt", Value: -1}}},
		{Keys: bson.D{{Key: "status", Value: 1}, {Key: "publishedAt", Value: -1}}},
		{Keys: bson.D{{Key: "products.productId", Value: 1}, {Key: "status", Value: 1}}},
	}
	_, err := r.collection.Indexes().CreateMany(ctx, models)
	if err != nil {
		return err
	}
	commentModels := []mongo.IndexModel{
		{Keys: bson.D{{Key: "commentId", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "videoId", Value: 1}, {Key: "status", Value: 1}, {Key: "createdAt", Value: -1}}},
		{
			Keys:    bson.D{{Key: "videoId", Value: 1}, {Key: "userId", Value: 1}, {Key: "clientCommentId", Value: 1}},
			Options: options.Index().SetUnique(true).SetSparse(true),
		},
		{Keys: bson.D{{Key: "status", Value: 1}, {Key: "createdAt", Value: -1}}},
	}
	_, err = r.commentCollection.Indexes().CreateMany(ctx, commentModels)
	return err
}

func (r *mongoVideoRepository) CreateVideo(ctx context.Context, payload CreateVideoPayload) (domain.ProductVideo, error) {
	now := primitive.NewDateTimeFromTime(time.Now().UTC())
	record := productVideoRecord{
		VideoID:     payload.VideoID,
		SellerID:    payload.SellerID,
		Title:       payload.Title,
		Description: payload.Description,
		Status:      payload.Status,
		Products:    payload.Products,
		Moderation:  domain.VideoModeration{PolicyFlags: []string{}},
		MetricsSnapshot: domain.VideoMetricsSnapshot{
			ViewStartedCount:   0,
			QualifiedViewCount: 0,
			ProductClickCount:  0,
			AddToCartCount:     0,
			CommentCount:       0,
			CTR:                0,
			AddToCartRate:      0,
		},
		RecentEventKeys: []string{},
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	result, err := r.collection.InsertOne(ctx, record)
	if err != nil {
		return domain.ProductVideo{}, err
	}
	if id, ok := result.InsertedID.(primitive.ObjectID); ok {
		record.ID = id
	}
	return toVideoDomain(record), nil
}

func (r *mongoVideoRepository) FindByVideoID(ctx context.Context, videoID string, includeArchived bool) (*domain.ProductVideo, error) {
	filter := bson.M{"videoId": videoID}
	if !includeArchived {
		filter["archivedAt"] = nil
	}
	var record productVideoRecord
	err := r.collection.FindOne(ctx, filter).Decode(&record)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, nil
		}
		return nil, err
	}
	video := toVideoDomain(record)
	return &video, nil
}

func (r *mongoVideoRepository) UpdateByVideoID(ctx context.Context, videoID string, set bson.M) (*domain.ProductVideo, error) {
	set["updatedAt"] = time.Now().UTC()
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var record productVideoRecord
	err := r.collection.FindOneAndUpdate(
		ctx,
		bson.M{"videoId": videoID, "archivedAt": nil},
		bson.M{"$set": set},
		opts,
	).Decode(&record)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, nil
		}
		return nil, err
	}
	video := toVideoDomain(record)
	return &video, nil
}

func (r *mongoVideoRepository) ListManaged(ctx context.Context, query domain.ListProductVideosQuery, sellerID string) ([]domain.ProductVideo, int64, error) {
	filter := bson.M{"archivedAt": nil}
	if query.Status != "" {
		filter["status"] = query.Status
	}
	if sellerID != "" {
		filter["sellerId"] = sellerID
	} else if query.SellerID != "" {
		filter["sellerId"] = query.SellerID
	}
	if query.ProductID != "" {
		filter["products.productId"] = query.ProductID
	}
	if query.Search != "" {
		filter["title"] = primitive.Regex{Pattern: regexp.QuoteMeta(query.Search), Options: "i"}
	}
	return r.list(ctx, filter, query, bson.D{{Key: "updatedAt", Value: -1}, {Key: "createdAt", Value: -1}})
}

func (r *mongoVideoRepository) ListFeed(ctx context.Context, query domain.ListProductVideosQuery) ([]domain.ProductVideo, int64, error) {
	filter := bson.M{
		"archivedAt":  nil,
		"status":      domain.ProductVideoStatusPublished,
		"publishedAt": bson.M{"$ne": nil},
	}
	if query.ProductID != "" {
		filter["products.productId"] = query.ProductID
	}
	if query.SellerID != "" {
		filter["sellerId"] = query.SellerID
	}
	if query.Search != "" {
		filter["title"] = primitive.Regex{Pattern: regexp.QuoteMeta(query.Search), Options: "i"}
	}

	return r.list(ctx, filter, query, bson.D{{Key: "publishedAt", Value: -1}, {Key: "createdAt", Value: -1}})
}

func (r *mongoVideoRepository) FindPublishedByVideoID(ctx context.Context, videoID string) (*domain.ProductVideo, error) {
	var record productVideoRecord
	err := r.collection.FindOne(ctx, bson.M{
		"videoId":    videoID,
		"archivedAt": nil,
		"status":     domain.ProductVideoStatusPublished,
	}).Decode(&record)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, nil
		}
		return nil, err
	}
	video := toVideoDomain(record)
	return &video, nil
}

func (r *mongoVideoRepository) IncrementMetricsOnce(ctx context.Context, videoID string, eventKey string, increments map[string]int64) (bool, error) {
	inc := bson.M{}
	for key, value := range increments {
		if value > 0 {
			inc["metricsSnapshot."+key] = value
		}
	}
	if len(inc) == 0 {
		return false, nil
	}
	result, err := r.collection.UpdateOne(
		ctx,
		bson.M{
			"videoId":         videoID,
			"status":          domain.ProductVideoStatusPublished,
			"archivedAt":      nil,
			"recentEventKeys": bson.M{"$ne": eventKey},
		},
		bson.M{
			"$inc":  inc,
			"$set":  bson.M{"metricsSnapshot.lastAggregatedAt": time.Now().UTC(), "updatedAt": time.Now().UTC()},
			"$push": bson.M{"recentEventKeys": bson.M{"$each": []string{eventKey}, "$slice": -500}},
		},
	)
	if err != nil {
		return false, err
	}
	return result.ModifiedCount > 0, nil
}

func (r *mongoVideoRepository) IncrementCommentCount(ctx context.Context, videoID string) error {
	_, err := r.collection.UpdateOne(
		ctx,
		bson.M{"videoId": videoID, "status": domain.ProductVideoStatusPublished, "archivedAt": nil},
		bson.M{
			"$inc": bson.M{"metricsSnapshot.commentCount": 1},
			"$set": bson.M{"metricsSnapshot.lastAggregatedAt": time.Now().UTC(), "updatedAt": time.Now().UTC()},
		},
	)
	return err
}

func (r *mongoVideoRepository) CreateComment(ctx context.Context, payload CreateVideoCommentPayload) (domain.VideoComment, bool, error) {
	now := primitive.NewDateTimeFromTime(time.Now().UTC())
	record := videoCommentRecord{
		ID:              primitive.NewObjectID(),
		CommentID:       payload.CommentID,
		VideoID:         payload.VideoID,
		UserID:          payload.UserID,
		UserRole:        payload.UserRole,
		Text:            payload.Text,
		Status:          domain.VideoCommentStatusVisible,
		ClientCommentID: payload.ClientCommentID,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if _, err := r.commentCollection.InsertOne(ctx, record); err != nil {
		if payload.ClientCommentID != "" && mongo.IsDuplicateKeyError(err) {
			existing, findErr := r.findCommentByClientID(ctx, payload.VideoID, payload.UserID, payload.ClientCommentID)
			if findErr != nil {
				return domain.VideoComment{}, false, findErr
			}
			if existing != nil {
				return *existing, false, nil
			}
		}
		return domain.VideoComment{}, false, err
	}
	return toVideoCommentDomain(record), true, nil
}

func (r *mongoVideoRepository) ListComments(ctx context.Context, videoID string, query domain.ListVideoCommentsQuery) ([]domain.VideoComment, int64, error) {
	filter := bson.M{"videoId": videoID, "status": domain.VideoCommentStatusVisible}
	total, err := r.commentCollection.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, err
	}
	page, pageSize := normalizePage(query.Page, query.PageSize)
	opts := options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}}).
		SetSkip(int64((page - 1) * pageSize)).
		SetLimit(int64(pageSize))
	cursor, err := r.commentCollection.Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cursor.Close(ctx)

	items := []domain.VideoComment{}
	for cursor.Next(ctx) {
		var record videoCommentRecord
		if err := cursor.Decode(&record); err != nil {
			return nil, 0, err
		}
		items = append(items, toVideoCommentDomain(record))
	}
	return items, total, cursor.Err()
}

func (r *mongoVideoRepository) findCommentByClientID(ctx context.Context, videoID, userID, clientCommentID string) (*domain.VideoComment, error) {
	var record videoCommentRecord
	err := r.commentCollection.FindOne(ctx, bson.M{
		"videoId":         videoID,
		"userId":          userID,
		"clientCommentId": clientCommentID,
	}).Decode(&record)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, nil
		}
		return nil, err
	}
	comment := toVideoCommentDomain(record)
	return &comment, nil
}

func (r *mongoVideoRepository) list(ctx context.Context, filter bson.M, query domain.ListProductVideosQuery, sort bson.D) ([]domain.ProductVideo, int64, error) {
	total, err := r.collection.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, err
	}
	page, pageSize := normalizePage(query.Page, query.PageSize)
	opts := options.Find().
		SetSort(sort).
		SetSkip(int64((page - 1) * pageSize)).
		SetLimit(int64(pageSize))
	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cursor.Close(ctx)

	items := []domain.ProductVideo{}
	for cursor.Next(ctx) {
		var record productVideoRecord
		if err := cursor.Decode(&record); err != nil {
			return nil, 0, err
		}
		items = append(items, toVideoDomain(record))
	}
	return items, total, cursor.Err()
}

func toVideoDomain(record productVideoRecord) domain.ProductVideo {
	return domain.ProductVideo{
		ID:                 record.ID.Hex(),
		VideoID:            record.VideoID,
		SellerID:           record.SellerID,
		Title:              record.Title,
		Description:        record.Description,
		Status:             record.Status,
		MediaObjectKey:     record.MediaObjectKey,
		MediaURL:           record.MediaURL,
		ThumbnailObjectKey: record.ThumbnailObjectKey,
		ThumbnailURL:       record.ThumbnailURL,
		MimeType:           record.MimeType,
		SizeBytes:          record.SizeBytes,
		DurationSec:        record.DurationSec,
		Products:           record.Products,
		Moderation:         record.Moderation,
		MetricsSnapshot:    record.MetricsSnapshot,
		RecentEventKeys:    record.RecentEventKeys,
		PublishedAt:        dateTimePtr(record.PublishedAt),
		HiddenAt:           dateTimePtr(record.HiddenAt),
		ArchivedAt:         dateTimePtr(record.ArchivedAt),
		CreatedAt:          record.CreatedAt.Time(),
		UpdatedAt:          record.UpdatedAt.Time(),
	}
}

func toVideoCommentDomain(record videoCommentRecord) domain.VideoComment {
	return domain.VideoComment{
		ID:              record.ID.Hex(),
		CommentID:       record.CommentID,
		VideoID:         record.VideoID,
		UserID:          record.UserID,
		UserRole:        record.UserRole,
		Text:            record.Text,
		Status:          record.Status,
		ClientCommentID: record.ClientCommentID,
		CreatedAt:       record.CreatedAt.Time(),
		UpdatedAt:       record.UpdatedAt.Time(),
		HiddenAt:        dateTimePtr(record.HiddenAt),
		DeletedAt:       dateTimePtr(record.DeletedAt),
	}
}

func dateTimePtr(value *primitive.DateTime) *time.Time {
	if value == nil {
		return nil
	}
	t := value.Time()
	return &t
}
