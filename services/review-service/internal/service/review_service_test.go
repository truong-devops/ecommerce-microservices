package service

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	"review-service-go/internal/domain"
	"review-service-go/internal/httpx"
	"review-service-go/internal/repository"
)

func TestCreateReviewRequiresCustomerRole(t *testing.T) {
	repo := &fakeReviewRepository{}
	svc := NewReviewService(repo)

	_, err := svc.CreateReview(context.Background(), domain.UserContext{
		UserID: "seller-1",
		Role:   domain.RoleSeller,
	}, domain.CreateReviewInput{})

	assertReviewAppError(t, err, http.StatusForbidden, domain.ErrorCodeForbidden)
	if repo.findDuplicateCalls != 0 {
		t.Fatalf("repository was called before role check")
	}
}

func TestCreateReviewTrimsContentAndCreatesPublishedReview(t *testing.T) {
	repo := &fakeReviewRepository{}
	svc := NewReviewService(repo)
	title := "  Great product  "

	got, err := svc.CreateReview(context.Background(), domain.UserContext{
		UserID: "buyer-1",
		Role:   domain.RoleCustomer,
	}, domain.CreateReviewInput{
		OrderID:   "order-1",
		ProductID: "product-1",
		SellerID:  "seller-1",
		Rating:    5,
		Title:     &title,
		Content:   "  Works well  ",
		Images:    nil,
	})
	if err != nil {
		t.Fatalf("CreateReview returned error: %v", err)
	}

	if repo.createdPayload == nil {
		t.Fatal("repository Create was not called")
	}
	if repo.createdPayload.BuyerID != "buyer-1" {
		t.Fatalf("buyer id = %q, want buyer-1", repo.createdPayload.BuyerID)
	}
	if repo.createdPayload.Title == nil || *repo.createdPayload.Title != "Great product" {
		t.Fatalf("title was not trimmed: %#v", repo.createdPayload.Title)
	}
	if repo.createdPayload.Content != "Works well" {
		t.Fatalf("content was not trimmed: %q", repo.createdPayload.Content)
	}
	if repo.createdPayload.Images == nil || len(repo.createdPayload.Images) != 0 {
		t.Fatalf("images should be a non-nil empty slice: %#v", repo.createdPayload.Images)
	}
	if repo.createdPayload.Status != domain.ReviewStatusPublished {
		t.Fatalf("status = %q, want %q", repo.createdPayload.Status, domain.ReviewStatusPublished)
	}
	if got.Status != domain.ReviewStatusPublished || got.Title == nil || *got.Title != "Great product" {
		t.Fatalf("unexpected response: %#v", got)
	}
}

func TestCreateReviewRejectsActiveDuplicate(t *testing.T) {
	repo := &fakeReviewRepository{
		activeDuplicate: &domain.Review{ID: "review-1"},
	}
	svc := NewReviewService(repo)

	_, err := svc.CreateReview(context.Background(), domain.UserContext{
		UserID: "buyer-1",
		Role:   domain.RoleCustomer,
	}, domain.CreateReviewInput{
		OrderID:   "order-1",
		ProductID: "product-1",
		SellerID:  "seller-1",
		Rating:    4,
		Content:   "Good",
	})

	assertReviewAppError(t, err, http.StatusConflict, domain.ErrorCodeReviewAlreadyExists)
	if repo.createCalls != 0 {
		t.Fatalf("Create should not be called after duplicate is found")
	}
}

func TestListReviewsAppliesStatusVisibilityRules(t *testing.T) {
	t.Run("anonymous user sees published reviews only", func(t *testing.T) {
		repo := &fakeReviewRepository{}
		svc := NewReviewService(repo)

		_, err := svc.ListReviews(context.Background(), nil, domain.ListReviewsQuery{
			Page:     1,
			PageSize: 20,
		})
		if err != nil {
			t.Fatalf("ListReviews returned error: %v", err)
		}
		if repo.listQuery == nil || repo.listQuery.Status == nil || *repo.listQuery.Status != domain.ReviewStatusPublished {
			t.Fatalf("anonymous status filter = %#v, want PUBLISHED", repo.listQuery)
		}
	})

	t.Run("customer cannot filter another buyer", func(t *testing.T) {
		repo := &fakeReviewRepository{}
		svc := NewReviewService(repo)
		otherBuyerID := "buyer-2"

		_, err := svc.ListReviews(context.Background(), &domain.UserContext{
			UserID: "buyer-1",
			Role:   domain.RoleCustomer,
		}, domain.ListReviewsQuery{BuyerID: &otherBuyerID})

		assertReviewAppError(t, err, http.StatusForbidden, domain.ErrorCodeForbidden)
		if repo.listCalls != 0 {
			t.Fatalf("List should not be called when buyer filter is forbidden")
		}
	})

	t.Run("moderator can request hidden status", func(t *testing.T) {
		repo := &fakeReviewRepository{}
		svc := NewReviewService(repo)
		hidden := domain.ReviewStatusHidden

		_, err := svc.ListReviews(context.Background(), &domain.UserContext{
			UserID: "admin-1",
			Role:   domain.RoleAdmin,
		}, domain.ListReviewsQuery{Status: &hidden})
		if err != nil {
			t.Fatalf("ListReviews returned error: %v", err)
		}
		if repo.listQuery == nil || repo.listQuery.Status == nil || *repo.listQuery.Status != domain.ReviewStatusHidden {
			t.Fatalf("moderator status filter = %#v, want HIDDEN", repo.listQuery)
		}
	})
}

func TestModerateReviewRequiresReasonForHiddenOrRejected(t *testing.T) {
	repo := &fakeReviewRepository{}
	svc := NewReviewService(repo)

	_, err := svc.ModerateReview(context.Background(), domain.UserContext{
		UserID: "admin-1",
		Role:   domain.RoleAdmin,
	}, "review-1", domain.ModerateReviewInput{
		Status: domain.ReviewStatusHidden,
	})

	assertReviewAppError(t, err, http.StatusUnprocessableEntity, domain.ErrorCodeReviewModerationReasonRequire)
	if repo.findByIDCalls != 0 {
		t.Fatalf("repository should not be called before moderation reason validation")
	}
}

func TestReplyReviewSellerCanOnlyReplyToOwnProductReviews(t *testing.T) {
	repo := &fakeReviewRepository{
		reviewByID: &domain.Review{
			ID:        "review-1",
			SellerID:  "seller-2",
			BuyerID:   "buyer-1",
			Status:    domain.ReviewStatusPublished,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		},
	}
	svc := NewReviewService(repo)

	_, err := svc.ReplyReview(context.Background(), domain.UserContext{
		UserID: "seller-1",
		Role:   domain.RoleSeller,
	}, "review-1", domain.ReplyReviewInput{Content: " Thanks "})

	assertReviewAppError(t, err, http.StatusForbidden, domain.ErrorCodeForbidden)
	if repo.updateCalls != 0 {
		t.Fatalf("Update should not be called for another seller's review")
	}
}

type fakeReviewRepository struct {
	activeDuplicate *domain.Review
	reviewByID      *domain.Review
	listItems       []domain.Review
	listTotal       int64
	summary         domain.ProductSummary

	createdPayload *repository.CreateReviewPayload
	listQuery      *domain.ListReviewsQuery

	findDuplicateCalls int
	findByIDCalls      int
	createCalls        int
	listCalls          int
	updateCalls        int
}

func (f *fakeReviewRepository) EnsureIndexes(context.Context) error {
	return nil
}

func (f *fakeReviewRepository) Create(_ context.Context, payload repository.CreateReviewPayload) (domain.Review, error) {
	f.createCalls++
	f.createdPayload = &payload
	now := time.Now().UTC()
	return domain.Review{
		ID:        "created-review",
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
	}, nil
}

func (f *fakeReviewRepository) FindByID(_ context.Context, _ string) (*domain.Review, error) {
	f.findByIDCalls++
	return f.reviewByID, nil
}

func (f *fakeReviewRepository) FindActiveDuplicate(_ context.Context, _, _, _ string) (*domain.Review, error) {
	f.findDuplicateCalls++
	return f.activeDuplicate, nil
}

func (f *fakeReviewRepository) UpdateByID(_ context.Context, _ string, _ repository.UpdateReviewPayload) (*domain.Review, error) {
	f.updateCalls++
	return f.reviewByID, nil
}

func (f *fakeReviewRepository) List(_ context.Context, query domain.ListReviewsQuery) ([]domain.Review, int64, error) {
	f.listCalls++
	f.listQuery = &query
	return f.listItems, f.listTotal, nil
}

func (f *fakeReviewRepository) GetProductSummary(context.Context, string) (domain.ProductSummary, error) {
	return f.summary, nil
}

func assertReviewAppError(t *testing.T, err error, status int, code string) {
	t.Helper()

	var appErr *httpx.AppError
	if !errors.As(err, &appErr) {
		t.Fatalf("error = %T %v, want *httpx.AppError", err, err)
	}
	if appErr.Status != status {
		t.Fatalf("status = %d, want %d", appErr.Status, status)
	}
	if appErr.Code != code {
		t.Fatalf("code = %q, want %q", appErr.Code, code)
	}
}
