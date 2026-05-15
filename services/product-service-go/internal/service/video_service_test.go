package service

import (
	"context"
	"testing"
	"time"

	"product-service-go/internal/domain"
)

func TestVideoFeedMapsPublishedVideos(t *testing.T) {
	publishedAt := time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)
	repo := &fakeVideoRepo{items: []domain.ProductVideo{{
		VideoID:        "video-1",
		SellerID:       "seller-1",
		Title:          "Demo video",
		Status:         domain.ProductVideoStatusPublished,
		MediaObjectKey: stringPtr("videos/demo.mp4"),
		Products: []domain.VideoProductTag{{
			ProductID:        "product-1",
			NameSnapshot:     "Demo Product",
			ImageSnapshot:    stringPtr("products/product-1/image.jpg"),
			PriceSnapshot:    100000,
			CurrencySnapshot: "VND",
			StatusSnapshot:   "ACTIVE",
			SortOrder:        1,
		}},
		PublishedAt: &publishedAt,
		CreatedAt:   publishedAt,
		UpdatedAt:   publishedAt,
	}}}
	service := NewVideoService(repo, nil, "http://localhost:12030/ecommerce-media")

	result, err := service.ListFeed(context.Background(), domain.ListProductVideosQuery{Page: 1, PageSize: 12})
	if err != nil {
		t.Fatalf("ListFeed returned error: %v", err)
	}
	if len(result.Items) != 1 {
		t.Fatalf("expected one video, got %d", len(result.Items))
	}
	if got := *result.Items[0].MediaURL; got != "http://localhost:12030/ecommerce-media/videos/demo.mp4" {
		t.Fatalf("unexpected media URL: %s", got)
	}
	if got := *result.Items[0].Products[0].Image; got != "products/product-1/image.jpg" {
		t.Fatalf("unexpected product image URL: %s", got)
	}
}

type fakeVideoRepo struct {
	items []domain.ProductVideo
}

func (r *fakeVideoRepo) EnsureIndexes(context.Context) error { return nil }
func (r *fakeVideoRepo) ListFeed(context.Context, domain.ListProductVideosQuery) ([]domain.ProductVideo, int64, error) {
	return r.items, int64(len(r.items)), nil
}
func (r *fakeVideoRepo) FindPublishedByVideoID(context.Context, string) (*domain.ProductVideo, error) {
	if len(r.items) == 0 {
		return nil, nil
	}
	return &r.items[0], nil
}

func stringPtr(value string) *string {
	return &value
}
