package handler

import (
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"shipping-service/internal/auth"
	"shipping-service/internal/domain"
	"shipping-service/internal/httpx"
	"shipping-service/internal/middleware"
	"shipping-service/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type ShippingHandler struct {
	service *service.ShippingService
}

var unknownFieldRegex = regexp.MustCompile(`unknown field "([^"]+)"`)

func NewShippingHandler(s *service.ShippingService) *ShippingHandler {
	return &ShippingHandler{service: s}
}

func (h *ShippingHandler) CreateShipment(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	var req service.CreateShipmentRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		writeDecodeValidationError(w, r, err)
		return
	}

	result, err := h.service.CreateShipment(r.Context(), user, requestID(r), req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusCreated, result)
}

func (h *ShippingHandler) ListShipments(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	query, err := parseListQuery(r)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeBadRequest)
		return
	}

	result, err := h.service.ListShipments(r.Context(), user, query)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *ShippingHandler) GetShipmentByOrderID(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	orderID := chi.URLParam(r, "orderId")
	if _, parseErr := uuid.Parse(orderID); parseErr != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed (uuid is expected)", nil)
		return
	}
	result, err := h.service.GetShipmentByOrderID(r.Context(), user, orderID)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *ShippingHandler) GetShipmentByID(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	result, err := h.service.GetShipmentByID(r.Context(), user, chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *ShippingHandler) UpdateShipmentStatus(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	var req service.UpdateShipmentStatusRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		writeDecodeValidationError(w, r, err)
		return
	}

	result, err := h.service.UpdateShipmentStatus(r.Context(), user, requestID(r), chi.URLParam(r, "id"), req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *ShippingHandler) AddTrackingEvent(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	var req service.CreateTrackingEventRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		writeDecodeValidationError(w, r, err)
		return
	}

	result, err := h.service.AddTrackingEvent(r.Context(), user, requestID(r), chi.URLParam(r, "id"), req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusCreated, result)
}

func (h *ShippingHandler) GetTrackingEvents(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	result, err := h.service.GetTrackingEvents(r.Context(), user, chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *ShippingHandler) HandleProviderWebhook(w http.ResponseWriter, r *http.Request) {
	var req service.ShippingWebhookRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		writeDecodeValidationError(w, r, err)
		return
	}

	result, err := h.service.HandleProviderWebhook(r.Context(), requestID(r), chi.URLParam(r, "provider"), req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusCreated, result)
}

func parseListQuery(r *http.Request) (service.ListShipmentsRequest, error) {
	q := r.URL.Query()

	page := 1
	if raw := strings.TrimSpace(q.Get("page")); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil {
			return service.ListShipmentsRequest{}, validationError("page must be an integer number")
		}
		if v < 1 {
			return service.ListShipmentsRequest{}, validationError("page must not be less than 1")
		}
		page = v
	}

	pageSize := 20
	if raw := strings.TrimSpace(q.Get("pageSize")); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil {
			return service.ListShipmentsRequest{}, validationError("pageSize must be an integer number")
		}
		if v < 1 {
			return service.ListShipmentsRequest{}, validationError("pageSize must not be less than 1")
		}
		if v > 100 {
			return service.ListShipmentsRequest{}, validationError("pageSize must not be greater than 100")
		}
		pageSize = v
	}

	var status *domain.ShipmentStatus
	if raw := strings.TrimSpace(q.Get("status")); raw != "" {
		st := domain.ShipmentStatus(strings.ToUpper(raw))
		if !domain.IsValidShipmentStatus(st) {
			return service.ListShipmentsRequest{}, validationError("status must be one of the following values: PENDING, AWB_CREATED, PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, CANCELLED, FAILED, RETURNED")
		}
		status = &st
	}

	var provider *string
	if raw := strings.TrimSpace(q.Get("provider")); raw != "" {
		provider = &raw
	}

	var orderID *string
	if raw := strings.TrimSpace(q.Get("orderId")); raw != "" {
		if _, err := uuid.Parse(raw); err != nil {
			return service.ListShipmentsRequest{}, validationError("orderId must be a UUID")
		}
		orderID = &raw
	}

	var buyerID *string
	if raw := strings.TrimSpace(q.Get("buyerId")); raw != "" {
		if _, err := uuid.Parse(raw); err != nil {
			return service.ListShipmentsRequest{}, validationError("buyerId must be a UUID")
		}
		buyerID = &raw
	}

	var sellerID *string
	if raw := strings.TrimSpace(q.Get("sellerId")); raw != "" {
		if _, err := uuid.Parse(raw); err != nil {
			return service.ListShipmentsRequest{}, validationError("sellerId must be a UUID")
		}
		sellerID = &raw
	}

	var search *string
	if raw := strings.TrimSpace(q.Get("search")); raw != "" {
		search = &raw
	}

	sortBy := strings.TrimSpace(q.Get("sortBy"))
	if sortBy == "" {
		sortBy = "createdAt"
	}
	if sortBy != "createdAt" && sortBy != "shippingFee" && sortBy != "status" {
		return service.ListShipmentsRequest{}, validationError("sortBy must be one of the following values: createdAt, shippingFee, status")
	}

	sortOrder := strings.ToUpper(strings.TrimSpace(q.Get("sortOrder")))
	if sortOrder == "" {
		sortOrder = "DESC"
	}
	if sortOrder != "ASC" && sortOrder != "DESC" {
		return service.ListShipmentsRequest{}, validationError("sortOrder must be one of the following values: ASC, DESC")
	}

	return service.ListShipmentsRequest{
		Page:      page,
		PageSize:  pageSize,
		Status:    status,
		Provider:  provider,
		OrderID:   orderID,
		BuyerID:   buyerID,
		SellerID:  sellerID,
		Search:    search,
		SortBy:    sortBy,
		SortOrder: sortOrder,
	}, nil
}

func validationError(message string) error {
	return httpx.NewAppError(
		http.StatusBadRequest,
		domain.ErrorCodeBadRequest,
		message,
		nil,
	)
}

func writeDecodeValidationError(w http.ResponseWriter, r *http.Request, err error) {
	message := "Validation failed"
	if matches := unknownFieldRegex.FindStringSubmatch(err.Error()); len(matches) == 2 && strings.TrimSpace(matches[1]) != "" {
		message = "property " + matches[1] + " should not exist"
	}
	httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, message, nil)
}

func requestID(r *http.Request) string {
	if requestID := middleware.RequestIDFromContext(r.Context()); requestID != "" {
		return requestID
	}
	return "unknown-request-id"
}
