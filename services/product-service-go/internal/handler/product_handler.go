package handler

import (
	"net/http"
	"strconv"
	"strings"

	"product-service-go/internal/auth"
	"product-service-go/internal/domain"
	"product-service-go/internal/httpx"
	"product-service-go/internal/service"

	"github.com/go-chi/chi/v5"
)

type ProductHandler struct {
	service *service.ProductService
}

func NewProductHandler(s *service.ProductService) *ProductHandler {
	return &ProductHandler{service: s}
}

func (h *ProductHandler) CreateProduct(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	var input service.CreateProductInput
	if err := httpx.DecodeJSONStrict(r, &input); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Invalid JSON body", nil)
		return
	}
	response, err := h.service.CreateProduct(r.Context(), r, user, input)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusCreated, response)
}

func (h *ProductHandler) ListPublicProducts(w http.ResponseWriter, r *http.Request) {
	result, err := h.service.ListPublicProducts(r.Context(), parseProductQuery(r))
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WritePaginated(w, r, http.StatusOK, result.Items, result.Pagination)
}

func (h *ProductHandler) ListManagedProducts(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	result, err := h.service.ListManagedProducts(r.Context(), user, parseProductQuery(r))
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WritePaginated(w, r, http.StatusOK, result.Items, result.Pagination)
}

func (h *ProductHandler) GetPublicProduct(w http.ResponseWriter, r *http.Request) {
	response, err := h.service.GetPublicProductByID(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, response)
}

func (h *ProductHandler) UpdateProduct(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	var input service.UpdateProductInput
	if err := httpx.DecodeJSONStrict(r, &input); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Invalid JSON body", nil)
		return
	}
	response, err := h.service.UpdateProduct(r.Context(), r, user, chi.URLParam(r, "id"), input)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, response)
}

func (h *ProductHandler) UpdateProductStatus(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	var input service.UpdateProductStatusInput
	if err := httpx.DecodeJSONStrict(r, &input); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Invalid JSON body", nil)
		return
	}
	response, err := h.service.UpdateProductStatus(r.Context(), r, user, chi.URLParam(r, "id"), input)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, response)
}

func (h *ProductHandler) DeleteProduct(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	response, err := h.service.DeleteProduct(r.Context(), r, user, chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, response)
}

func parseProductQuery(r *http.Request) domain.ListProductsQuery {
	q := r.URL.Query()
	return domain.ListProductsQuery{
		Page:       parseInt(q.Get("page"), 1),
		PageSize:   parseInt(q.Get("pageSize"), 20),
		Search:     strings.TrimSpace(q.Get("search")),
		Status:     domain.ProductStatus(strings.TrimSpace(q.Get("status"))),
		CategoryID: strings.TrimSpace(q.Get("categoryId")),
		Brand:      strings.TrimSpace(q.Get("brand")),
		SellerID:   strings.TrimSpace(q.Get("sellerId")),
		SortBy:     strings.TrimSpace(q.Get("sortBy")),
		SortOrder:  domain.SortOrder(strings.TrimSpace(q.Get("sortOrder"))),
	}
}

func parseInt(value string, fallback int) int {
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
