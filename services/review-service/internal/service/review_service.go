package service

import (
	"context"
	"net/http"
	"strings"
	"time"

	"review-service-go/internal/domain"
	"review-service-go/internal/httpx"
	"review-service-go/internal/repository"

	"go.mongodb.org/mongo-driver/mongo"
)

var moderatorRoles = map[domain.Role]struct{}{
	domain.RoleAdmin:      {},
	domain.RoleSupport:    {},
	domain.RoleSuperAdmin: {},
}

var replyRoles = map[domain.Role]struct{}{
	domain.RoleSeller:     {},
	domain.RoleAdmin:      {},
	domain.RoleSupport:    {},
	domain.RoleSuperAdmin: {},
}

type ReviewService interface {
	CreateReview(ctx context.Context, user domain.UserContext, input domain.CreateReviewInput) (ReviewResponse, error)
	ListReviews(ctx context.Context, user *domain.UserContext, query domain.ListReviewsQuery) (ListReviewsResponse, error)
	GetReviewByID(ctx context.Context, user *domain.UserContext, reviewID string) (ReviewResponse, error)
	UpdateReview(ctx context.Context, user domain.UserContext, reviewID string, input domain.UpdateReviewInput) (ReviewResponse, error)
	DeleteReview(ctx context.Context, user domain.UserContext, reviewID string) (ReviewResponse, error)
	ModerateReview(ctx context.Context, user domain.UserContext, reviewID string, input domain.ModerateReviewInput) (ReviewResponse, error)
	ReplyReview(ctx context.Context, user domain.UserContext, reviewID string, input domain.ReplyReviewInput) (ReviewResponse, error)
	GetProductSummary(ctx context.Context, productID string) (domain.ProductSummary, error)
}

type reviewService struct {
	repo repository.ReviewRepository
}

func NewReviewService(repo repository.ReviewRepository) ReviewService {
	return &reviewService{repo: repo}
}

func (s *reviewService) CreateReview(ctx context.Context, user domain.UserContext, input domain.CreateReviewInput) (ReviewResponse, error) {
	if user.Role != domain.RoleCustomer {
		return ReviewResponse{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}

	existing, err := s.repo.FindActiveDuplicate(ctx, input.OrderID, input.ProductID, user.UserID)
	if err != nil {
		return ReviewResponse{}, err
	}
	if existing != nil {
		return ReviewResponse{}, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeReviewAlreadyExists, "Review already exists for this order and product", nil)
	}

	title := normalizeCreateTitle(input.Title)
	content := strings.TrimSpace(input.Content)

	review, err := s.repo.Create(ctx, repository.CreateReviewPayload{
		OrderID:   input.OrderID,
		ProductID: input.ProductID,
		SellerID:  input.SellerID,
		BuyerID:   user.UserID,
		Rating:    input.Rating,
		Title:     title,
		Content:   content,
		Images:    nonNilStringSlice(input.Images),
		Status:    domain.ReviewStatusPublished,
	})
	if err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return ReviewResponse{}, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeReviewAlreadyExists, "Review already exists for this order and product", nil)
		}
		return ReviewResponse{}, err
	}

	return toReviewResponse(review), nil
}

func (s *reviewService) ListReviews(ctx context.Context, user *domain.UserContext, query domain.ListReviewsQuery) (ListReviewsResponse, error) {
	if err := assertBuyerFilterPermission(user, query); err != nil {
		return ListReviewsResponse{}, err
	}

	status, err := resolveStatusFilter(user, query)
	if err != nil {
		return ListReviewsResponse{}, err
	}
	query.Status = status

	items, totalItems, err := s.repo.List(ctx, query)
	if err != nil {
		return ListReviewsResponse{}, err
	}

	responses := make([]ReviewResponse, 0, len(items))
	for _, item := range items {
		responses = append(responses, toReviewResponse(item))
	}

	totalPages := int64(1)
	if query.PageSize > 0 {
		totalPages = (totalItems + int64(query.PageSize) - 1) / int64(query.PageSize)
		if totalPages < 1 {
			totalPages = 1
		}
	}

	return ListReviewsResponse{
		Items: responses,
		Pagination: Pagination{
			Page:       query.Page,
			PageSize:   query.PageSize,
			TotalItems: totalItems,
			TotalPages: totalPages,
		},
	}, nil
}

func (s *reviewService) GetReviewByID(ctx context.Context, user *domain.UserContext, reviewID string) (ReviewResponse, error) {
	review, err := s.repo.FindByID(ctx, reviewID)
	if err != nil {
		return ReviewResponse{}, err
	}
	if review == nil || review.Status == domain.ReviewStatusDeleted {
		return ReviewResponse{}, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeReviewNotFound, "Review not found", nil)
	}

	if !canViewReview(user, *review) {
		return ReviewResponse{}, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeReviewNotFound, "Review not found", nil)
	}

	return toReviewResponse(*review), nil
}

func (s *reviewService) UpdateReview(ctx context.Context, user domain.UserContext, reviewID string, input domain.UpdateReviewInput) (ReviewResponse, error) {
	if user.Role != domain.RoleCustomer {
		return ReviewResponse{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}

	review, err := s.repo.FindByID(ctx, reviewID)
	if err != nil {
		return ReviewResponse{}, err
	}
	if review == nil || review.Status == domain.ReviewStatusDeleted {
		return ReviewResponse{}, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeReviewNotFound, "Review not found", nil)
	}
	if review.BuyerID != user.UserID {
		return ReviewResponse{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "You can only update your own review", nil)
	}

	rating := review.Rating
	if input.Rating != nil {
		rating = *input.Rating
	}
	title := review.Title
	if input.Title != nil {
		t := strings.TrimSpace(*input.Title)
		title = &t
	}
	content := review.Content
	if input.Content != nil {
		content = strings.TrimSpace(*input.Content)
	}
	images := review.Images
	if input.Images != nil {
		images = *input.Images
	}

	updated, err := s.repo.UpdateByID(ctx, reviewID, repository.UpdateReviewPayload{
		Rating:  &rating,
		Title:   title,
		Content: &content,
		Images:  &images,
	})
	if err != nil {
		return ReviewResponse{}, err
	}
	if updated == nil || updated.Status == domain.ReviewStatusDeleted {
		return ReviewResponse{}, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeReviewNotFound, "Review not found", nil)
	}

	return toReviewResponse(*updated), nil
}

func (s *reviewService) DeleteReview(ctx context.Context, user domain.UserContext, reviewID string) (ReviewResponse, error) {
	if user.Role != domain.RoleCustomer {
		return ReviewResponse{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}

	review, err := s.repo.FindByID(ctx, reviewID)
	if err != nil {
		return ReviewResponse{}, err
	}
	if review == nil || review.Status == domain.ReviewStatusDeleted {
		return ReviewResponse{}, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeReviewNotFound, "Review not found", nil)
	}
	if review.BuyerID != user.UserID {
		return ReviewResponse{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "You can only delete your own review", nil)
	}

	status := domain.ReviewStatusDeleted
	now := time.Now().UTC()
	updated, err := s.repo.UpdateByID(ctx, reviewID, repository.UpdateReviewPayload{
		Status:    &status,
		DeletedAt: &now,
	})
	if err != nil {
		return ReviewResponse{}, err
	}
	if updated == nil {
		return ReviewResponse{}, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeReviewNotFound, "Review not found", nil)
	}

	return toReviewResponse(*updated), nil
}

func (s *reviewService) ModerateReview(ctx context.Context, user domain.UserContext, reviewID string, input domain.ModerateReviewInput) (ReviewResponse, error) {
	if _, ok := moderatorRoles[user.Role]; !ok {
		return ReviewResponse{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}
	if input.Status == domain.ReviewStatusDeleted {
		return ReviewResponse{}, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "Moderation status cannot be DELETED", nil)
	}
	if (input.Status == domain.ReviewStatusHidden || input.Status == domain.ReviewStatusRejected) && (input.Reason == nil || strings.TrimSpace(*input.Reason) == "") {
		return ReviewResponse{}, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeReviewModerationReasonRequire, "Moderation reason is required for HIDDEN or REJECTED status", nil)
	}

	review, err := s.repo.FindByID(ctx, reviewID)
	if err != nil {
		return ReviewResponse{}, err
	}
	if review == nil || review.Status == domain.ReviewStatusDeleted {
		return ReviewResponse{}, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeReviewNotFound, "Review not found", nil)
	}

	reason := trimStringPtr(input.Reason)
	actorID := user.UserID
	now := time.Now().UTC()
	updated, err := s.repo.UpdateByID(ctx, reviewID, repository.UpdateReviewPayload{
		Status:           &input.Status,
		ModerationReason: reason,
		ModeratedBy:      &actorID,
		ModeratedAt:      &now,
	})
	if err != nil {
		return ReviewResponse{}, err
	}
	if updated == nil || updated.Status == domain.ReviewStatusDeleted {
		return ReviewResponse{}, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeReviewNotFound, "Review not found", nil)
	}

	return toReviewResponse(*updated), nil
}

func (s *reviewService) ReplyReview(ctx context.Context, user domain.UserContext, reviewID string, input domain.ReplyReviewInput) (ReviewResponse, error) {
	if _, ok := replyRoles[user.Role]; !ok {
		return ReviewResponse{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}

	review, err := s.repo.FindByID(ctx, reviewID)
	if err != nil {
		return ReviewResponse{}, err
	}
	if review == nil || review.Status == domain.ReviewStatusDeleted {
		return ReviewResponse{}, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeReviewNotFound, "Review not found", nil)
	}
	if user.Role == domain.RoleSeller && review.SellerID != user.UserID {
		return ReviewResponse{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Seller can only reply to own product reviews", nil)
	}

	reply := &domain.ReviewReply{
		Content:   strings.TrimSpace(input.Content),
		RepliedBy: user.UserID,
		RepliedAt: time.Now().UTC(),
	}

	updated, err := s.repo.UpdateByID(ctx, reviewID, repository.UpdateReviewPayload{Reply: reply})
	if err != nil {
		return ReviewResponse{}, err
	}
	if updated == nil || updated.Status == domain.ReviewStatusDeleted {
		return ReviewResponse{}, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeReviewNotFound, "Review not found", nil)
	}

	return toReviewResponse(*updated), nil
}

func (s *reviewService) GetProductSummary(ctx context.Context, productID string) (domain.ProductSummary, error) {
	return s.repo.GetProductSummary(ctx, productID)
}

func resolveStatusFilter(user *domain.UserContext, query domain.ListReviewsQuery) (*domain.ReviewStatus, error) {
	if user == nil {
		published := domain.ReviewStatusPublished
		return &published, nil
	}

	if isModerator(user.Role) {
		return query.Status, nil
	}

	if user.Role == domain.RoleCustomer && query.BuyerID != nil && *query.BuyerID == user.UserID {
		return query.Status, nil
	}

	if query.Status != nil && *query.Status != domain.ReviewStatusPublished {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role to query this review status", nil)
	}

	published := domain.ReviewStatusPublished
	return &published, nil
}

func assertBuyerFilterPermission(user *domain.UserContext, query domain.ListReviewsQuery) error {
	if query.BuyerID == nil {
		return nil
	}
	if user == nil {
		return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Authentication required for buyer filter", nil)
	}
	if isModerator(user.Role) {
		return nil
	}
	if user.Role == domain.RoleCustomer && *query.BuyerID == user.UserID {
		return nil
	}
	return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role to filter by buyerId", nil)
}

func canViewReview(user *domain.UserContext, review domain.Review) bool {
	if review.Status == domain.ReviewStatusPublished {
		return true
	}
	if review.Status == domain.ReviewStatusDeleted {
		return false
	}
	if user == nil {
		return false
	}
	if isModerator(user.Role) {
		return true
	}
	if user.Role == domain.RoleCustomer && review.BuyerID == user.UserID {
		return true
	}
	if user.Role == domain.RoleSeller && review.SellerID == user.UserID {
		return true
	}
	return false
}

func isModerator(role domain.Role) bool {
	_, ok := moderatorRoles[role]
	return ok
}

func normalizeCreateTitle(title *string) *string {
	if title == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*title)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func trimStringPtr(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	return &trimmed
}

func nonNilStringSlice(items []string) []string {
	if items == nil {
		return []string{}
	}
	return items
}
