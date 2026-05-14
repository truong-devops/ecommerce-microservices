package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"order-service/internal/domain"
	"order-service/internal/httpx"
)

type ProductCatalogClient struct {
	baseURL string
	client  *http.Client
}

type CatalogProduct struct {
	ID       string
	Name     string
	Status   string
	Variants []CatalogVariant
}

type CatalogVariant struct {
	SKU      string
	Name     string
	Price    float64
	Currency string
}

func NewProductCatalogClient(baseURL string, timeout time.Duration) *ProductCatalogClient {
	return &ProductCatalogClient{
		baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		client: &http.Client{
			Timeout: timeout,
		},
	}
}

func (c *ProductCatalogClient) GetProductByID(ctx context.Context, productID string) (*CatalogProduct, error) {
	if c == nil || c.baseURL == "" {
		return nil, httpx.NewAppError(
			http.StatusServiceUnavailable,
			domain.ErrorCodeServiceUnavailable,
			"Product catalog dependency is not configured",
			nil,
		)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/products/"+url.PathEscape(productID), nil)
	if err != nil {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Product service unavailable", nil)
	}
	req.Header.Set("accept", "application/json")

	res, err := c.client.Do(req)
	if err != nil {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Product service unavailable", nil)
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Product service returned non-success response", nil)
	}

	var envelope struct {
		Success bool `json:"success"`
		Data    struct {
			ID       string `json:"id"`
			Name     string `json:"name"`
			Status   string `json:"status"`
			Variants []struct {
				SKU      string  `json:"sku"`
				Name     string  `json:"name"`
				Price    float64 `json:"price"`
				Currency string  `json:"currency"`
			} `json:"variants"`
		} `json:"data"`
	}

	if err := json.NewDecoder(res.Body).Decode(&envelope); err != nil {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Product service payload is invalid", nil)
	}
	if !envelope.Success {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Product service responded unsuccessfully", nil)
	}

	product := &CatalogProduct{
		ID:       strings.TrimSpace(envelope.Data.ID),
		Name:     strings.TrimSpace(envelope.Data.Name),
		Status:   strings.ToUpper(strings.TrimSpace(envelope.Data.Status)),
		Variants: make([]CatalogVariant, 0, len(envelope.Data.Variants)),
	}
	for _, variant := range envelope.Data.Variants {
		product.Variants = append(product.Variants, CatalogVariant{
			SKU:      strings.TrimSpace(variant.SKU),
			Name:     strings.TrimSpace(variant.Name),
			Price:    roundMoney(variant.Price),
			Currency: strings.ToUpper(strings.TrimSpace(variant.Currency)),
		})
	}

	return product, nil
}
