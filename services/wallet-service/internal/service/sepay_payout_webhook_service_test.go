package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"testing"
	"time"

	"wallet-service/internal/config"
	"wallet-service/internal/repository"

	"go.uber.org/zap"
)

type fakeSePayPayoutWebhookStore struct {
	input repository.SePayPayoutWebhookInput
	calls int
}

func (f *fakeSePayPayoutWebhookStore) ProcessSePayPayoutWebhook(_ context.Context, input repository.SePayPayoutWebhookInput) (repository.SePayPayoutWebhookResult, error) {
	f.input = input
	f.calls++
	return repository.SePayPayoutWebhookResult{Outcome: "MATCHED", PayoutID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}, nil
}

func TestSePayPayoutWebhookMatchesOutgoingTransaction(t *testing.T) {
	store := &fakeSePayPayoutWebhookStore{}
	svc := NewSePayPayoutWebhookService(store, config.SePayPayoutWebhookConfig{
		Enabled: true, SourceAccountNumber: "1000 426 2634", AuthMode: "apikey", APIKey: "secret-key",
	}, zap.NewNop())
	headers := http.Header{}
	headers.Set("Authorization", "Apikey secret-key")
	body := []byte(`{
		"id": 12345,
		"gateway": "TPBank",
		"transactionDate": "2026-10-18 10:30:00",
		"accountNumber": "10004262634",
		"content": "IBFT EMALL BBBBBBBBBBBB payout",
		"transferType": "out",
		"transferAmount": 89000,
		"referenceCode": "FT-12345"
	}`)

	result, err := svc.Handle(context.Background(), headers, body)
	if err != nil {
		t.Fatal(err)
	}
	if result.Outcome != "MATCHED" || store.calls != 1 {
		t.Fatalf("result=%+v calls=%d", result, store.calls)
	}
	if store.input.TransactionID != "12345" || store.input.TransferCode != "EMALLBBBBBBBBBBBB" || store.input.AmountMinor != 89_000 {
		t.Fatalf("unexpected repository input: %+v", store.input)
	}
	wantTime := time.Date(2026, 10, 18, 3, 30, 0, 0, time.UTC)
	if !store.input.TransactionAt.Equal(wantTime) {
		t.Fatalf("transaction time=%s want=%s", store.input.TransactionAt, wantTime)
	}
}

func TestSePayPayoutWebhookIgnoresIncomingTransaction(t *testing.T) {
	store := &fakeSePayPayoutWebhookStore{}
	svc := NewSePayPayoutWebhookService(store, config.SePayPayoutWebhookConfig{
		Enabled: true, SourceAccountNumber: "10004262634", AuthMode: "none",
	}, zap.NewNop())
	body := []byte(`{"id":1,"accountNumber":"10004262634","transferType":"in","transferAmount":89000}`)

	result, err := svc.Handle(context.Background(), nil, body)
	if err != nil {
		t.Fatal(err)
	}
	if result.Outcome != "IGNORED_NOT_OUTGOING" || store.calls != 0 {
		t.Fatalf("result=%+v calls=%d", result, store.calls)
	}
}

func TestSePayPayoutWebhookRejectsInvalidAPIKey(t *testing.T) {
	store := &fakeSePayPayoutWebhookStore{}
	svc := NewSePayPayoutWebhookService(store, config.SePayPayoutWebhookConfig{
		Enabled: true, SourceAccountNumber: "10004262634", AuthMode: "apikey", APIKey: "secret-key",
	}, zap.NewNop())
	body := []byte(`{"id":1,"accountNumber":"10004262634","transferType":"out","transferAmount":89000}`)

	_, err := svc.Handle(context.Background(), http.Header{}, body)
	if !errors.Is(err, ErrSePayPayoutWebhookUnauthorized) {
		t.Fatalf("err=%v, want unauthorized", err)
	}
	if store.calls != 0 {
		t.Fatalf("store should not be called, calls=%d", store.calls)
	}
}

func TestSePayPayoutWebhookAcceptsHMAC(t *testing.T) {
	store := &fakeSePayPayoutWebhookStore{}
	now := time.Date(2026, 10, 18, 4, 0, 0, 0, time.UTC)
	svc := NewSePayPayoutWebhookService(store, config.SePayPayoutWebhookConfig{
		Enabled: true, SourceAccountNumber: "10004262634", AuthMode: "hmac",
		Secrets: []string{"old-secret", "current-secret"}, TimestampToleranceSeconds: 300,
	}, zap.NewNop())
	svc.now = func() time.Time { return now }
	body := []byte(`{"id":2,"accountNumber":"10004262634","content":"EMALLBBBBBBBBBBBB","transferType":"out","transferAmount":89000}`)
	timestamp := "1792296000"
	mac := hmac.New(sha256.New, []byte("current-secret"))
	mac.Write([]byte(timestamp + "."))
	mac.Write(body)
	headers := http.Header{}
	headers.Set("X-SePay-Timestamp", timestamp)
	headers.Set("X-SePay-Signature", "sha256="+hex.EncodeToString(mac.Sum(nil)))

	if _, err := svc.Handle(context.Background(), headers, body); err != nil {
		t.Fatal(err)
	}
	if store.calls != 1 {
		t.Fatalf("store calls=%d, want 1", store.calls)
	}
}

func TestExtractPayoutTransferCodeRejectsNonHexSuffix(t *testing.T) {
	if got := extractPayoutTransferCode("EMALL ABCDEFGHIJKL"); got != "" {
		t.Fatalf("unexpected code %q", got)
	}
}
