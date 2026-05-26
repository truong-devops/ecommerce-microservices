package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestProductCatalogClientGetProductByIDSuccess(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/products/prod-1" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{"id":"prod-1","sellerId":"5c09ac36-32a4-40b3-a1fb-73eb6cce6cca","name":"Keyboard","status":"ACTIVE","variants":[{"sku":"KB-001","name":"Black","price":39.99,"currency":"USD"}]}}`))
	}))
	defer srv.Close()

	client := NewProductCatalogClient(srv.URL+"/api/v1", 2*time.Second)
	product, err := client.GetProductByID(context.Background(), "prod-1")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if product == nil {
		t.Fatalf("expected product, got nil")
	}
	if product.ID != "prod-1" || product.SellerID != "5c09ac36-32a4-40b3-a1fb-73eb6cce6cca" || product.Status != "ACTIVE" {
		t.Fatalf("unexpected product: %+v", product)
	}
	if len(product.Variants) != 1 || product.Variants[0].SKU != "KB-001" {
		t.Fatalf("unexpected variants: %+v", product.Variants)
	}
}

func TestProductCatalogClientGetProductByIDNotFound(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	defer srv.Close()

	client := NewProductCatalogClient(srv.URL+"/api/v1", 2*time.Second)
	product, err := client.GetProductByID(context.Background(), "missing")
	if err != nil {
		t.Fatalf("expected no error on 404, got %v", err)
	}
	if product != nil {
		t.Fatalf("expected nil product, got %+v", product)
	}
}
