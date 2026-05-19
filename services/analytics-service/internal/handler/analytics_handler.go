package handler

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"analytics-service/internal/auth"
	"analytics-service/internal/domain"
	"analytics-service/internal/httpx"
	"analytics-service/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type AnalyticsHandler struct {
	analyticsService *service.AnalyticsService
	recommendations  *service.RecommendationService
}

func NewAnalyticsHandler(analyticsService *service.AnalyticsService, recommendations *service.RecommendationService) *AnalyticsHandler {
	return &AnalyticsHandler{analyticsService: analyticsService, recommendations: recommendations}
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

func (h *AnalyticsHandler) GetProductRecommendations(w http.ResponseWriter, r *http.Request) {
	productID := strings.TrimSpace(chi.URLParam(r, "productId"))
	if productID == "" {
		productID = strings.TrimSpace(r.URL.Query().Get("productId"))
	}
	limit, err := parseLimit(r, 12)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeBadRequest)
		return
	}
	result, err := h.recommendations.GetByProduct(r.Context(), productID, strings.TrimSpace(r.URL.Query().Get("sellerId")), limit)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *AnalyticsHandler) GetCartRecommendations(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ProductIDs []string `json:"productIds"`
		SellerID   string   `json:"sellerId"`
		Limit      int      `json:"limit"`
	}
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{"body": err.Error()})
		return
	}
	result, err := h.recommendations.GetByCart(r.Context(), req.ProductIDs, req.SellerID, req.Limit)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *AnalyticsHandler) TrainRecommendations(w http.ResponseWriter, r *http.Request) {
	result, err := h.recommendations.Train(r.Context())
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *AnalyticsHandler) GetRecommendationInsights(w http.ResponseWriter, r *http.Request) {
	limit, err := parseLimit(r, 20)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeBadRequest)
		return
	}
	result, err := h.recommendations.GetInsights(r.Context(), strings.TrimSpace(r.URL.Query().Get("sellerId")), limit)
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

func parseLimit(r *http.Request, fallback int) (int, error) {
	raw := strings.TrimSpace(r.URL.Query().Get("limit"))
	if raw == "" {
		return fallback, nil
	}
	limit, err := strconv.Atoi(raw)
	if err != nil || limit < 1 || limit > 50 {
		return 0, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", map[string]any{"limit": "must be an integer between 1 and 50"})
	}
	return limit, nil
}
