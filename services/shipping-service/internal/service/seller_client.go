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

type SellerClient struct {
	baseURL string
	token   string
	client  *http.Client
}

type SellerPickupAddress struct {
	SellerID     string
	ShopName     string
	SenderName   string
	Phone        string
	Address      string
	Province     string
	ProvinceCode string
	Ward         string
	WardCode     string
}

func NewSellerClient(baseURL, token string, timeout time.Duration) *SellerClient {
	return &SellerClient{
		baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		token:   strings.TrimSpace(token),
		client:  &http.Client{Timeout: timeout},
	}
}

func (c *SellerClient) GetPickupAddress(ctx context.Context, sellerID string) (*SellerPickupAddress, error) {
	if c == nil || c.baseURL == "" || c.token == "" {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Seller profile dependency is not configured", nil)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/internal/users/"+url.PathEscape(strings.TrimSpace(sellerID))+"/pickup-address", nil)
	if err != nil {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Seller profile dependency is unavailable", nil)
	}
	req.Header.Set("accept", "application/json")
	req.Header.Set("X-Internal-Service-Token", c.token)

	res, err := c.client.Do(req)
	if err != nil {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Seller profile dependency is unavailable", nil)
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusNotFound {
		return nil, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, "Seller pickup profile not found", nil)
	}
	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Seller profile dependency rejected internal request", nil)
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Seller profile dependency returned non-success response", nil)
	}

	var envelope struct {
		Success bool `json:"success"`
		Data    struct {
			SellerID     string  `json:"sellerId"`
			ShopName     string  `json:"shopName"`
			SenderName   string  `json:"senderName"`
			Phone        *string `json:"phone"`
			Address      *string `json:"address"`
			Province     *string `json:"province"`
			ProvinceCode *string `json:"provinceCode"`
			Ward         *string `json:"ward"`
			WardCode     *string `json:"wardCode"`
		} `json:"data"`
	}
	if err := json.NewDecoder(res.Body).Decode(&envelope); err != nil || !envelope.Success {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Seller profile payload is invalid", nil)
	}

	return &SellerPickupAddress{
		SellerID:     strings.TrimSpace(envelope.Data.SellerID),
		ShopName:     strings.TrimSpace(envelope.Data.ShopName),
		SenderName:   strings.TrimSpace(envelope.Data.SenderName),
		Phone:        trimDeref(envelope.Data.Phone),
		Address:      trimDeref(envelope.Data.Address),
		Province:     trimDeref(envelope.Data.Province),
		ProvinceCode: trimDeref(envelope.Data.ProvinceCode),
		Ward:         trimDeref(envelope.Data.Ward),
		WardCode:     trimDeref(envelope.Data.WardCode),
	}, nil
}

func trimDeref(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}
