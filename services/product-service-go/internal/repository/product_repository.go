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

type ProductRepository interface {
	EnsureIndexes(ctx context.Context) error
	Create(ctx context.Context, payload CreateProductPayload) (domain.Product, error)
	FindByID(ctx context.Context, id string, includeDeleted bool) (*domain.Product, error)
	FindBySlug(ctx context.Context, slug string, excludeID string) (*domain.Product, error)
	FindFirstBySKUs(ctx context.Context, skus []string, excludeID string) (*domain.Product, error)
	FindByIDsOrdered(ctx context.Context, ids []string) ([]domain.Product, error)
	List(ctx context.Context, query domain.ListProductsQuery, fixed ProductListFixed) ([]domain.Product, int64, error)
	UpdateByID(ctx context.Context, id string, payload UpdateProductPayload) (*domain.Product, error)
	SoftDelete(ctx context.Context, id string) (*domain.Product, error)
}

type ProductListFixed struct {
	Status   domain.ProductStatus
	SellerID string
	IDs      []string
}

type CreateProductPayload struct {
	SellerID    string
	Name        string
	Slug        string
	Description *string
	CategoryID  string
	Brand       *string
	Status      domain.ProductStatus
	Attributes  map[string]any
	Images      []string
	Variants    []domain.ProductVariant
	MinPrice    float64
}

type UpdateProductPayload struct {
	SellerID    *string
	Name        *string
	Slug        *string
	Description **string
	CategoryID  *string
	Brand       **string
	Status      *domain.ProductStatus
	Attributes  map[string]any
	Images      *[]string
	Variants    *[]domain.ProductVariant
	MinPrice    *float64
}

type mongoProductRepository struct {
	collection *mongo.Collection
}

type productRecord struct {
	ID          primitive.ObjectID      `bson:"_id,omitempty"`
	SellerID    string                  `bson:"sellerId"`
	Name        string                  `bson:"name"`
	Slug        string                  `bson:"slug"`
	Description *string                 `bson:"description,omitempty"`
	CategoryID  string                  `bson:"categoryId"`
	Brand       *string                 `bson:"brand,omitempty"`
	Status      domain.ProductStatus    `bson:"status"`
	Attributes  map[string]any          `bson:"attributes"`
	Images      []string                `bson:"images"`
	Variants    []domain.ProductVariant `bson:"variants"`
	MinPrice    float64                 `bson:"minPrice"`
	DeletedAt   *time.Time              `bson:"deletedAt,omitempty"`
	CreatedAt   time.Time               `bson:"createdAt"`
	UpdatedAt   time.Time               `bson:"updatedAt"`
}

func NewMongoProductRepository(db *mongo.Database) ProductRepository {
	return &mongoProductRepository{collection: db.Collection("products")}
}

func (r *mongoProductRepository) EnsureIndexes(ctx context.Context) error {
	models := []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "slug", Value: 1}},
			Options: options.Index().SetUnique(true).SetPartialFilterExpression(bson.M{"deletedAt": nil}),
		},
		{Keys: bson.D{{Key: "sellerId", Value: 1}, {Key: "status", Value: 1}, {Key: "createdAt", Value: -1}}},
		{Keys: bson.D{{Key: "status", Value: 1}, {Key: "categoryId", Value: 1}, {Key: "brand", Value: 1}, {Key: "minPrice", Value: 1}, {Key: "createdAt", Value: -1}}},
		{Keys: bson.D{{Key: "name", Value: "text"}, {Key: "description", Value: "text"}, {Key: "brand", Value: "text"}, {Key: "slug", Value: "text"}}},
	}
	_, err := r.collection.Indexes().CreateMany(ctx, models)
	return err
}

func (r *mongoProductRepository) Create(ctx context.Context, payload CreateProductPayload) (domain.Product, error) {
	now := time.Now().UTC()
	record := productRecord{
		SellerID:    payload.SellerID,
		Name:        payload.Name,
		Slug:        payload.Slug,
		Description: payload.Description,
		CategoryID:  payload.CategoryID,
		Brand:       payload.Brand,
		Status:      payload.Status,
		Attributes:  payload.Attributes,
		Images:      payload.Images,
		Variants:    payload.Variants,
		MinPrice:    payload.MinPrice,
		DeletedAt:   nil,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	result, err := r.collection.InsertOne(ctx, record)
	if err != nil {
		return domain.Product{}, err
	}
	if id, ok := result.InsertedID.(primitive.ObjectID); ok {
		record.ID = id
	}
	return toProductDomain(record), nil
}

func (r *mongoProductRepository) FindByID(ctx context.Context, id string, includeDeleted bool) (*domain.Product, error) {
	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, nil
	}
	filter := bson.M{"_id": objectID}
	if !includeDeleted {
		filter["deletedAt"] = nil
	}
	return r.findOne(ctx, filter)
}

func (r *mongoProductRepository) FindBySlug(ctx context.Context, slug string, excludeID string) (*domain.Product, error) {
	filter := bson.M{"slug": slug, "deletedAt": nil}
	if excludeID != "" {
		if objectID, err := primitive.ObjectIDFromHex(excludeID); err == nil {
			filter["_id"] = bson.M{"$ne": objectID}
		}
	}
	return r.findOne(ctx, filter)
}

func (r *mongoProductRepository) FindFirstBySKUs(ctx context.Context, skus []string, excludeID string) (*domain.Product, error) {
	filter := bson.M{"deletedAt": nil, "variants.sku": bson.M{"$in": skus}}
	if excludeID != "" {
		if objectID, err := primitive.ObjectIDFromHex(excludeID); err == nil {
			filter["_id"] = bson.M{"$ne": objectID}
		}
	}
	return r.findOne(ctx, filter)
}

func (r *mongoProductRepository) FindByIDsOrdered(ctx context.Context, ids []string) ([]domain.Product, error) {
	objectIDs := make([]primitive.ObjectID, 0, len(ids))
	for _, id := range ids {
		objectID, err := primitive.ObjectIDFromHex(id)
		if err == nil {
			objectIDs = append(objectIDs, objectID)
		}
	}
	if len(objectIDs) == 0 {
		return []domain.Product{}, nil
	}
	cursor, err := r.collection.Find(ctx, bson.M{"_id": bson.M{"$in": objectIDs}, "deletedAt": nil})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	byID := map[string]domain.Product{}
	for cursor.Next(ctx) {
		var record productRecord
		if err := cursor.Decode(&record); err != nil {
			return nil, err
		}
		product := toProductDomain(record)
		byID[product.ID] = product
	}
	out := make([]domain.Product, 0, len(ids))
	for _, id := range ids {
		if product, ok := byID[id]; ok {
			out = append(out, product)
		}
	}
	return out, cursor.Err()
}

func (r *mongoProductRepository) List(ctx context.Context, query domain.ListProductsQuery, fixed ProductListFixed) ([]domain.Product, int64, error) {
	filter := bson.M{"deletedAt": nil}
	if fixed.Status != "" {
		filter["status"] = fixed.Status
	} else if query.Status != "" {
		filter["status"] = query.Status
	}
	if fixed.SellerID != "" {
		filter["sellerId"] = fixed.SellerID
	} else if query.SellerID != "" {
		filter["sellerId"] = query.SellerID
	}
	if query.CategoryID != "" {
		filter["categoryId"] = query.CategoryID
	}
	if query.Brand != "" {
		filter["brand"] = query.Brand
	}
	if query.Search != "" {
		pattern := primitive.Regex{Pattern: regexp.QuoteMeta(query.Search), Options: "i"}
		filter["$or"] = []bson.M{{"name": pattern}, {"slug": pattern}, {"brand": pattern}, {"variants.sku": pattern}}
	}
	if len(fixed.IDs) > 0 {
		objectIDs := make([]primitive.ObjectID, 0, len(fixed.IDs))
		for _, id := range fixed.IDs {
			if objectID, err := primitive.ObjectIDFromHex(id); err == nil {
				objectIDs = append(objectIDs, objectID)
			}
		}
		filter["_id"] = bson.M{"$in": objectIDs}
	}

	total, err := r.collection.CountDocuments(ctx, filter)
	if err != nil {
		return nil, 0, err
	}

	page, pageSize := normalizePage(query.Page, query.PageSize)
	opts := options.Find().
		SetSort(resolveProductSort(query.SortBy, query.SortOrder)).
		SetSkip(int64((page - 1) * pageSize)).
		SetLimit(int64(pageSize))

	cursor, err := r.collection.Find(ctx, filter, opts)
	if err != nil {
		return nil, 0, err
	}
	defer cursor.Close(ctx)

	items := []domain.Product{}
	for cursor.Next(ctx) {
		var record productRecord
		if err := cursor.Decode(&record); err != nil {
			return nil, 0, err
		}
		items = append(items, toProductDomain(record))
	}
	return items, total, cursor.Err()
}

func (r *mongoProductRepository) UpdateByID(ctx context.Context, id string, payload UpdateProductPayload) (*domain.Product, error) {
	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, nil
	}
	set := bson.M{"updatedAt": time.Now().UTC()}
	if payload.SellerID != nil {
		set["sellerId"] = *payload.SellerID
	}
	if payload.Name != nil {
		set["name"] = *payload.Name
	}
	if payload.Slug != nil {
		set["slug"] = *payload.Slug
	}
	if payload.Description != nil {
		set["description"] = *payload.Description
	}
	if payload.CategoryID != nil {
		set["categoryId"] = *payload.CategoryID
	}
	if payload.Brand != nil {
		set["brand"] = *payload.Brand
	}
	if payload.Status != nil {
		set["status"] = *payload.Status
	}
	if payload.Attributes != nil {
		set["attributes"] = payload.Attributes
	}
	if payload.Images != nil {
		set["images"] = *payload.Images
	}
	if payload.Variants != nil {
		set["variants"] = *payload.Variants
	}
	if payload.MinPrice != nil {
		set["minPrice"] = *payload.MinPrice
	}
	return r.findOneAndUpdate(ctx, bson.M{"_id": objectID, "deletedAt": nil}, bson.M{"$set": set})
}

func (r *mongoProductRepository) SoftDelete(ctx context.Context, id string) (*domain.Product, error) {
	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, nil
	}
	now := time.Now().UTC()
	return r.findOneAndUpdate(ctx, bson.M{"_id": objectID, "deletedAt": nil}, bson.M{"$set": bson.M{"deletedAt": now, "status": domain.ProductStatusArchived, "updatedAt": now}})
}

func (r *mongoProductRepository) findOne(ctx context.Context, filter bson.M) (*domain.Product, error) {
	var record productRecord
	err := r.collection.FindOne(ctx, filter).Decode(&record)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, nil
		}
		return nil, err
	}
	product := toProductDomain(record)
	return &product, nil
}

func (r *mongoProductRepository) findOneAndUpdate(ctx context.Context, filter bson.M, update bson.M) (*domain.Product, error) {
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var record productRecord
	err := r.collection.FindOneAndUpdate(ctx, filter, update, opts).Decode(&record)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, nil
		}
		return nil, err
	}
	product := toProductDomain(record)
	return &product, nil
}

func toProductDomain(record productRecord) domain.Product {
	return domain.Product{
		ID:          record.ID.Hex(),
		SellerID:    record.SellerID,
		Name:        record.Name,
		Slug:        record.Slug,
		Description: record.Description,
		CategoryID:  record.CategoryID,
		Brand:       record.Brand,
		Status:      record.Status,
		Attributes:  record.Attributes,
		Images:      record.Images,
		Variants:    record.Variants,
		MinPrice:    record.MinPrice,
		DeletedAt:   record.DeletedAt,
		CreatedAt:   record.CreatedAt,
		UpdatedAt:   record.UpdatedAt,
	}
}

func normalizePage(page, pageSize int) (int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	return page, pageSize
}

func resolveProductSort(sortBy string, order domain.SortOrder) bson.D {
	dir := -1
	if order == domain.SortOrderAsc {
		dir = 1
	}
	switch sortBy {
	case "name":
		return bson.D{{Key: "name", Value: dir}}
	case "minPrice":
		return bson.D{{Key: "minPrice", Value: dir}}
	case "updatedAt":
		return bson.D{{Key: "updatedAt", Value: dir}}
	default:
		return bson.D{{Key: "createdAt", Value: dir}}
	}
}
