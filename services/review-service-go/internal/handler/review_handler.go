package handler

import (
	"net/http"
	"strconv"
	"strings"

	"review-service-go/internal/auth"
	"review-service-go/internal/domain"
	"review-service-go/internal/httpx"
	"review-service-go/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"
)

type ReviewHandler struct {
	reviewService service.ReviewService
	validate      *validator.Validate
}

func NewReviewHandler(reviewService service.ReviewService) *ReviewHandler {
	return &ReviewHandler{
		reviewService: reviewService,
		validate:      validator.New(validator.WithRequiredStructEnabled()),
	}
}

type createReviewRequest struct {
	OrderID   string   `json:"orderId" validate:"required,uuid"`
	ProductID string   `json:"productId" validate:"required,uuid"`
	SellerID  string   `json:"sellerId" validate:"required,uuid"`
	Rating    int      `json:"rating" validate:"required,min=1,max=5"`
	Title     *string  `json:"title" validate:"omitempty,max=120"`
	Content   string   `json:"content" validate:"required,max=2000"`
	Images    []string `json:"images" validate:"omitempty,max=10,dive,max=500"`
}

type updateReviewRequest struct {
	Rating  *int      `json:"rating" validate:"omitempty,min=1,max=5"`
	Title   *string   `json:"title" validate:"omitempty,max=120"`
	Content *string   `json:"content" validate:"omitempty,max=2000"`
	Images  *[]string `json:"images" validate:"omitempty,max=10,dive,max=500"`
}

type moderateReviewRequest struct {
	Status domain.ReviewStatus `json:"status" validate:"required,oneof=PUBLISHED HIDDEN REJECTED DELETED"`
	Reason *string             `json:"reason" validate:"omitempty,max=500"`
}

type replyReviewRequest struct {
	Content string `json:"content" validate:"required,max=1000"`
}

type listReviewsRequest struct {
	Page      int                  `validate:"omitempty,min=1"`
	PageSize  int                  `validate:"omitempty,min=1,max=100"`
	ProductID *string              `validate:"omitempty,uuid"`
	SellerID  *string              `validate:"omitempty,uuid"`
	BuyerID   *string              `validate:"omitempty,uuid"`
	Rating    *int                 `validate:"omitempty,min=1,max=5"`
	Status    *domain.ReviewStatus `validate:"omitempty,oneof=PUBLISHED HIDDEN REJECTED DELETED"`
	Search    *string              `validate:"omitempty"`
	SortBy    domain.ReviewSortBy  `validate:"omitempty,oneof=createdAt updatedAt rating"`
	SortOrder domain.SortOrder     `validate:"omitempty,oneof=ASC DESC"`
}

func (h *ReviewHandler) CreateReview(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	var req createReviewRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Invalid request body", err.Error())
		return
	}
	if err := h.validate.Struct(req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", validationDetails(err))
		return
	}

	res, err := h.reviewService.CreateReview(r.Context(), user, domain.CreateReviewInput{
		OrderID:   req.OrderID,
		ProductID: req.ProductID,
		SellerID:  req.SellerID,
		Rating:    req.Rating,
		Title:     req.Title,
		Content:   req.Content,
		Images:    req.Images,
	})
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusCreated, res)
}

func (h *ReviewHandler) ListReviews(w http.ResponseWriter, r *http.Request) {
	query, err := h.parseListQuery(r)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}

	var user *domain.UserContext
	if u, ok := auth.UserFromContext(r.Context()); ok {
		user = &u
	}

	res, svcErr := h.reviewService.ListReviews(r.Context(), user, query)
	if svcErr != nil {
		httpx.WriteAppError(w, r, svcErr)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, res)
}

func (h *ReviewHandler) GetReviewByID(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "id is required", nil)
		return
	}

	var user *domain.UserContext
	if u, ok := auth.UserFromContext(r.Context()); ok {
		user = &u
	}

	res, err := h.reviewService.GetReviewByID(r.Context(), user, id)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, res)
}

func (h *ReviewHandler) UpdateReview(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "id is required", nil)
		return
	}

	var req updateReviewRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Invalid request body", err.Error())
		return
	}
	if err := h.validate.Struct(req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", validationDetails(err))
		return
	}

	res, err := h.reviewService.UpdateReview(r.Context(), user, id, domain.UpdateReviewInput{
		Rating:  req.Rating,
		Title:   req.Title,
		Content: req.Content,
		Images:  req.Images,
	})
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, res)
}

func (h *ReviewHandler) DeleteReview(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "id is required", nil)
		return
	}

	res, err := h.reviewService.DeleteReview(r.Context(), user, id)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, res)
}

func (h *ReviewHandler) ModerateReview(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "id is required", nil)
		return
	}

	var req moderateReviewRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Invalid request body", err.Error())
		return
	}
	if err := h.validate.Struct(req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", validationDetails(err))
		return
	}

	res, err := h.reviewService.ModerateReview(r.Context(), user, id, domain.ModerateReviewInput{
		Status: req.Status,
		Reason: req.Reason,
	})
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, res)
}

func (h *ReviewHandler) ReplyReview(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "id is required", nil)
		return
	}

	var req replyReviewRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Invalid request body", err.Error())
		return
	}
	if err := h.validate.Struct(req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", validationDetails(err))
		return
	}

	res, err := h.reviewService.ReplyReview(r.Context(), user, id, domain.ReplyReviewInput{Content: req.Content})
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusCreated, res)
}

func (h *ReviewHandler) GetProductSummary(w http.ResponseWriter, r *http.Request) {
	productID := strings.TrimSpace(chi.URLParam(r, "productId"))
	if productID == "" {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "productId is required", nil)
		return
	}

	summary, err := h.reviewService.GetProductSummary(r.Context(), productID)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, summary)
}

func (h *ReviewHandler) parseListQuery(r *http.Request) (domain.ListReviewsQuery, error) {
	q := r.URL.Query()

	parsed := listReviewsRequest{
		Page:      1,
		PageSize:  20,
		SortBy:    domain.ReviewSortByCreatedAt,
		SortOrder: domain.SortOrderDESC,
	}

	if raw := strings.TrimSpace(q.Get("page")); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil {
			return domain.ListReviewsQuery{}, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "page must be an integer", nil)
		}
		parsed.Page = value
	}
	if raw := strings.TrimSpace(q.Get("pageSize")); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil {
			return domain.ListReviewsQuery{}, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "pageSize must be an integer", nil)
		}
		parsed.PageSize = value
	}
	if raw := strings.TrimSpace(q.Get("rating")); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil {
			return domain.ListReviewsQuery{}, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "rating must be an integer", nil)
		}
		parsed.Rating = &value
	}

	if v := maybeStringPtr(q.Get("productId")); v != nil {
		parsed.ProductID = v
	}
	if v := maybeStringPtr(q.Get("sellerId")); v != nil {
		parsed.SellerID = v
	}
	if v := maybeStringPtr(q.Get("buyerId")); v != nil {
		parsed.BuyerID = v
	}
	if v := maybeStringPtr(q.Get("search")); v != nil {
		parsed.Search = v
	}
	if v := maybeStringPtr(q.Get("status")); v != nil {
		status := domain.ReviewStatus(strings.ToUpper(*v))
		parsed.Status = &status
	}
	if v := maybeStringPtr(q.Get("sortBy")); v != nil {
		parsed.SortBy = domain.ReviewSortBy(*v)
	}
	if v := maybeStringPtr(q.Get("sortOrder")); v != nil {
		parsed.SortOrder = domain.SortOrder(strings.ToUpper(*v))
	}

	if err := h.validate.Struct(parsed); err != nil {
		return domain.ListReviewsQuery{}, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", validationDetails(err))
	}

	return domain.ListReviewsQuery{
		Page:      parsed.Page,
		PageSize:  parsed.PageSize,
		ProductID: parsed.ProductID,
		SellerID:  parsed.SellerID,
		BuyerID:   parsed.BuyerID,
		Rating:    parsed.Rating,
		Status:    parsed.Status,
		Search:    parsed.Search,
		SortBy:    parsed.SortBy,
		SortOrder: parsed.SortOrder,
	}, nil
}

func maybeStringPtr(v string) *string {
	trimmed := strings.TrimSpace(v)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func validationDetails(err error) []string {
	validationErrs, ok := err.(validator.ValidationErrors)
	if !ok {
		return []string{err.Error()}
	}

	details := make([]string, 0, len(validationErrs))
	for _, v := range validationErrs {
		details = append(details, v.Field()+" failed on "+v.Tag())
	}
	return details
}
