package handler

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"live-service/internal/auth"
	"live-service/internal/domain"
	"live-service/internal/httpx"
	"live-service/internal/service"

	"github.com/go-chi/chi/v5"
)

type LiveHandler struct {
	liveService *service.LiveService
}

func NewLiveHandler(liveService *service.LiveService) *LiveHandler {
	return &LiveHandler{liveService: liveService}
}

func (h *LiveHandler) CreateSession(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	var req service.CreateSessionRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{"body": err.Error()})
		return
	}
	result, err := h.liveService.CreateSession(r.Context(), user, req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusCreated, result)
}

func (h *LiveHandler) ListPublicSessions(w http.ResponseWriter, r *http.Request) {
	result, err := h.liveService.ListPublicSessions(r.Context(), parseListSessionsQuery(r))
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *LiveHandler) ListMySessions(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	result, err := h.liveService.ListMySessions(r.Context(), user, parseListSessionsQuery(r))
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *LiveHandler) GetSession(w http.ResponseWriter, r *http.Request) {
	var userPtr *domain.UserContext
	if user, ok := auth.UserFromContext(r.Context()); ok {
		userCopy := user
		userPtr = &userCopy
	}
	result, err := h.liveService.GetSession(r.Context(), userPtr, chi.URLParam(r, "sessionId"))
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *LiveHandler) UpdateSession(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	var req service.UpdateSessionRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{"body": err.Error()})
		return
	}
	result, err := h.liveService.UpdateSession(r.Context(), user, chi.URLParam(r, "sessionId"), req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *LiveHandler) StartSession(w http.ResponseWriter, r *http.Request) {
	h.runTransition(w, r, h.liveService.StartSession)
}

func (h *LiveHandler) PauseSession(w http.ResponseWriter, r *http.Request) {
	h.runTransition(w, r, h.liveService.PauseSession)
}

func (h *LiveHandler) EndSession(w http.ResponseWriter, r *http.Request) {
	h.runTransition(w, r, h.liveService.EndSession)
}

func (h *LiveHandler) CancelSession(w http.ResponseWriter, r *http.Request) {
	h.runTransition(w, r, h.liveService.CancelSession)
}

func (h *LiveHandler) PinProduct(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	var req service.PinProductRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{"body": err.Error()})
		return
	}
	result, err := h.liveService.PinProduct(r.Context(), user, chi.URLParam(r, "sessionId"), req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusCreated, result)
}

func (h *LiveHandler) UnpinProduct(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	result, err := h.liveService.UnpinProduct(r.Context(), user, chi.URLParam(r, "sessionId"), chi.URLParam(r, "productId"))
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *LiveHandler) ListPinnedProducts(w http.ResponseWriter, r *http.Request) {
	result, err := h.liveService.ListPinnedProducts(r.Context(), chi.URLParam(r, "sessionId"))
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *LiveHandler) TrackProductClicked(w http.ResponseWriter, r *http.Request) {
	var userPtr *domain.UserContext
	if user, ok := auth.UserFromContext(r.Context()); ok {
		userCopy := user
		userPtr = &userCopy
	}
	var req struct {
		ProductID string `json:"productId"`
	}
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{"body": err.Error()})
		return
	}
	if err := h.liveService.TrackProductClicked(r.Context(), userPtr, chi.URLParam(r, "sessionId"), req.ProductID); err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, map[string]any{"tracked": true})
}

func (h *LiveHandler) runTransition(w http.ResponseWriter, r *http.Request, fn func(ctx context.Context, user domain.UserContext, sessionID string) (domain.LiveSession, error)) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	result, err := fn(r.Context(), user, chi.URLParam(r, "sessionId"))
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func parseListSessionsQuery(r *http.Request) service.ListSessionsRequest {
	q := r.URL.Query()
	page := parsePositiveInt(q.Get("page"), 1)
	pageSize := parsePositiveInt(q.Get("pageSize"), 20)
	status := domain.LiveSessionStatus(strings.ToUpper(strings.TrimSpace(q.Get("status"))))
	return service.ListSessionsRequest{Page: page, PageSize: pageSize, Status: status}
}

func parsePositiveInt(raw string, fallback int) int {
	v, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || v < 1 {
		return fallback
	}
	return v
}
