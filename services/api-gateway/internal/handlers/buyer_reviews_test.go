package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestBuyerReviewCreateVerifiesDeliveredOrderBeforeForwarding(t *testing.T) {
	var forwarded bool
	order := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer token" {
			t.Fatal("expected authorization forwarded to order service")
		}
		_, _ = w.Write([]byte(`{"success":true,"data":{"status":"DELIVERED","items":[{"productId":"product-1"}]}}`))
	}))
	defer order.Close()
	review := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		forwarded = true
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"success":true,"data":{"id":"review-1"}}`))
	}))
	defer review.Close()

	handler := NewBuyerReviewHandler(order.URL, review.URL, time.Second)
	request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"orderId":"order-1","productId":"product-1"}`))
	request.Header.Set("Authorization", "Bearer token")
	recorder := httptest.NewRecorder()
	handler.Create(recorder, request)

	if recorder.Code != http.StatusCreated || !forwarded {
		t.Fatalf("expected submitted review, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestBuyerReviewCreateRejectsOrderWithoutProduct(t *testing.T) {
	order := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"success":true,"data":{"status":"DELIVERED","items":[{"productId":"other-product"}]}}`))
	}))
	defer order.Close()

	handler := NewBuyerReviewHandler(order.URL, "http://127.0.0.1:1", time.Second)
	recorder := httptest.NewRecorder()
	handler.Create(recorder, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"orderId":"order-1","productId":"product-1"}`)))

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected forbidden review, got %d: %s", recorder.Code, recorder.Body.String())
	}
}
