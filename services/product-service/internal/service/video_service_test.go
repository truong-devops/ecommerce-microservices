package service

import (
	"context"
	"strings"
	"testing"
	"time"

	"product-service/internal/domain"
	"product-service/internal/repository"

	"go.mongodb.org/mongo-driver/bson"
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
	service := NewVideoService(repo, &fakeProductRepo{}, nil, nil, "http://localhost:12030/ecommerce-media")

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

func TestCreateVideoCommentIncrementsCommentCount(t *testing.T) {
	now := time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)
	repo := &fakeVideoRepo{items: []domain.ProductVideo{{
		VideoID:   "video-1",
		SellerID:  "seller-1",
		Title:     "Demo video",
		Status:    domain.ProductVideoStatusPublished,
		CreatedAt: now,
		UpdatedAt: now,
	}}}
	service := NewVideoService(repo, &fakeProductRepo{}, nil, nil, "")
	user := domain.UserContext{UserID: "buyer-1", Role: domain.RoleBuyer}

	comment, err := service.CreateComment(context.Background(), user, "video-1", CreateVideoCommentInput{
		Text:            "  Hay qua  ",
		ClientCommentID: "client-1",
	})
	if err != nil {
		t.Fatalf("CreateComment returned error: %v", err)
	}
	if comment.Text != "Hay qua" || comment.VideoID != "video-1" || comment.UserID != "buyer-1" {
		t.Fatalf("unexpected comment response: %+v", comment)
	}
	if repo.commentIncrements != 1 {
		t.Fatalf("expected one comment count increment, got %d", repo.commentIncrements)
	}

	result, err := service.ListComments(context.Background(), "video-1", domain.ListVideoCommentsQuery{Page: 1, PageSize: 20})
	if err != nil {
		t.Fatalf("ListComments returned error: %v", err)
	}
	if len(result.Items) != 1 || result.Items[0].CommentID != comment.CommentID {
		t.Fatalf("expected created comment in list, got %+v", result.Items)
	}
}

func TestCreateVideoCommentIsIdempotentByClientCommentID(t *testing.T) {
	now := time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)
	repo := &fakeVideoRepo{items: []domain.ProductVideo{{
		VideoID:   "video-1",
		SellerID:  "seller-1",
		Title:     "Demo video",
		Status:    domain.ProductVideoStatusPublished,
		CreatedAt: now,
		UpdatedAt: now,
	}}}
	service := NewVideoService(repo, &fakeProductRepo{}, nil, nil, "")
	user := domain.UserContext{UserID: "buyer-1", Role: domain.RoleBuyer}

	first, err := service.CreateComment(context.Background(), user, "video-1", CreateVideoCommentInput{Text: "First", ClientCommentID: "client-1"})
	if err != nil {
		t.Fatalf("first CreateComment returned error: %v", err)
	}
	second, err := service.CreateComment(context.Background(), user, "video-1", CreateVideoCommentInput{Text: "Retry", ClientCommentID: "client-1"})
	if err != nil {
		t.Fatalf("second CreateComment returned error: %v", err)
	}
	if first.CommentID != second.CommentID {
		t.Fatalf("expected idempotent comment id, got %s and %s", first.CommentID, second.CommentID)
	}
	if repo.commentIncrements != 1 {
		t.Fatalf("expected one comment count increment, got %d", repo.commentIncrements)
	}
}

func TestCreateVideoCommentValidatesInputAndPublishedVideo(t *testing.T) {
	now := time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)
	repo := &fakeVideoRepo{items: []domain.ProductVideo{{
		VideoID:   "video-1",
		SellerID:  "seller-1",
		Title:     "Demo video",
		Status:    domain.ProductVideoStatusHidden,
		CreatedAt: now,
		UpdatedAt: now,
	}}}
	service := NewVideoService(repo, &fakeProductRepo{}, nil, nil, "")
	user := domain.UserContext{UserID: "buyer-1", Role: domain.RoleBuyer}

	if _, err := service.CreateComment(context.Background(), user, "video-1", CreateVideoCommentInput{Text: "Hidden video"}); err == nil {
		t.Fatal("expected hidden video comment to fail")
	}

	repo.items[0].Status = domain.ProductVideoStatusPublished
	if _, err := service.CreateComment(context.Background(), user, "video-1", CreateVideoCommentInput{Text: "   "}); err == nil {
		t.Fatal("expected empty comment text to fail")
	}
	if _, err := service.CreateComment(context.Background(), user, "video-1", CreateVideoCommentInput{Text: "ok", ClientCommentID: strings.Repeat("x", 129)}); err == nil {
		t.Fatal("expected too long clientCommentId to fail")
	}
}

type fakeVideoRepo struct {
	items             []domain.ProductVideo
	comments          []domain.VideoComment
	commentIncrements int
}

func (r *fakeVideoRepo) EnsureIndexes(context.Context) error { return nil }
func (r *fakeVideoRepo) CreateVideo(_ context.Context, payload repository.CreateVideoPayload) (domain.ProductVideo, error) {
	return domain.ProductVideo{VideoID: payload.VideoID, SellerID: payload.SellerID, Title: payload.Title, Status: payload.Status, Products: payload.Products}, nil
}
func (r *fakeVideoRepo) FindByVideoID(context.Context, string, bool) (*domain.ProductVideo, error) {
	if len(r.items) == 0 {
		return nil, nil
	}
	return &r.items[0], nil
}
func (r *fakeVideoRepo) UpdateByVideoID(context.Context, string, bson.M) (*domain.ProductVideo, error) {
	if len(r.items) == 0 {
		return nil, nil
	}
	return &r.items[0], nil
}
func (r *fakeVideoRepo) ListManaged(context.Context, domain.ListProductVideosQuery, string) ([]domain.ProductVideo, int64, error) {
	return r.items, int64(len(r.items)), nil
}
func (r *fakeVideoRepo) ListFeed(context.Context, domain.ListProductVideosQuery) ([]domain.ProductVideo, int64, error) {
	return r.items, int64(len(r.items)), nil
}
func (r *fakeVideoRepo) FindPublishedByVideoID(context.Context, string) (*domain.ProductVideo, error) {
	if len(r.items) == 0 {
		return nil, nil
	}
	if r.items[0].Status != domain.ProductVideoStatusPublished {
		return nil, nil
	}
	return &r.items[0], nil
}
func (r *fakeVideoRepo) IncrementMetricsOnce(context.Context, string, string, map[string]int64) (bool, error) {
	return true, nil
}
func (r *fakeVideoRepo) IncrementCommentCount(context.Context, string) error {
	r.commentIncrements++
	if len(r.items) > 0 {
		r.items[0].MetricsSnapshot.CommentCount++
	}
	return nil
}
func (r *fakeVideoRepo) CreateComment(_ context.Context, payload repository.CreateVideoCommentPayload) (domain.VideoComment, bool, error) {
	if payload.ClientCommentID != "" {
		for _, comment := range r.comments {
			if comment.VideoID == payload.VideoID && comment.UserID == payload.UserID && comment.ClientCommentID == payload.ClientCommentID {
				return comment, false, nil
			}
		}
	}
	now := time.Date(2026, 5, 15, 1, 0, 0, 0, time.UTC)
	comment := domain.VideoComment{
		ID:              "id-" + payload.CommentID,
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
	r.comments = append(r.comments, comment)
	return comment, true, nil
}
func (r *fakeVideoRepo) ListComments(context.Context, string, domain.ListVideoCommentsQuery) ([]domain.VideoComment, int64, error) {
	return r.comments, int64(len(r.comments)), nil
}

func stringPtr(value string) *string {
	return &value
}
