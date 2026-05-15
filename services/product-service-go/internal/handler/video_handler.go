package handler

import (
	"net/http"
	"strings"

	"product-service-go/internal/domain"
	"product-service-go/internal/httpx"
	"product-service-go/internal/service"

	"github.com/go-chi/chi/v5"
)

type VideoHandler struct {
	service *service.VideoService
}

func NewVideoHandler(s *service.VideoService) *VideoHandler {
	return &VideoHandler{service: s}
}

func (h *VideoHandler) ListFeed(w http.ResponseWriter, r *http.Request) {
	result, err := h.service.ListFeed(r.Context(), parseVideoQuery(r))
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

func parseVideoQuery(r *http.Request) domain.ListProductVideosQuery {
	q := r.URL.Query()
	return domain.ListProductVideosQuery{
		Page:      parseInt(q.Get("page"), 1),
		PageSize:  parseInt(q.Get("pageSize"), 20),
		ProductID: strings.TrimSpace(q.Get("productId")),
		SellerID:  strings.TrimSpace(q.Get("sellerId")),
		Search:    strings.TrimSpace(q.Get("search")),
		Status:    domain.ProductVideoStatus(strings.TrimSpace(q.Get("status"))),
	}
}
