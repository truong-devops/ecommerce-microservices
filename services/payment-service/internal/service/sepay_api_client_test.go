package service

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"payment-service-go/internal/config"
)

func TestSePayAPIClientListTransactions(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/transactions/list" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-token" {
			t.Fatalf("unexpected authorization header: %s", got)
		}
		if got := r.URL.Query().Get("account_number"); got != "0010000000355" {
			t.Fatalf("unexpected account_number: %s", got)
		}
		if got := r.URL.Query().Get("since_id"); got != "10" {
			t.Fatalf("unexpected since_id: %s", got)
		}
		if got := r.URL.Query().Get("limit"); got != "2" {
			t.Fatalf("unexpected limit: %s", got)
		}

		_ = json.NewEncoder(w).Encode(map[string]any{
			"status": 200,
			"messages": map[string]any{
				"success": true,
			},
			"transactions": []map[string]any{
				{
					"id":                  "12",
					"bank_brand_name":     "Vietcombank",
					"account_number":      "0010000000355",
					"transaction_date":    "2026-05-31 10:00:00",
					"amount_in":           "235000.00",
					"amount_out":          "0.00",
					"accumulated":         "1235000.00",
					"transaction_content": "EMXABC123DEF456 thanh toan",
					"reference_number":    "FT123",
				},
				{
					"id":                  "11",
					"bank_brand_name":     "Vietcombank",
					"account_number":      "0010000000355",
					"transaction_date":    "2026-05-31 09:00:00",
					"amount_in":           "100000.00",
					"amount_out":          "0.00",
					"accumulated":         "1000000.00",
					"transaction_content": "EMXOLD12345678 thanh toan",
					"reference_number":    "FT122",
				},
			},
		})
	}))
	defer server.Close()

	client := NewSePayAPIClient(config.SePayConfig{
		APIBaseURL:        server.URL,
		APIToken:          "test-token",
		BankAccountNumber: "0010000000355",
	}, server.Client())

	items, err := client.ListTransactions(t.Context(), ListSePayTransactionsInput{SinceID: "10", Limit: 2})
	if err != nil {
		t.Fatalf("list transactions: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 transactions, got %d", len(items))
	}
	if items[0].ID != "11" || items[1].ID != "12" {
		t.Fatalf("expected transactions sorted ascending by id, got %s, %s", items[0].ID, items[1].ID)
	}
}

func TestSePayTransactionToWebhookPayload(t *testing.T) {
	payload, raw, body, err := sePayTransactionToWebhookPayload(SePayTransaction{
		ID:                 "48673",
		BankBrandName:      "Vietcombank",
		AccountNumber:      "0010000000355",
		SubAccount:         "VCB001",
		TransactionDate:    "2026-05-31 10:00:00",
		AmountIn:           "235000.00",
		AmountOut:          "0.00",
		Accumulated:        "1235000.00",
		TransactionContent: "Thanh toan EMXABC123DEF456",
		ReferenceNumber:    "FT123",
		BankAccountID:      "19",
	}, "EMX")
	if err != nil {
		t.Fatalf("convert transaction: %v", err)
	}
	if payload.ProviderEventID() != "48673" {
		t.Fatalf("unexpected provider event id: %s", payload.ProviderEventID())
	}
	if payload.Code != "EMXABC123DEF456" {
		t.Fatalf("unexpected code: %s", payload.Code)
	}
	if payload.TransferType != "in" || payload.TransferAmount != 235000 {
		t.Fatalf("unexpected transfer mapping: %s %d", payload.TransferType, payload.TransferAmount)
	}
	if raw["source"] != "sepay-reconciliation" || raw["bankAccountId"] != "19" {
		t.Fatalf("expected reconciliation metadata in raw payload: %#v", raw)
	}
	if len(body) == 0 {
		t.Fatalf("expected raw body")
	}
}

func TestSePayIDAfterUsesNumericComparison(t *testing.T) {
	if !sePayIDAfter("100", "99") {
		t.Fatalf("expected 100 after 99")
	}
	if sePayIDAfter("99", "100") {
		t.Fatalf("expected 99 not after 100")
	}
	if sePayIDAfter("100", "100") {
		t.Fatalf("expected same id not after cursor")
	}
}
