package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"analytics-service/internal/domain"
	"analytics-service/internal/httpx"
)

type CompletedOrderItem struct {
	ProductID string  `json:"productId"`
	Quantity  int     `json:"quantity"`
	UnitPrice float64 `json:"unitPrice"`
}

type CompletedOrder struct {
	OrderID     string               `json:"orderId"`
	UserID      string               `json:"userId"`
	SellerID    *string              `json:"sellerId"`
	CompletedAt time.Time            `json:"completedAt"`
	Items       []CompletedOrderItem `json:"items"`
}

type OrderClient struct {
	baseURL    string
	token      string
	pageSize   int
	httpClient *http.Client
}

func NewOrderClient(baseURL, token string, timeout time.Duration, pageSize int) *OrderClient {
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	if pageSize <= 0 {
		pageSize = 500
	}
	return &OrderClient{
		baseURL:    strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		token:      strings.TrimSpace(token),
		pageSize:   pageSize,
		httpClient: &http.Client{Timeout: timeout},
	}
}

func (c *OrderClient) FetchCompletedOrders(ctx context.Context, from, to time.Time) ([]CompletedOrder, error) {
	if c == nil || c.baseURL == "" || c.token == "" {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Order service client is not configured", nil)
	}

	all := make([]CompletedOrder, 0)
	for page := 1; ; page++ {
		resp, err := c.fetchCompletedOrdersPage(ctx, from, to, page)
		if err != nil {
			return nil, err
		}
		all = append(all, resp.Items...)
		if !resp.Pagination.HasNext || len(resp.Items) == 0 {
			break
		}
	}
	return all, nil
}

type completedOrdersResponse struct {
	Success    bool           `json:"success"`
	Data       completedData  `json:"data"`
	Pagination completedPage  `json:"pagination"`
	Error      *responseError `json:"error"`
}

type completedData struct {
	Items      []CompletedOrder `json:"items"`
	Pagination completedPage    `json:"pagination"`
}

type completedPage struct {
	Page       int  `json:"page"`
	PageSize   int  `json:"pageSize"`
	TotalItems int  `json:"totalItems"`
	TotalPages int  `json:"totalPages"`
	HasNext    bool `json:"hasNext"`
}

type responseError struct {
	Message string `json:"message"`
}

func (c *OrderClient) fetchCompletedOrdersPage(ctx context.Context, from, to time.Time, page int) (completedData, error) {
	endpoint, err := url.Parse(c.baseURL + "/api/v1/orders/internal/completed")
	if err != nil {
		return completedData{}, err
	}
	query := endpoint.Query()
	query.Set("from", from.UTC().Format(time.RFC3339))
	query.Set("to", to.UTC().Format(time.RFC3339))
	query.Set("page", strconv.Itoa(page))
	query.Set("pageSize", strconv.Itoa(c.pageSize))
	endpoint.RawQuery = query.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return completedData{}, err
	}
	req.Header.Set("X-Internal-Service-Token", c.token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return completedData{}, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Order service unavailable", map[string]any{"error": err.Error()})
	}
	defer resp.Body.Close()

	var payload completedOrdersResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return completedData{}, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Order service response is invalid", nil)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 || !payload.Success {
		message := "Order service returned non-success response"
		if payload.Error != nil && strings.TrimSpace(payload.Error.Message) != "" {
			message = payload.Error.Message
		}
		return completedData{}, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, message, map[string]any{"status": resp.StatusCode})
	}
	if payload.Data.Pagination.Page == 0 && payload.Pagination.Page != 0 {
		payload.Data.Pagination = payload.Pagination
	}
	if payload.Data.Pagination.Page == 0 {
		return completedData{}, fmt.Errorf("order service pagination is missing")
	}
	return payload.Data, nil
}
