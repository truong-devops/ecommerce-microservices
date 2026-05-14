package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
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

type ResolvedCartItem struct {
	UnitPrice float64
	Name      string
	Currency  string
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
	_, issues, err := s.ValidateAndResolveItem(ctx, item, "", includeExternalChecks)
	return issues, err
}

func (s *CartValidationClient) ValidateAndResolveItem(
	ctx context.Context,
	item domain.CartItem,
	expectedCurrency string,
	includeExternalChecks bool,
) (ResolvedCartItem, []domain.CartValidationIssue, error) {
	resolved := ResolvedCartItem{
		UnitPrice: roundMoney(item.UnitPrice),
		Name:      strings.TrimSpace(item.Name),
		Currency:  strings.ToUpper(strings.TrimSpace(expectedCurrency)),
	}
	if !s.enabled || !includeExternalChecks {
		return resolved, nil, nil
	}

	issues := make([]domain.CartValidationIssue, 0)

	if s.productServiceBaseURL != "" {
		status, body, err := s.check(ctx, s.productServiceBaseURL+"/products/"+url.PathEscape(item.ProductID))
		if err != nil {
			return resolved, nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeCartDependencyUnavailable, "Dependency service unavailable", nil)
		}
		if status == http.StatusNotFound {
			issues = append(issues, domain.CartValidationIssue{
				Code:      domain.ErrorCodeNotFound,
				Message:   "Product not found",
				ItemID:    item.ID,
				ProductID: item.ProductID,
			})
		} else if status < 200 || status >= 300 {
			return resolved, nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeCartDependencyUnavailable, "Product service validation failed", nil)
		} else {
			var envelope struct {
				Success bool `json:"success"`
				Data    struct {
					Name     string `json:"name"`
					Variants []struct {
						SKU      string  `json:"sku"`
						Name     string  `json:"name"`
						Price    float64 `json:"price"`
						Currency string  `json:"currency"`
					} `json:"variants"`
				} `json:"data"`
			}
			if err := json.Unmarshal(body, &envelope); err != nil || !envelope.Success {
				return resolved, nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeCartDependencyUnavailable, "Product service payload is invalid", nil)
			}

			foundVariant := false
			for _, variant := range envelope.Data.Variants {
				if strings.TrimSpace(variant.SKU) != strings.TrimSpace(item.SKU) {
					continue
				}
				foundVariant = true
				variantCurrency := strings.ToUpper(strings.TrimSpace(variant.Currency))
				if expectedCurrency != "" && variantCurrency != strings.ToUpper(strings.TrimSpace(expectedCurrency)) {
					issues = append(issues, domain.CartValidationIssue{
						Code:      domain.ErrorCodeValidationFailed,
						Message:   "Product variant currency does not match cart currency",
						ItemID:    item.ID,
						ProductID: item.ProductID,
						SKU:       item.SKU,
					})
				}
				resolved.UnitPrice = roundMoney(variant.Price)
				resolved.Currency = variantCurrency
				resolved.Name = strings.TrimSpace(variant.Name)
				if resolved.Name == "" {
					resolved.Name = strings.TrimSpace(envelope.Data.Name)
				}
				break
			}
			if !foundVariant {
				issues = append(issues, domain.CartValidationIssue{
					Code:      domain.ErrorCodeValidationFailed,
					Message:   "Product variant SKU not found",
					ItemID:    item.ID,
					ProductID: item.ProductID,
					SKU:       item.SKU,
				})
			}
		}
	}

	if s.inventoryServiceBaseURL != "" {
		invURL := s.inventoryServiceBaseURL + "/inventory/validate?sku=" + url.QueryEscape(item.SKU) + "&quantity=" + strconvInt(item.Quantity)
		status, _, err := s.check(ctx, invURL)
		if err != nil {
			return resolved, nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeCartDependencyUnavailable, "Dependency service unavailable", nil)
		}
		if status < 200 || status >= 300 {
			return resolved, nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeCartDependencyUnavailable, "Inventory service validation failed", nil)
		}
	}

	return resolved, issues, nil
}

func (s *CartValidationClient) check(ctx context.Context, rawURL string) (int, []byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("accept", "application/json")

	res, err := s.client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return 0, nil, err
	}
	return res.StatusCode, body, nil
}

func strconvInt(value int) string {
	return fmt.Sprintf("%d", value)
}
