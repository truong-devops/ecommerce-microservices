package handler

import (
	"net/http"
	"strconv"
	"strings"

	"order-service/internal/auth"
	"order-service/internal/domain"
	"order-service/internal/httpx"
	"order-service/internal/service"

	"github.com/go-chi/chi/v5"
)

type ReturnHandler struct{ service *service.ReturnService }

func NewReturnHandler(returnService *service.ReturnService) *ReturnHandler {
	return &ReturnHandler{service: returnService}
}

func (h *ReturnHandler) Create(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	var req service.CreateReturnRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{"body": err.Error()})
		return
	}
	result, err := h.service.Create(r.Context(), user, requestID(r), chi.URLParam(r, "id"), req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusCreated, result)
}

func (h *ReturnHandler) GetByOrderID(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	result, err := h.service.GetByOrderID(r.Context(), user, chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *ReturnHandler) List(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	req, err := parseListReturnRequests(r)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeValidationFailed)
		return
	}
	result, err := h.service.List(r.Context(), user, req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *ReturnHandler) Decide(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	var req service.ReturnDecisionRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{"body": err.Error()})
		return
	}
	result, err := h.service.Decide(r.Context(), user, requestID(r), chi.URLParam(r, "returnId"), req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *ReturnHandler) Complete(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	var req service.CompleteReturnRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{"body": err.Error()})
		return
	}
	result, err := h.service.Complete(r.Context(), user, requestID(r), chi.URLParam(r, "returnId"), req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *ReturnHandler) Ship(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	result, err := h.service.Ship(r.Context(), user, requestID(r), chi.URLParam(r, "returnId"))
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *ReturnHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	result, err := h.service.Cancel(r.Context(), user, requestID(r), chi.URLParam(r, "returnId"))
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func parseListReturnRequests(r *http.Request) (service.ListReturnRequestsRequest, error) {
	page, pageSize := 1, 20
	if raw := strings.TrimSpace(r.URL.Query().Get("page")); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 {
			return service.ListReturnRequestsRequest{}, validationError("page", "must be an integer >= 1")
		}
		page = value
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("pageSize")); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > 100 {
			return service.ListReturnRequestsRequest{}, validationError("pageSize", "must be between 1 and 100")
		}
		pageSize = value
	}
	var status *domain.ReturnRequestStatus
	if raw := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("status"))); raw != "" {
		value := domain.ReturnRequestStatus(raw)
		if !domain.IsValidReturnRequestStatus(value) {
			return service.ListReturnRequestsRequest{}, validationError("status", "invalid return status")
		}
		status = &value
	}
	var search *string
	if raw := strings.TrimSpace(r.URL.Query().Get("search")); raw != "" {
		if len(raw) > 255 {
			raw = raw[:255]
		}
		search = &raw
	}
	return service.ListReturnRequestsRequest{Page: page, PageSize: pageSize, Status: status, Search: search}, nil
}
