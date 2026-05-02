package service

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"cart-service/internal/domain"
	"cart-service/internal/httpx"
)

type CartValidationClient struct {
	enabled                 bool
	productServiceBaseURL   string
	inventoryServiceBaseURL string
	timeout                 time.Duration
	client                  *http.Client
}

func NewCartValidationClient(
	enabled bool,
	productServiceBaseURL string,
	inventoryServiceBaseURL string,
	timeout time.Duration,
) *CartValidationClient {
	return &CartValidationClient{
		enabled:                 enabled,
		productServiceBaseURL:   strings.TrimRight(strings.TrimSpace(productServiceBaseURL), "/"),
		inventoryServiceBaseURL: strings.TrimRight(strings.TrimSpace(inventoryServiceBaseURL), "/"),
		timeout:                 timeout,
		client: &http.Client{
			Timeout: timeout,
		},
	}
}

func (s *CartValidationClient) ValidateItem(ctx context.Context, item domain.CartItem, includeExternalChecks bool) ([]domain.CartValidationIssue, error) {
	if !s.enabled || !includeExternalChecks {
		return nil, nil
	}

	issues := make([]domain.CartValidationIssue, 0)

	if s.productServiceBaseURL != "" {
		status, err := s.check(ctx, s.productServiceBaseURL+"/products/"+url.PathEscape(item.ProductID))
		if err != nil {
			return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeCartDependencyUnavailable, "Dependency service unavailable", nil)
		}
		if status == http.StatusNotFound {
			issues = append(issues, domain.CartValidationIssue{
				Code:      domain.ErrorCodeNotFound,
				Message:   "Product not found",
				ItemID:    item.ID,
				ProductID: item.ProductID,
			})
		} else if status < 200 || status >= 300 {
			return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeCartDependencyUnavailable, "Product service validation failed", nil)
		}
	}

	if s.inventoryServiceBaseURL != "" {
		invURL := s.inventoryServiceBaseURL + "/inventory/validate?sku=" + url.QueryEscape(item.SKU) + "&quantity=" + strconvInt(item.Quantity)
		status, err := s.check(ctx, invURL)
		if err != nil {
			return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeCartDependencyUnavailable, "Dependency service unavailable", nil)
		}
		if status < 200 || status >= 300 {
			return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeCartDependencyUnavailable, "Inventory service validation failed", nil)
		}
	}

	return issues, nil
}

func (s *CartValidationClient) check(ctx context.Context, rawURL string) (int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("accept", "application/json")

	res, err := s.client.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()
	return res.StatusCode, nil
}

func strconvInt(value int) string {
	return fmt.Sprintf("%d", value)
}
