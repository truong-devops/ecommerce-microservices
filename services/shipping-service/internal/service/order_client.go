package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"shipping-service/internal/domain"
	"shipping-service/internal/httpx"
)

type OrderClient struct {
	baseURL string
	client  *http.Client
}

type OrderSnapshot struct {
	ID       string
	UserID   string
	Status   string
	Currency string
}

func NewOrderClient(baseURL string, timeout time.Duration) *OrderClient {
	return &OrderClient{
		baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		client: &http.Client{
			Timeout: timeout,
		},
	}
}

func (c *OrderClient) GetOrderByID(ctx context.Context, orderID, bearerToken string) (*OrderSnapshot, error) {
	if c == nil || c.baseURL == "" {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Order service dependency is not configured", nil)
	}
	if strings.TrimSpace(bearerToken) == "" {
		return nil, httpx.NewAppError(http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/orders/"+url.PathEscape(strings.TrimSpace(orderID)), nil)
	if err != nil {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Order service unavailable", nil)
	}
	req.Header.Set("accept", "application/json")
	req.Header.Set("authorization", "Bearer "+strings.TrimSpace(bearerToken))

	res, err := c.client.Do(req)
	if err != nil {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Order service unavailable", nil)
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusNotFound {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Order not found", nil)
	}
	if res.StatusCode == http.StatusUnauthorized {
		return nil, httpx.NewAppError(http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
	}
	if res.StatusCode == http.StatusForbidden {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Forbidden order access", nil)
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Order service returned non-success response", nil)
	}

	var envelope struct {
		Success bool `json:"success"`
		Data    struct {
			ID       string `json:"id"`
			UserID   string `json:"userId"`
			Status   string `json:"status"`
			Currency string `json:"currency"`
		} `json:"data"`
	}
	if err := json.NewDecoder(res.Body).Decode(&envelope); err != nil {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Order service payload is invalid", nil)
	}
	if !envelope.Success {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Order service responded unsuccessfully", nil)
	}

	return &OrderSnapshot{
		ID:       strings.TrimSpace(envelope.Data.ID),
		UserID:   strings.TrimSpace(envelope.Data.UserID),
		Status:   strings.ToUpper(strings.TrimSpace(envelope.Data.Status)),
		Currency: strings.ToUpper(strings.TrimSpace(envelope.Data.Currency)),
	}, nil
}
