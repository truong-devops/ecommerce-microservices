package handler

import (
	"net/http"
	"strings"

	"product-service/internal/auth"
	"product-service/internal/domain"
	"product-service/internal/httpx"
	"product-service/internal/service"

	"github.com/go-chi/chi/v5"
)

type VideoHandler struct {
	service *service.VideoService
}

func NewVideoHandler(s *service.VideoService) *VideoHandler {
	return &VideoHandler{service: s}
}

func (h *VideoHandler) ListFeed(w http.ResponseWriter, r *http.Request) {
	query, err := parseVideoQuery(r)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	result, err := h.service.ListFeed(r.Context(), query)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WritePaginated(w, r, http.StatusOK, result.Items, result.Pagination)
}

func (h *VideoHandler) CreateVideo(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	var input service.CreateVideoInput
	if err := httpx.DecodeJSONStrict(r, &input); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Invalid JSON body", nil)
		return
	}
	response, err := h.service.CreateVideo(r.Context(), user, input)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusCreated, response)
}

func (h *VideoHandler) ListManagedVideos(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	query, err := parseVideoQuery(r)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	result, err := h.service.ListManagedVideos(r.Context(), user, query)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WritePaginated(w, r, http.StatusOK, result.Items, result.Pagination)
}

func (h *VideoHandler) GetPublicVideo(w http.ResponseWriter, r *http.Request) {
	response, err := h.service.GetPublicVideo(r.Context(), chi.URLParam(r, "videoId"))
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, response)
}

func (h *VideoHandler) ListComments(w http.ResponseWriter, r *http.Request) {
	query, err := parseVideoCommentsQuery(r)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	result, err := h.service.ListComments(r.Context(), chi.URLParam(r, "videoId"), query)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WritePaginated(w, r, http.StatusOK, result.Items, result.Pagination)
}

func (h *VideoHandler) CreateComment(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	var input service.CreateVideoCommentInput
	if err := httpx.DecodeJSONStrict(r, &input); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Invalid JSON body", nil)
		return
	}
	response, err := h.service.CreateComment(r.Context(), user, chi.URLParam(r, "videoId"), input)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusCreated, response)
}

func (h *VideoHandler) UpdateVideo(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	var input service.UpdateVideoInput
	if err := httpx.DecodeJSONStrict(r, &input); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Invalid JSON body", nil)
		return
	}
	response, err := h.service.UpdateVideo(r.Context(), user, chi.URLParam(r, "videoId"), input)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, response)
}

func (h *VideoHandler) ConfirmMedia(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	var input service.ConfirmVideoMediaInput
	if err := httpx.DecodeJSONStrict(r, &input); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Invalid JSON body", nil)
		return
	}
	response, err := h.service.ConfirmMedia(r.Context(), user, chi.URLParam(r, "videoId"), input)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusCreated, response)
}

func (h *VideoHandler) ConfirmThumbnail(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	var input service.ConfirmVideoThumbnailInput
	if err := httpx.DecodeJSONStrict(r, &input); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Invalid JSON body", nil)
		return
	}
	response, err := h.service.ConfirmThumbnail(r.Context(), user, chi.URLParam(r, "videoId"), input)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusCreated, response)
}

func (h *VideoHandler) SubmitReview(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	response, err := h.service.SubmitReview(r.Context(), user, chi.URLParam(r, "videoId"))
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusCreated, response)
}

func (h *VideoHandler) PublishVideo(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	response, err := h.service.PublishVideo(r.Context(), user, chi.URLParam(r, "videoId"))
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusCreated, response)
}

func (h *VideoHandler) UnpublishVideo(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	response, err := h.service.UnpublishVideo(r.Context(), user, chi.URLParam(r, "videoId"))
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusCreated, response)
}

func (h *VideoHandler) ArchiveVideo(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	response, err := h.service.ArchiveVideo(r.Context(), user, chi.URLParam(r, "videoId"))
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, response)
}

func (h *VideoHandler) TrackViewStarted(w http.ResponseWriter, r *http.Request) {
	h.trackEvent(w, r, "view-started")
}

func (h *VideoHandler) TrackViewQualified(w http.ResponseWriter, r *http.Request) {
	h.trackEvent(w, r, "view-qualified")
}

func (h *VideoHandler) TrackProductClicked(w http.ResponseWriter, r *http.Request) {
	h.trackEvent(w, r, "product-clicked")
}

func (h *VideoHandler) TrackAddToCart(w http.ResponseWriter, r *http.Request) {
	h.trackEvent(w, r, "add-to-cart")
}

func (h *VideoHandler) trackEvent(w http.ResponseWriter, r *http.Request, eventType string) {
	var input service.TrackVideoEventInput
	if err := httpx.DecodeJSONOptionalStrict(r, &input); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Invalid JSON body", nil)
		return
	}
	response, err := h.service.TrackEvent(r.Context(), chi.URLParam(r, "videoId"), eventType, input)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusCreated, response)
}

func (h *VideoHandler) ListReviewQueue(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	query, err := parseVideoQuery(r)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	result, err := h.service.ListReviewQueue(r.Context(), user, query)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WritePaginated(w, r, http.StatusOK, result.Items, result.Pagination)
}

func (h *VideoHandler) ApproveVideo(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	response, err := h.service.ApproveVideo(r.Context(), user, chi.URLParam(r, "videoId"))
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusCreated, response)
}

func (h *VideoHandler) RejectVideo(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	var body struct {
		Reason string `json:"reason,omitempty"`
	}
	if err := httpx.DecodeJSONOptionalStrict(r, &body); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Invalid JSON body", nil)
		return
	}
	response, err := h.service.RejectVideo(r.Context(), user, chi.URLParam(r, "videoId"), body.Reason)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusCreated, response)
}

func parseVideoQuery(r *http.Request) (domain.ListProductVideosQuery, error) {
	q := r.URL.Query()
	page, err := parseIntQuery(q, "page", 1, 1, 0)
	if err != nil {
		return domain.ListProductVideosQuery{}, err
	}
	pageSize, err := parseIntQuery(q, "pageSize", 20, 1, 100)
	if err != nil {
		return domain.ListProductVideosQuery{}, err
	}
	status := domain.ProductVideoStatus(strings.TrimSpace(q.Get("status")))
	if status != "" && !isVideoStatusValue(status) {
		return domain.ListProductVideosQuery{}, badQuery("status is invalid")
	}
	search := strings.TrimSpace(q.Get("search"))
	if len(search) > 120 {
		return domain.ListProductVideosQuery{}, badQuery("search must be at most 120 characters")
	}
	return domain.ListProductVideosQuery{
		Page:      page,
		PageSize:  pageSize,
		ProductID: strings.TrimSpace(q.Get("productId")),
		SellerID:  strings.TrimSpace(q.Get("sellerId")),
		Search:    search,
		Status:    status,
	}, nil
}

func parseVideoCommentsQuery(r *http.Request) (domain.ListVideoCommentsQuery, error) {
	q := r.URL.Query()
	page, err := parseIntQuery(q, "page", 1, 1, 0)
	if err != nil {
		return domain.ListVideoCommentsQuery{}, err
	}
	pageSize, err := parseIntQuery(q, "pageSize", 20, 1, 100)
	if err != nil {
		return domain.ListVideoCommentsQuery{}, err
	}
	return domain.ListVideoCommentsQuery{Page: page, PageSize: pageSize}, nil
}
