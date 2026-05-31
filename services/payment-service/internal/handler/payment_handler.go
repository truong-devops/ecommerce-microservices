package handler

import (
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"payment-service-go/internal/auth"
	"payment-service-go/internal/domain"
	"payment-service-go/internal/httpx"
	"payment-service-go/internal/middleware"
	"payment-service-go/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

var currencyRegex = regexp.MustCompile(`^[A-Z]{3}$`)

type PaymentHandler struct {
	paymentService *service.PaymentService
}

func NewPaymentHandler(paymentService *service.PaymentService) *PaymentHandler {
	return &PaymentHandler{paymentService: paymentService}
}

func (h *PaymentHandler) CreatePaymentIntent(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	var req service.CreatePaymentIntentRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{"body": err.Error()})
		return
	}
	if err := validateCreatePaymentIntent(req); err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeValidationFailed)
		return
	}

	result, status, err := h.paymentService.CreatePaymentIntent(
		r.Context(),
		user,
		httpx.ExtractBearerToken(r.Header.Get("Authorization")),
		requestID(r),
		strings.TrimSpace(r.Header.Get("Idempotency-Key")),
		req,
	)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, status, result)
}

func (h *PaymentHandler) ListPayments(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	query, err := parseListPaymentsQuery(r)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeValidationFailed)
		return
	}

	result, err := h.paymentService.ListPayments(r.Context(), user, query)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *PaymentHandler) GetPaymentByID(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	result, err := h.paymentService.GetPaymentByID(r.Context(), user, chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *PaymentHandler) GetPaymentByOrderID(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	result, err := h.paymentService.GetPaymentByOrderID(r.Context(), user, chi.URLParam(r, "orderId"))
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *PaymentHandler) CreateRefund(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	var req service.CreateRefundRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{"body": err.Error()})
		return
	}
	if err := validateCreateRefund(req); err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeValidationFailed)
		return
	}

	result, status, err := h.paymentService.CreateRefund(r.Context(), user, requestID(r), chi.URLParam(r, "id"), req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, status, result)
}

func (h *PaymentHandler) ListRefunds(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	result, err := h.paymentService.ListRefunds(r.Context(), user, chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *PaymentHandler) HandleProviderWebhook(w http.ResponseWriter, r *http.Request) {
	if strings.EqualFold(strings.TrimSpace(chi.URLParam(r, "provider")), "sepay") {
		rawBody, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
		if err != nil {
			httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Invalid webhook body", nil)
			return
		}
		result, status, err := h.paymentService.HandleSePayWebhook(r.Context(), requestID(r), r.Header, rawBody, r.RemoteAddr)
		if err != nil {
			httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
			return
		}
		writeSePaySuccess(w, status, result)
		return
	}

	var req service.PaymentWebhookRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{"body": err.Error()})
		return
	}
	if err := validateWebhook(req); err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeValidationFailed)
		return
	}

	result, status, err := h.paymentService.HandleProviderWebhook(r.Context(), requestID(r), chi.URLParam(r, "provider"), req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, status, result)
}

func writeSePaySuccess(w http.ResponseWriter, status int, payload map[string]any) {
	if status == 0 {
		status = http.StatusOK
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if payload == nil {
		_, _ = w.Write([]byte(`{"success":true}`))
		return
	}
	_, _ = w.Write([]byte(`{"success":true}`))
}

func validateCreatePaymentIntent(req service.CreatePaymentIntentRequest) error {
	if _, err := uuid.Parse(strings.TrimSpace(req.OrderID)); err != nil {
		return validationError("orderId", "must be UUID")
	}
	if req.SellerID != nil && strings.TrimSpace(*req.SellerID) != "" {
		if _, err := uuid.Parse(strings.TrimSpace(*req.SellerID)); err != nil {
			return validationError("sellerId", "must be UUID")
		}
	}
	if !currencyRegex.MatchString(strings.TrimSpace(req.Currency)) {
		return validationError("currency", "must match ^[A-Z]{3}$")
	}
	if req.Amount < 0.01 || !hasMax2Decimals(req.Amount) {
		return validationError("amount", "must be >= 0.01 with max 2 decimal places")
	}
	if req.Provider != nil {
		v := strings.TrimSpace(*req.Provider)
		if len(v) > 64 {
			return validationError("provider", "max length is 64")
		}
	}
	if req.Description != nil && len(strings.TrimSpace(*req.Description)) > 500 {
		return validationError("description", "max length is 500")
	}
	if req.SimulatedStatus != nil && strings.TrimSpace(*req.SimulatedStatus) != "" {
		status := domain.PaymentStatus(strings.ToUpper(strings.TrimSpace(*req.SimulatedStatus)))
		if !domain.IsValidPaymentStatus(status) {
			return validationError("simulatedStatus", "invalid status")
		}
	}
	return nil
}

func validateCreateRefund(req service.CreateRefundRequest) error {
	if req.Amount < 0.01 || !hasMax2Decimals(req.Amount) {
		return validationError("amount", "must be >= 0.01 with max 2 decimal places")
	}
	if req.Reason != nil && len(strings.TrimSpace(*req.Reason)) > 500 {
		return validationError("reason", "max length is 500")
	}
	return nil
}

func validateWebhook(req service.PaymentWebhookRequest) error {
	if len(strings.TrimSpace(req.ProviderEventID)) < 1 || len(strings.TrimSpace(req.ProviderEventID)) > 128 {
		return validationError("providerEventId", "length must be between 1 and 128")
	}
	if req.PaymentID != nil && strings.TrimSpace(*req.PaymentID) != "" {
		if _, err := uuid.Parse(strings.TrimSpace(*req.PaymentID)); err != nil {
			return validationError("paymentId", "must be UUID")
		}
	}
	if req.OrderID != nil && strings.TrimSpace(*req.OrderID) != "" {
		if _, err := uuid.Parse(strings.TrimSpace(*req.OrderID)); err != nil {
			return validationError("orderId", "must be UUID")
		}
	}
	if strings.TrimSpace(req.EventType) == "" || len(strings.TrimSpace(req.EventType)) > 128 {
		return validationError("eventType", "length must be between 1 and 128")
	}
	status := domain.PaymentStatus(strings.ToUpper(strings.TrimSpace(req.Status)))
	if !domain.IsValidPaymentStatus(status) {
		return validationError("status", "invalid status")
	}
	if req.Amount != nil {
		if *req.Amount < 0 || !hasMax2Decimals(*req.Amount) {
			return validationError("amount", "must be >= 0 with max 2 decimal places")
		}
	}
	if req.Currency != nil && strings.TrimSpace(*req.Currency) != "" {
		if !currencyRegex.MatchString(strings.TrimSpace(*req.Currency)) {
			return validationError("currency", "must match ^[A-Z]{3}$")
		}
	}
	if req.Signature != nil && len(strings.TrimSpace(*req.Signature)) > 255 {
		return validationError("signature", "max length is 255")
	}
	return nil
}

func parseListPaymentsQuery(r *http.Request) (service.ListPaymentsRequest, error) {
	q := r.URL.Query()

	page := 1
	if raw := strings.TrimSpace(q.Get("page")); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 1 {
			return service.ListPaymentsRequest{}, validationError("page", "must be an integer >= 1")
		}
		page = v
	}

	pageSize := 20
	if raw := strings.TrimSpace(q.Get("pageSize")); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 1 || v > 100 {
			return service.ListPaymentsRequest{}, validationError("pageSize", "must be an integer between 1 and 100")
		}
		pageSize = v
	}

	var status *domain.PaymentStatus
	if raw := strings.TrimSpace(q.Get("status")); raw != "" {
		st := domain.PaymentStatus(strings.ToUpper(raw))
		if !domain.IsValidPaymentStatus(st) {
			return service.ListPaymentsRequest{}, validationError("status", "invalid status")
		}
		status = &st
	}

	var orderID *string
	if raw := strings.TrimSpace(q.Get("orderId")); raw != "" {
		if _, err := uuid.Parse(raw); err != nil {
			return service.ListPaymentsRequest{}, validationError("orderId", "must be UUID")
		}
		orderID = &raw
	}

	var userID *string
	if raw := strings.TrimSpace(q.Get("userId")); raw != "" {
		if _, err := uuid.Parse(raw); err != nil {
			return service.ListPaymentsRequest{}, validationError("userId", "must be UUID")
		}
		userID = &raw
	}

	var sellerID *string
	if raw := strings.TrimSpace(q.Get("sellerId")); raw != "" {
		if _, err := uuid.Parse(raw); err != nil {
			return service.ListPaymentsRequest{}, validationError("sellerId", "must be UUID")
		}
		sellerID = &raw
	}

	var provider *string
	if raw := strings.TrimSpace(q.Get("provider")); raw != "" {
		provider = &raw
	}

	var search *string
	if raw := strings.TrimSpace(q.Get("search")); raw != "" {
		search = &raw
	}

	sortBy := strings.TrimSpace(q.Get("sortBy"))
	if sortBy == "" {
		sortBy = "createdAt"
	}
	if sortBy != "createdAt" && sortBy != "amount" && sortBy != "status" {
		return service.ListPaymentsRequest{}, validationError("sortBy", "invalid sortBy")
	}

	sortOrder := strings.ToUpper(strings.TrimSpace(q.Get("sortOrder")))
	if sortOrder == "" {
		sortOrder = "DESC"
	}
	if sortOrder != "ASC" && sortOrder != "DESC" {
		return service.ListPaymentsRequest{}, validationError("sortOrder", "invalid sortOrder")
	}

	return service.ListPaymentsRequest{
		Page:      page,
		PageSize:  pageSize,
		Status:    status,
		OrderID:   orderID,
		UserID:    userID,
		SellerID:  sellerID,
		Provider:  provider,
		Search:    search,
		SortBy:    sortBy,
		SortOrder: sortOrder,
	}, nil
}

func hasMax2Decimals(value float64) bool {
	value = value * 100
	return value == float64(int64(value+0.5))
}

func validationError(field, msg string) error {
	return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{field: msg})
}

func requestID(r *http.Request) string {
	return middleware.RequestIDFromContext(r.Context())
}
