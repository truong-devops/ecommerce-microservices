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
	query, err := parseProductQuery(r)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	result, err := h.service.ListPublicProducts(r.Context(), query)
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
	query, err := parseProductQuery(r)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	result, err := h.service.ListManagedProducts(r.Context(), user, query)
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

func parseProductQuery(r *http.Request) (domain.ListProductsQuery, error) {
	q := r.URL.Query()
	page, err := parseIntQuery(q, "page", 1, 1, 0)
	if err != nil {
		return domain.ListProductsQuery{}, err
	}
	pageSize, err := parseIntQuery(q, "pageSize", 20, 1, 100)
	if err != nil {
		return domain.ListProductsQuery{}, err
	}
	status := domain.ProductStatus(strings.TrimSpace(q.Get("status")))
	if status != "" && !isProductStatusValue(status) {
		return domain.ListProductsQuery{}, badQuery("status is invalid")
	}
	sellerID := strings.TrimSpace(q.Get("sellerId"))
	if sellerID != "" && !isUUID(sellerID) {
		return domain.ListProductsQuery{}, badQuery("sellerId must be a UUID")
	}
	sortBy := strings.TrimSpace(q.Get("sortBy"))
	switch sortBy {
	case "", "createdAt", "updatedAt", "name", "minPrice":
	default:
		return domain.ListProductsQuery{}, badQuery("sortBy is invalid")
	}
	sortOrder := domain.SortOrder(strings.TrimSpace(q.Get("sortOrder")))
	if sortOrder != "" && sortOrder != domain.SortOrderAsc && sortOrder != domain.SortOrderDesc {
		return domain.ListProductsQuery{}, badQuery("sortOrder is invalid")
	}
	return domain.ListProductsQuery{
		Page:       page,
		PageSize:   pageSize,
		Search:     strings.TrimSpace(q.Get("search")),
		Status:     status,
		CategoryID: strings.TrimSpace(q.Get("categoryId")),
		Brand:      strings.TrimSpace(q.Get("brand")),
		SellerID:   sellerID,
		SortBy:     sortBy,
		SortOrder:  sortOrder,
	}, nil
}
