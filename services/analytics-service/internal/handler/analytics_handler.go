package handler

import (
	"net/http"
	"strings"
	"time"

	"analytics-service/internal/auth"
	"analytics-service/internal/domain"
	"analytics-service/internal/httpx"
	"analytics-service/internal/service"

	"github.com/google/uuid"
)

type AnalyticsHandler struct {
	analyticsService *service.AnalyticsService
}

func NewAnalyticsHandler(analyticsService *service.AnalyticsService) *AnalyticsHandler {
	return &AnalyticsHandler{analyticsService: analyticsService}
}

func (h *AnalyticsHandler) GetOverview(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	fromInput, toInput, sellerIDInput, err := parseAnalyticsBaseQuery(r)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeBadRequest)
		return
	}
	result, err := h.analyticsService.GetOverview(r.Context(), user, fromInput, toInput, sellerIDInput)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *AnalyticsHandler) GetTimeseries(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	fromInput, toInput, sellerIDInput, err := parseAnalyticsBaseQuery(r)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeBadRequest)
		return
	}
	interval := strings.TrimSpace(r.URL.Query().Get("interval"))
	if interval == "" {
		interval = "day"
	}
	eventType := strings.TrimSpace(r.URL.Query().Get("eventType"))
	result, err := h.analyticsService.GetTimeseries(r.Context(), user, fromInput, toInput, sellerIDInput, interval, eventType)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *AnalyticsHandler) GetPaymentsSummary(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	fromInput, toInput, sellerIDInput, err := parseAnalyticsBaseQuery(r)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeBadRequest)
		return
	}
	result, err := h.analyticsService.GetPaymentsSummary(r.Context(), user, fromInput, toInput, sellerIDInput)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *AnalyticsHandler) GetShippingSummary(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	fromInput, toInput, sellerIDInput, err := parseAnalyticsBaseQuery(r)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeBadRequest)
		return
	}
	result, err := h.analyticsService.GetShippingSummary(r.Context(), user, fromInput, toInput, sellerIDInput)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *AnalyticsHandler) GetVideoSummary(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	fromInput, toInput, sellerIDInput, err := parseAnalyticsBaseQuery(r)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeBadRequest)
		return
	}
	videoID := strings.TrimSpace(r.URL.Query().Get("videoId"))
	result, err := h.analyticsService.GetVideoSummary(r.Context(), user, fromInput, toInput, sellerIDInput, videoID)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func parseAnalyticsBaseQuery(r *http.Request) (string, string, string, error) {
	q := r.URL.Query()
	fromInput := strings.TrimSpace(q.Get("from"))
	toInput := strings.TrimSpace(q.Get("to"))
	sellerIDInput := strings.TrimSpace(q.Get("sellerId"))

	if sellerIDInput != "" {
		parsedSellerID, err := uuid.Parse(sellerIDInput)
		if err != nil || parsedSellerID.Version() != 4 {
			return "", "", "", httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", map[string]any{"sellerId": "must be a UUID v4"})
		}
	}
	if fromInput != "" {
		if _, err := time.Parse(time.RFC3339, fromInput); err != nil {
			return "", "", "", httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", map[string]any{"from": "must be an ISO-8601 datetime"})
		}
	}
	if toInput != "" {
		if _, err := time.Parse(time.RFC3339, toInput); err != nil {
			return "", "", "", httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", map[string]any{"to": "must be an ISO-8601 datetime"})
		}
	}

	return fromInput, toInput, sellerIDInput, nil
}
