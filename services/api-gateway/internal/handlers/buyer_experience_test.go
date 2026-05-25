package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

func TestBuyerExperienceProductsMapsUpstreamContractAndSanitizesQuery(t *testing.T) {
	var receivedQuery string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedQuery = r.URL.RawQuery
		_, _ = w.Write([]byte(`{
			"success": true,
			"data": [{"id":"p-1","name":"Phone Pro","slug":"phone-pro","categoryId":"phone","brand":"DT","images":["https://cdn/p-1.webp"],"minPrice":100,"variants":[{"sku":"sku-1","name":"Default","price":80,"currency":"vnd","compareAtPrice":100,"isDefault":true}]}],
			"meta": {"pagination":{"page":2,"pageSize":100,"totalItems":101,"totalPages":2}}
		}`))
	}))
	defer upstream.Close()

	handler := NewBuyerExperienceHandler(upstream.URL, time.Second)
	request := httptest.NewRequest(http.MethodGet, "/?page=2&pageSize=999&sortOrder=INVALID&search=%20phone%20", nil)
	recorder := httptest.NewRecorder()

	handler.Products(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(receivedQuery, "pageSize=100") || strings.Contains(receivedQuery, "sortOrder") {
		t.Fatalf("unexpected sanitized query: %s", receivedQuery)
	}

	var payload struct {
		Data struct {
			Items []productSearchItem `json:"items"`
		} `json:"data"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	item := payload.Data.Items[0]
	if item.Price != 80 || item.Currency != "VND" || item.DiscountPercent != 20 {
		t.Fatalf("unexpected mapped product: %+v", item)
	}
}

func TestBuyerExperienceHomeBuildsSectionsFromProducts(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"success":true,"data":[{"id":"p-1","name":"Running Shoes","categoryId":"footwear","images":["https://cdn/shoe.webp"],"minPrice":45,"variants":[]}]}`))
	}))
	defer upstream.Close()

	handler := NewBuyerExperienceHandler(upstream.URL, time.Second)
	recorder := httptest.NewRecorder()
	handler.Home(recorder, httptest.NewRequest(http.MethodGet, "/", nil))

	var payload struct {
		Data struct {
			Keywords   []string `json:"keywords"`
			Categories []any    `json:"categories"`
			FlashSale  []struct {
				ID string `json:"id"`
			} `json:"flashSaleItems"`
			Recommendations []any `json:"recommendationProducts"`
		} `json:"data"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(payload.Data.Categories) != 1 || len(payload.Data.Recommendations) != 1 || payload.Data.Keywords[0] != "running shoes" {
		t.Fatalf("expected derived home sections, got %+v", payload.Data)
	}
	if len(payload.Data.FlashSale) != 1 || payload.Data.FlashSale[0].ID != "p-1" {
		t.Fatalf("expected flash sale card to navigate using the product id, got %+v", payload.Data.FlashSale)
	}
}

func TestBuyerExperienceProductDetailForwardsUpstreamFailure(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"success":false,"error":{"message":"Product not found"}}`))
	}))
	defer upstream.Close()

	handler := NewBuyerExperienceHandler(upstream.URL, time.Second)
	router := chi.NewRouter()
	router.Get("/products/{productId}", handler.ProductDetail)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/products/missing", nil))

	if recorder.Code != http.StatusNotFound || !strings.Contains(recorder.Body.String(), "Product not found") {
		t.Fatalf("expected forwarded missing product error, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestBuyerExperienceProductDetailMapsInventoryAndDefaultSku(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"success":true,"data":{"id":"p-1","sellerId":"seller-1","sellerCode":"SEL0000001","name":"Phone","slug":"phone","categoryId":"phone","status":"ACTIVE","attributes":{"availableStock":12},"images":["https://cdn/phone.webp"],"minPrice":99,"variants":[{"sku":"phone-black","name":"Black","price":99,"currency":"VND","isDefault":true}]}}`))
	}))
	defer upstream.Close()

	handler := NewBuyerExperienceHandler(upstream.URL, time.Second)
	router := chi.NewRouter()
	router.Get("/products/{productId}", handler.ProductDetail)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/products/p-1", nil))

	var payload struct {
		Data struct {
			DefaultSKU string `json:"defaultSku"`
			Stock      int    `json:"stock"`
			SellerCode string `json:"sellerCode"`
		} `json:"data"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Data.DefaultSKU != "phone-black" || payload.Data.Stock != 12 || payload.Data.SellerCode != "SEL0000001" {
		t.Fatalf("unexpected product inventory mapping: %+v", payload.Data)
	}
}
