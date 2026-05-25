package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"api-gateway/internal/middleware"
	apperrors "api-gateway/pkg/errors"
	"api-gateway/pkg/response"
)

type BuyerReviewHandler struct {
	orderBaseURL  string
	reviewBaseURL string
	client        *http.Client
}

type createReviewRequest struct {
	OrderID   string `json:"orderId"`
	ProductID string `json:"productId"`
}

type reviewOrderSnapshot struct {
	Status string `json:"status"`
	Items  []struct {
		ProductID string `json:"productId"`
	} `json:"items"`
}

func NewBuyerReviewHandler(orderBaseURL, reviewBaseURL string, timeout time.Duration) *BuyerReviewHandler {
	return &BuyerReviewHandler{
		orderBaseURL:  strings.TrimRight(orderBaseURL, "/"),
		reviewBaseURL: strings.TrimRight(reviewBaseURL, "/"),
		client:        &http.Client{Timeout: timeout},
	}
}

func (h *BuyerReviewHandler) Create(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		response.Error(w, http.StatusBadRequest, apperrors.CodeBadRequest, "Invalid review payload", middleware.RequestIDFromContext(r.Context()))
		return
	}
	var input createReviewRequest
	if err := json.Unmarshal(body, &input); err != nil || strings.TrimSpace(input.OrderID) == "" || strings.TrimSpace(input.ProductID) == "" {
		response.Error(w, http.StatusBadRequest, apperrors.CodeBadRequest, "Order and product are required to submit a review", middleware.RequestIDFromContext(r.Context()))
		return
	}

	order, ok := h.fetchOrder(r, input.OrderID, w)
	if !ok {
		return
	}
	if order.Status != "DELIVERED" {
		response.Error(w, http.StatusForbidden, apperrors.CodeForbidden, "You can only review products after confirming the order was received", middleware.RequestIDFromContext(r.Context()))
		return
	}
	found := false
	for _, item := range order.Items {
		if item.ProductID == input.ProductID {
			found = true
			break
		}
	}
	if !found {
		response.Error(w, http.StatusForbidden, apperrors.CodeForbidden, "You can only review products included in this order", middleware.RequestIDFromContext(r.Context()))
		return
	}

	h.forwardCreate(r, body, w)
}

func (h *BuyerReviewHandler) fetchOrder(r *http.Request, orderID string, w http.ResponseWriter) (reviewOrderSnapshot, bool) {
	request, err := http.NewRequestWithContext(r.Context(), http.MethodGet, h.orderBaseURL+"/api/v1/orders/"+url.PathEscape(strings.TrimSpace(orderID)), nil)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, apperrors.CodeInternalServer, "Cannot verify review order", middleware.RequestIDFromContext(r.Context()))
		return reviewOrderSnapshot{}, false
	}
	request.Header.Set("Authorization", r.Header.Get("Authorization"))
	upstream, err := h.client.Do(request)
	if err != nil {
		response.Error(w, http.StatusBadGateway, apperrors.CodeBadGateway, "Order service unavailable", middleware.RequestIDFromContext(r.Context()))
		return reviewOrderSnapshot{}, false
	}
	defer upstream.Body.Close()
	var envelope upstreamEnvelope
	if err := json.NewDecoder(upstream.Body).Decode(&envelope); err != nil || !envelope.Success {
		status := upstream.StatusCode
		if status < 400 || status > 499 {
			status = http.StatusBadGateway
		}
		response.Error(w, status, apperrors.CodeBadGateway, "Cannot verify review order", middleware.RequestIDFromContext(r.Context()))
		return reviewOrderSnapshot{}, false
	}
	var order reviewOrderSnapshot
	if err := json.Unmarshal(envelope.Data, &order); err != nil {
		response.Error(w, http.StatusBadGateway, apperrors.CodeBadGateway, "Invalid order service response", middleware.RequestIDFromContext(r.Context()))
		return reviewOrderSnapshot{}, false
	}
	return order, true
}

func (h *BuyerReviewHandler) forwardCreate(r *http.Request, body []byte, w http.ResponseWriter) {
	request, err := http.NewRequestWithContext(r.Context(), http.MethodPost, h.reviewBaseURL+"/api/v1/reviews", bytes.NewReader(body))
	if err != nil {
		response.Error(w, http.StatusInternalServerError, apperrors.CodeInternalServer, "Cannot submit review", middleware.RequestIDFromContext(r.Context()))
		return
	}
	request.Header.Set("Authorization", r.Header.Get("Authorization"))
	request.Header.Set("Content-Type", "application/json")
	upstream, err := h.client.Do(request)
	if err != nil {
		response.Error(w, http.StatusBadGateway, apperrors.CodeBadGateway, "Review service unavailable", middleware.RequestIDFromContext(r.Context()))
		return
	}
	defer upstream.Body.Close()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(upstream.StatusCode)
	_, _ = io.Copy(w, upstream.Body)
}
