package handler

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"wallet-service/internal/config"
	"wallet-service/internal/repository"
	"wallet-service/internal/service"

	"go.uber.org/zap"
)

type handlerSePayPayoutStore struct {
	calls int
}

func (s *handlerSePayPayoutStore) ProcessSePayPayoutWebhook(_ context.Context, _ repository.SePayPayoutWebhookInput) (repository.SePayPayoutWebhookResult, error) {
	s.calls++
	return repository.SePayPayoutWebhookResult{Outcome: "MATCHED"}, nil
}

func TestSePayPayoutWebhookHandlerReturnsSePaySuccessShape(t *testing.T) {
	store := &handlerSePayPayoutStore{}
	svc := service.NewSePayPayoutWebhookService(store, config.SePayPayoutWebhookConfig{
		Enabled: true, SourceAccountNumber: "10004262634", AuthMode: "apikey", APIKey: "secret-key",
	}, zap.NewNop())
	handler := NewSePayPayoutWebhookHandler(svc)
	body := []byte(`{"id":123,"accountNumber":"10004262634","content":"EMALLBBBBBBBBBBBB","transferType":"out","transferAmount":89000}`)
	request := httptest.NewRequest(http.MethodPost, "/api/v1/wallets/webhooks/sepay/payouts", bytes.NewReader(body))
	request.Header.Set("Authorization", "Apikey secret-key")
	response := httptest.NewRecorder()

	handler.Handle(response, request)

	if response.Code != http.StatusOK || response.Body.String() != "{\"success\":true}\n" {
		t.Fatalf("status=%d body=%q", response.Code, response.Body.String())
	}
	if store.calls != 1 {
		t.Fatalf("store calls=%d, want 1", store.calls)
	}
}

func TestSePayPayoutWebhookHandlerRejectsInvalidAuthentication(t *testing.T) {
	store := &handlerSePayPayoutStore{}
	svc := service.NewSePayPayoutWebhookService(store, config.SePayPayoutWebhookConfig{
		Enabled: true, SourceAccountNumber: "10004262634", AuthMode: "apikey", APIKey: "secret-key",
	}, zap.NewNop())
	handler := NewSePayPayoutWebhookHandler(svc)
	request := httptest.NewRequest(http.MethodPost, "/api/v1/wallets/webhooks/sepay/payouts", bytes.NewReader([]byte(`{}`)))
	response := httptest.NewRecorder()

	handler.Handle(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d body=%q", response.Code, response.Body.String())
	}
	if store.calls != 0 {
		t.Fatalf("store should not be called, calls=%d", store.calls)
	}
}
