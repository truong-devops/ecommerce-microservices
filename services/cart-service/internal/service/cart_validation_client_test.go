package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"cart-service/internal/domain"
)

func TestValidateAndResolveItemSuccess(t *testing.T) {
	t.Parallel()

	productSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{"name":"Keyboard","variants":[{"sku":"KB-001","name":"Black","price":39.99,"currency":"USD"}]}}`))
	}))
	defer productSrv.Close()

	inventorySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer inventorySrv.Close()

	client := NewCartValidationClient(true, productSrv.URL, inventorySrv.URL, 2*time.Second)
	resolved, issues, err := client.ValidateAndResolveItem(context.Background(), domain.CartItem{
		ProductID: "product-1",
		SKU:       "KB-001",
		Quantity:  1,
	}, "USD", true)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(issues) != 0 {
		t.Fatalf("expected no issues, got %+v", issues)
	}
	if resolved.UnitPrice != 39.99 || resolved.Name != "Black" || resolved.Currency != "USD" {
		t.Fatalf("unexpected resolved item: %+v", resolved)
	}
}

func TestValidateAndResolveItemMissingVariant(t *testing.T) {
	t.Parallel()

	productSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{"name":"Keyboard","variants":[{"sku":"KB-001","name":"Black","price":39.99,"currency":"USD"}]}}`))
	}))
	defer productSrv.Close()

	client := NewCartValidationClient(true, productSrv.URL, "", 2*time.Second)
	_, issues, err := client.ValidateAndResolveItem(context.Background(), domain.CartItem{
		ProductID: "product-1",
		SKU:       "KB-999",
		Quantity:  1,
	}, "USD", true)
	if err != nil {
		t.Fatalf("expected no dependency error, got %v", err)
	}
	if len(issues) == 0 {
		t.Fatalf("expected validation issues for missing variant")
	}
}
