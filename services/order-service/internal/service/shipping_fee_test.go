package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"order-service/internal/domain"
)

func TestCalculateShippingFee(t *testing.T) {
	tests := []struct {
		name        string
		origin      string
		destination string
		want        float64
	}{
		{
			name:        "same province",
			origin:      "Dong Nai",
			destination: "Đồng Nai",
			want:        10000,
		},
		{
			name:        "same region",
			origin:      "Dong Nai",
			destination: "Bến Tre",
			want:        20000,
		},
		{
			name:        "cross region",
			origin:      "Dong Nai",
			destination: "Lâm Đồng",
			want:        30000,
		},
		{
			name:        "province alias",
			origin:      "Thành phố Hồ Chí Minh",
			destination: "Cần Thơ",
			want:        20000,
		},
		{
			name:        "unknown destination uses cross region fee",
			origin:      "Dong Nai",
			destination: "Unknown",
			want:        30000,
		},
		{
			name:        "blank destination has no fee",
			origin:      "Dong Nai",
			destination: "  ",
			want:        0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := calculateShippingFee(tt.origin, tt.destination); got != tt.want {
				t.Fatalf("calculateShippingFee() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestDeriveShippingAmountUsesSellerPickupProvince(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Internal-Service-Token") != "secret" {
			t.Fatalf("missing internal service token")
		}
		if !strings.HasSuffix(r.URL.Path, "/internal/users/11111111-1111-4111-8111-111111111111/pickup-address") {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{"sellerId":"11111111-1111-4111-8111-111111111111","province":"Đồng Nai","provinceCode":"75"}}`))
	}))
	defer server.Close()

	province := "Bến Tre"
	clientShippingAmount := 99999.0
	service := &OrderService{
		sellerProfiles: NewSellerProfileClient(server.URL+"/api/v1", "secret", 2*time.Second),
	}
	req := CreateOrderRequest{
		SellerID:          "11111111-1111-4111-8111-111111111111",
		ShippingAmount:    &clientShippingAmount,
		RecipientProvince: &province,
	}

	got, err := service.deriveShippingAmount(context.Background(), req)
	if err != nil {
		t.Fatalf("deriveShippingAmount() returned error: %v", err)
	}
	if got != 20000 {
		t.Fatalf("deriveShippingAmount() = %v, want 20000", got)
	}
}

func TestDeriveShippingAmountFallsBackToClientAmountWhenProvinceMissing(t *testing.T) {
	clientShippingAmount := 12000.0
	service := &OrderService{}
	req := CreateOrderRequest{ShippingAmount: &clientShippingAmount}

	got, err := service.deriveShippingAmount(context.Background(), req)
	if err != nil {
		t.Fatalf("deriveShippingAmount() returned error: %v", err)
	}
	if got != 12000 {
		t.Fatalf("deriveShippingAmount() = %v, want 12000", got)
	}
}

func TestQuoteShippingReturnsSellerQuotes(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{"sellerId":"11111111-1111-4111-8111-111111111111","province":"Đồng Nai","provinceCode":"75"}}`))
	}))
	defer server.Close()

	service := &OrderService{
		sellerProfiles: NewSellerProfileClient(server.URL+"/api/v1", "secret", 2*time.Second),
	}
	result, err := service.QuoteShipping(context.Background(), domain.UserContext{}, ShippingQuoteRequest{
		SellerIDs:           []string{"11111111-1111-4111-8111-111111111111"},
		DestinationProvince: "Lâm Đồng",
	})
	if err != nil {
		t.Fatalf("QuoteShipping() returned error: %v", err)
	}

	items, ok := result["items"].([]map[string]any)
	if !ok || len(items) != 1 {
		t.Fatalf("unexpected quote items: %#v", result["items"])
	}
	if items[0]["shippingAmount"] != float64(30000) {
		t.Fatalf("shippingAmount = %#v, want 30000", items[0]["shippingAmount"])
	}
}
