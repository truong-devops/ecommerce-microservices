package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"payment-service-go/internal/domain"
)

func TestOrderClientGetOrderByIDSuccess(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer token-123" {
			t.Fatalf("missing or invalid auth header: %s", r.Header.Get("Authorization"))
		}
		if r.URL.Path != "/api/v1/orders/order-1" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{"id":"order-1","userId":"user-1","status":"PENDING","currency":"USD","totalAmount":120.5}}`))
	}))
	defer srv.Close()

	client := NewOrderClient(srv.URL+"/api/v1", 2*time.Second)
	order, err := client.GetOrderByID(context.Background(), "order-1", "token-123")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if order == nil {
		t.Fatalf("expected order, got nil")
	}
	if order.ID != "order-1" || order.UserID != "user-1" || order.Currency != "USD" {
		t.Fatalf("unexpected order snapshot: %+v", order)
	}
}

func TestCanAttachIntentToExistingPayment(t *testing.T) {
	t.Parallel()

	payment := domainPayment("PENDING", nil, map[string]any{"autoCreated": true})
	if !canAttachIntentToExistingPayment(payment) {
		t.Fatalf("expected auto-created pending payment to be attachable")
	}

	withProviderID := domainPayment("PENDING", strPtr("prov-1"), map[string]any{"autoCreated": true})
	if canAttachIntentToExistingPayment(withProviderID) {
		t.Fatalf("expected payment with provider id not attachable")
	}

	manualPayment := domainPayment("PENDING", nil, map[string]any{"autoCreated": false})
	if canAttachIntentToExistingPayment(manualPayment) {
		t.Fatalf("expected non auto-created payment not attachable")
	}
}

func domainPayment(status string, providerPaymentID *string, metadata map[string]any) (p domain.Payment) {
	p.Status = domain.PaymentStatus(status)
	p.ProviderPaymentID = providerPaymentID
	p.Metadata = metadata
	return p
}
