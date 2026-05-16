package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"live-service/internal/domain"
	"live-service/internal/httpx"
)

type ProductSnapshot struct {
	ProductID string
	SellerID  string
	Name      string
	ImageURL  string
	Status    string
	Price     float64
	Currency  string
}

type ProductVerifier interface {
	GetProductSnapshot(ctx context.Context, productID string) (ProductSnapshot, error)
}

type HTTPProductClient struct {
	baseURL string
	client  *http.Client
}

func NewHTTPProductClient(baseURL string, timeout time.Duration) *HTTPProductClient {
	return &HTTPProductClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		client:  &http.Client{Timeout: timeout},
	}
}

func (c *HTTPProductClient) GetProductSnapshot(ctx context.Context, productID string) (ProductSnapshot, error) {
	productID = strings.TrimSpace(productID)
	if productID == "" {
		return ProductSnapshot{}, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationFailed, "productId is required", nil)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/v1/products/"+productID, nil)
	if err != nil {
		return ProductSnapshot{}, err
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return ProductSnapshot{}, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Product service unavailable", nil)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return ProductSnapshot{}, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Product not found", nil)
	}
	if resp.StatusCode >= 400 {
		return ProductSnapshot{}, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Product service returned an error", nil)
	}

	var envelope struct {
		Success bool `json:"success"`
		Data    struct {
			ID       string   `json:"id"`
			SellerID string   `json:"sellerId"`
			Name     string   `json:"name"`
			Status   string   `json:"status"`
			Images   []string `json:"images"`
			MinPrice float64  `json:"minPrice"`
			Variants []struct {
				Price     float64 `json:"price"`
				Currency  string  `json:"currency"`
				IsDefault bool    `json:"isDefault"`
			} `json:"variants"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil {
		return ProductSnapshot{}, fmt.Errorf("decode product response: %w", err)
	}
	if !envelope.Success {
		return ProductSnapshot{}, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Product service returned unsuccessful response", nil)
	}

	price := envelope.Data.MinPrice
	currency := "VND"
	for _, variant := range envelope.Data.Variants {
		if variant.IsDefault {
			price = variant.Price
			if variant.Currency != "" {
				currency = variant.Currency
			}
			break
		}
		if variant.Currency != "" {
			currency = variant.Currency
		}
	}

	imageURL := ""
	if len(envelope.Data.Images) > 0 {
		imageURL = envelope.Data.Images[0]
	}

	return ProductSnapshot{
		ProductID: envelope.Data.ID,
		SellerID:  envelope.Data.SellerID,
		Name:      envelope.Data.Name,
		ImageURL:  imageURL,
		Status:    envelope.Data.Status,
		Price:     price,
		Currency:  currency,
	}, nil
}
