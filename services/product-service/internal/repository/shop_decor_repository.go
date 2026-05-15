package repository

import (
	"context"
	"errors"
	"time"

	"product-service/internal/domain"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type ShopDecorRepository interface {
	EnsureIndexes(ctx context.Context) error
	FindBySellerID(ctx context.Context, sellerID string) (*domain.ShopDecor, error)
	UpsertBySellerID(ctx context.Context, sellerID string, payload UpsertShopDecorPayload) (domain.ShopDecor, error)
}

type UpsertShopDecorPayload struct {
	ShopName           *string
	Slogan             *string
	LogoURL            *string
	BannerURL          *string
	AccentColor        *string
	NavItems           *[]string
	IntroTitle         *string
	IntroDescription   *string
	FeaturedCategories *[]string
}

type mongoShopDecorRepository struct {
	collection *mongo.Collection
}

type shopDecorRecord struct {
	SellerID           string    `bson:"sellerId"`
	ShopName           string    `bson:"shopName"`
	Slogan             string    `bson:"slogan"`
	LogoURL            string    `bson:"logoUrl"`
	BannerURL          string    `bson:"bannerUrl"`
	AccentColor        string    `bson:"accentColor"`
	NavItems           []string  `bson:"navItems"`
	IntroTitle         string    `bson:"introTitle"`
	IntroDescription   string    `bson:"introDescription"`
	FeaturedCategories []string  `bson:"featuredCategories"`
	CreatedAt          time.Time `bson:"createdAt"`
	UpdatedAt          time.Time `bson:"updatedAt"`
}

func NewMongoShopDecorRepository(db *mongo.Database) ShopDecorRepository {
	return &mongoShopDecorRepository{collection: db.Collection("shop_decors")}
}

func (r *mongoShopDecorRepository) EnsureIndexes(ctx context.Context) error {
	_, err := r.collection.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "sellerId", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	return err
}

func (r *mongoShopDecorRepository) FindBySellerID(ctx context.Context, sellerID string) (*domain.ShopDecor, error) {
	var record shopDecorRecord
	err := r.collection.FindOne(ctx, bson.M{"sellerId": sellerID}).Decode(&record)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, nil
		}
		return nil, err
	}
	decor := toShopDecorDomain(record)
	return &decor, nil
}

func (r *mongoShopDecorRepository) UpsertBySellerID(ctx context.Context, sellerID string, payload UpsertShopDecorPayload) (domain.ShopDecor, error) {
	now := time.Now().UTC()
	set := bson.M{"updatedAt": now}
	if payload.ShopName != nil {
		set["shopName"] = *payload.ShopName
	}
	if payload.Slogan != nil {
		set["slogan"] = *payload.Slogan
	}
	if payload.LogoURL != nil {
		set["logoUrl"] = *payload.LogoURL
	}
	if payload.BannerURL != nil {
		set["bannerUrl"] = *payload.BannerURL
	}
	if payload.AccentColor != nil {
		set["accentColor"] = *payload.AccentColor
	}
	if payload.NavItems != nil {
		set["navItems"] = *payload.NavItems
	}
	if payload.IntroTitle != nil {
		set["introTitle"] = *payload.IntroTitle
	}
	if payload.IntroDescription != nil {
		set["introDescription"] = *payload.IntroDescription
	}
	if payload.FeaturedCategories != nil {
		set["featuredCategories"] = *payload.FeaturedCategories
	}
	opts := options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)
	var record shopDecorRecord
	err := r.collection.FindOneAndUpdate(ctx, bson.M{"sellerId": sellerID}, bson.M{
		"$set": set,
		"$setOnInsert": bson.M{
			"sellerId":  sellerID,
			"createdAt": now,
		},
	}, opts).Decode(&record)
	if err != nil {
		return domain.ShopDecor{}, err
	}
	return toShopDecorDomain(record), nil
}

func toShopDecorDomain(record shopDecorRecord) domain.ShopDecor {
	return domain.ShopDecor{
		SellerID:           record.SellerID,
		ShopName:           record.ShopName,
		Slogan:             record.Slogan,
		LogoURL:            record.LogoURL,
		BannerURL:          record.BannerURL,
		AccentColor:        record.AccentColor,
		NavItems:           record.NavItems,
		IntroTitle:         record.IntroTitle,
		IntroDescription:   record.IntroDescription,
		FeaturedCategories: record.FeaturedCategories,
		CreatedAt:          record.CreatedAt,
		UpdatedAt:          record.UpdatedAt,
	}
}
