package handler

import (
	"net/http"
	"strconv"
	"strings"

	"order-service/internal/auth"
	"order-service/internal/domain"
	"order-service/internal/httpx"
	"order-service/internal/middleware"
	"order-service/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type OrderHandler struct {
	orderService *service.OrderService
}

func NewOrderHandler(orderService *service.OrderService) *OrderHandler {
	return &OrderHandler{orderService: orderService}
}

func (h *OrderHandler) CreateOrder(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	var req service.CreateOrderRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{"body": err.Error()})
		return
	}

	result, err := h.orderService.CreateOrder(r.Context(), user, requestID(r), strings.TrimSpace(r.Header.Get("Idempotency-Key")), req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusCreated, result)
}

func (h *OrderHandler) ListOrders(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	query, err := parseListOrdersQuery(r)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeValidationFailed)
		return
	}

	result, err := h.orderService.ListOrders(r.Context(), user, query)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *OrderHandler) GetOrderByID(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	result, err := h.orderService.GetOrderByID(r.Context(), user, chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *OrderHandler) CancelOrder(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	var req service.CancelOrderRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{"body": err.Error()})
		return
	}

	result, err := h.orderService.CancelOrder(r.Context(), user, requestID(r), chi.URLParam(r, "id"), req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *OrderHandler) ConfirmReceived(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	result, err := h.orderService.ConfirmReceived(r.Context(), user, requestID(r), chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *OrderHandler) UpdateOrderStatus(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	var req service.UpdateOrderStatusRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{"body": err.Error()})
		return
	}

	result, err := h.orderService.UpdateOrderStatus(r.Context(), user, requestID(r), chi.URLParam(r, "id"), req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *OrderHandler) GetOrderStatusHistory(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	result, err := h.orderService.GetOrderStatusHistory(r.Context(), user, chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func parseListOrdersQuery(r *http.Request) (service.ListOrdersRequest, error) {
	q := r.URL.Query()

	page := 1
	if raw := strings.TrimSpace(q.Get("page")); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 1 {
			return service.ListOrdersRequest{}, validationError("page", "must be an integer >= 1")
		}
		page = v
	}

	pageSize := 20
	if raw := strings.TrimSpace(q.Get("pageSize")); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 1 || v > 100 {
			return service.ListOrdersRequest{}, validationError("pageSize", "must be an integer between 1 and 100")
		}
		pageSize = v
	}

	var status *domain.OrderStatus
	if raw := strings.TrimSpace(q.Get("status")); raw != "" {
		st := domain.OrderStatus(strings.ToUpper(raw))
		if !domain.IsValidOrderStatus(st) {
			return service.ListOrdersRequest{}, validationError("status", "invalid status")
		}
		status = &st
	}

	sortBy := strings.TrimSpace(q.Get("sortBy"))
	if sortBy == "" {
		sortBy = "createdAt"
	}
	if sortBy != "createdAt" && sortBy != "totalAmount" && sortBy != "orderNumber" {
		return service.ListOrdersRequest{}, validationError("sortBy", "invalid sortBy")
	}

	sortOrder := strings.ToUpper(strings.TrimSpace(q.Get("sortOrder")))
	if sortOrder == "" {
		sortOrder = "DESC"
	}
	if sortOrder != "ASC" && sortOrder != "DESC" {
		return service.ListOrdersRequest{}, validationError("sortOrder", "invalid sortOrder")
	}

	var userID *string
	if raw := strings.TrimSpace(q.Get("userId")); raw != "" {
		if _, err := uuid.Parse(raw); err != nil {
			return service.ListOrdersRequest{}, validationError("userId", "must be UUID")
		}
		userID = &raw
	}

	var search *string
	if raw := strings.TrimSpace(q.Get("search")); raw != "" {
		search = &raw
	}

	return service.ListOrdersRequest{
		Page:      page,
		PageSize:  pageSize,
		Status:    status,
		SortBy:    sortBy,
		SortOrder: sortOrder,
		UserID:    userID,
		Search:    search,
	}, nil
}

func validationError(field, msg string) error {
	return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{field: msg})
}

func requestID(r *http.Request) string {
	return middleware.RequestIDFromContext(r.Context())
}
