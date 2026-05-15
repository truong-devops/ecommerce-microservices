package repository

import (
	"context"
	"errors"
	"regexp"
	"time"

	"product-service-go/internal/domain"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type VideoRepository interface {
	EnsureIndexes(ctx context.Context) error
	ListFeed(ctx context.Context, query domain.ListProductVideosQuery) ([]domain.ProductVideo, int64, error)
	FindPublishedByVideoID(ctx context.Context, videoID string) (*domain.ProductVideo, error)
}

type mongoVideoRepository struct {
	collection *mongo.Collection
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

func NewMongoVideoRepository(db *mongo.Database) VideoRepository {
	return &mongoVideoRepository{collection: db.Collection("product_videos")}
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
	return err
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

	total, err := r.collection.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, err
	}
	page, pageSize := normalizePage(query.Page, query.PageSize)
	opts := options.Find().
		SetSort(bson.D{{Key: "publishedAt", Value: -1}, {Key: "createdAt", Value: -1}}).
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

func dateTimePtr(value *primitive.DateTime) *time.Time {
	if value == nil {
		return nil
	}
	t := value.Time()
	return &t
}
