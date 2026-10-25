package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"wallet-service/internal/domain"
	"wallet-service/internal/httpx"
	"wallet-service/internal/repository"

	"go.uber.org/zap"
)

type fakePayoutStore struct {
	bankInput    repository.UpsertBankAccountInput
	createInput  repository.CreatePayoutInput
	createResult domain.Payout
	createReplay bool
	createErr    error
	jobs         []repository.PayoutJob
	staleJobs    []repository.PayoutJob
	completed    []repository.CompletePayoutInput
	pending      int
	rescheduled  int
	summaryInput repository.PayoutSummaryInput
	summary      domain.PayoutSummary
}

func (f *fakePayoutStore) UpsertBankAccount(_ context.Context, input repository.UpsertBankAccountInput) (domain.BankAccount, error) {
	f.bankInput = input
	return domain.BankAccount{BankCode: input.BankCode, MaskedAccountNumber: "****" + input.Last4}, nil
}
func (f *fakePayoutStore) GetBankAccount(context.Context, string, domain.WalletOwnerType, string) (domain.BankAccount, error) {
	return domain.BankAccount{}, nil
}
func (f *fakePayoutStore) CreatePayout(_ context.Context, input repository.CreatePayoutInput) (domain.Payout, bool, error) {
	f.createInput = input
	return f.createResult, f.createReplay, f.createErr
}
func (f *fakePayoutStore) GetPayout(context.Context, string, domain.WalletOwnerType, string) (domain.Payout, error) {
	return domain.Payout{}, nil
}
func (f *fakePayoutStore) ListPayouts(context.Context, repository.ListPayoutsInput) (domain.PayoutPage, error) {
	return domain.PayoutPage{}, nil
}
func (f *fakePayoutStore) GetPayoutSummary(_ context.Context, input repository.PayoutSummaryInput) (domain.PayoutSummary, error) {
	f.summaryInput = input
	return f.summary, nil
}
func (f *fakePayoutStore) ClaimPayouts(context.Context, time.Time, int) ([]repository.PayoutJob, error) {
	jobs := f.jobs
	f.jobs = nil
	return jobs, nil
}
func (f *fakePayoutStore) FindStalePayouts(context.Context, time.Time, int) ([]repository.PayoutJob, error) {
	return f.staleJobs, nil
}
func (f *fakePayoutStore) CompletePayout(_ context.Context, input repository.CompletePayoutInput) (bool, error) {
	f.completed = append(f.completed, input)
	return true, nil
}
func (f *fakePayoutStore) MarkPayoutPending(context.Context, string, string, string, time.Time) error {
	f.pending++
	return nil
}
func (f *fakePayoutStore) ReschedulePayout(context.Context, string, time.Time) error {
	f.rescheduled++
	return nil
}

func testCipher(t *testing.T) *BankAccountCipher {
	t.Helper()
	cipher, err := NewBankAccountCipher("unit-test-bank-account-encryption-key")
	if err != nil {
		t.Fatal(err)
	}
	return cipher
}

func TestBankAccountCipherRoundTrip(t *testing.T) {
	cipher := testCipher(t)
	ciphertext, nonce, err := cipher.Encrypt("0123456789")
	if err != nil {
		t.Fatal(err)
	}
	if string(ciphertext) == "0123456789" {
		t.Fatal("account number was not encrypted")
	}
	plaintext, err := cipher.Decrypt(ciphertext, nonce)
	if err != nil || plaintext != "0123456789" {
		t.Fatalf("decrypt=%q err=%v", plaintext, err)
	}
}

func TestUpsertBankAccountEncryptsAndMasksNumber(t *testing.T) {
	store := &fakePayoutStore{}
	service := NewPayoutService(store, testCipher(t), true, 10_000, 10_000_000, time.Hour)
	account, err := service.UpsertMyBankAccount(context.Background(), domain.UserContext{UserID: testSellerID, Role: domain.RoleSeller}, "vcb", "0123456789", "test seller")
	if err != nil {
		t.Fatal(err)
	}
	if account.MaskedAccountNumber != "****6789" || store.bankInput.Last4 != "6789" {
		t.Fatalf("account=%+v input=%+v", account, store.bankInput)
	}
	if string(store.bankInput.EncryptedAccountNumber) == "0123456789" || len(store.bankInput.EncryptionNonce) == 0 {
		t.Fatal("account number was not securely prepared")
	}
}

func TestCreatePayoutValidatesFeatureFlagAndIdempotency(t *testing.T) {
	user := domain.UserContext{UserID: testSellerID, Role: domain.RoleSeller}
	disabled := NewPayoutService(&fakePayoutStore{}, testCipher(t), false, 10_000, 10_000_000, time.Hour)
	if _, _, err := disabled.CreateMyPayout(context.Background(), user, "valid-key", 20_000, "VND"); err == nil {
		t.Fatal("expected disabled payout to fail")
	}
	store := &fakePayoutStore{createResult: domain.Payout{ID: testPaymentID}}
	enabled := NewPayoutService(store, testCipher(t), true, 10_000, 10_000_000, time.Hour)
	if _, _, err := enabled.CreateMyPayout(context.Background(), user, "short", 20_000, "VND"); err == nil {
		t.Fatal("expected short idempotency key to fail")
	}
	if _, _, err := enabled.CreateMyPayout(context.Background(), user, "valid-key-0001", 20_000, "VND"); err != nil {
		t.Fatal(err)
	}
	if store.createInput.OwnerID != testSellerID || store.createInput.OwnerType != domain.WalletOwnerSeller || store.createInput.AmountMinor != 20_000 || store.createInput.RequestHash == "" {
		t.Fatalf("unexpected create input: %+v", store.createInput)
	}
}

func TestCreatePayoutRequiresVerifiedBankAccount(t *testing.T) {
	store := &fakePayoutStore{createErr: repository.ErrBankAccountNotVerified}
	service := NewPayoutService(store, testCipher(t), true, 10_000, 10_000_000, time.Hour)
	_, _, err := service.CreateMyPayout(
		context.Background(),
		domain.UserContext{UserID: testSellerID, Role: domain.RoleSeller},
		"verified-bank-check",
		20_000,
		"VND",
	)
	var appErr *httpx.AppError
	if !errors.As(err, &appErr) || appErr.Code != domain.ErrorCodeBankAccountNotVerified {
		t.Fatalf("expected bank verification error, got %v", err)
	}
}

func TestCustomerRefundPayoutUsesCustomerWalletAndAllowsSmallAmount(t *testing.T) {
	store := &fakePayoutStore{createResult: domain.Payout{ID: testPaymentID}}
	service := NewPayoutService(store, testCipher(t), true, 10_000, 10_000_000, time.Hour)

	_, _, err := service.CreateMyPayout(
		context.Background(),
		domain.UserContext{UserID: testCustomerID, Role: domain.RoleCustomer},
		"customer-refund-key",
		5_000,
		"VND",
	)
	if err != nil {
		t.Fatalf("create customer refund payout: %v", err)
	}
	if store.createInput.OwnerID != testCustomerID || store.createInput.OwnerType != domain.WalletOwnerCustomer || store.createInput.PayoutType != "CUSTOMER_REFUND" {
		t.Fatalf("unexpected customer payout input: %+v", store.createInput)
	}
}

func TestGetPayoutSummaryUsesAuthenticatedSeller(t *testing.T) {
	store := &fakePayoutStore{summary: domain.PayoutSummary{PaidThisWeek: 20_000, PaidThisMonth: 50_000, TotalPaidOut: 90_000}}
	service := NewPayoutService(store, testCipher(t), true, 10_000, 10_000_000, time.Hour)
	weekStart := time.Date(2026, 10, 12, 0, 0, 0, 0, time.FixedZone("ICT", 7*60*60))
	monthStart := time.Date(2026, 10, 1, 0, 0, 0, 0, time.FixedZone("ICT", 7*60*60))
	summary, err := service.GetMyPayoutSummary(context.Background(), domain.UserContext{UserID: testSellerID, Role: domain.RoleSeller}, weekStart, monthStart)
	if err != nil || summary.PaidThisMonth != 50_000 {
		t.Fatalf("summary=%+v err=%v", summary, err)
	}
	if store.summaryInput.OwnerID != testSellerID || store.summaryInput.OwnerType != domain.WalletOwnerSeller || !store.summaryInput.WeekStart.Equal(weekStart.UTC()) {
		t.Fatalf("unexpected summary input: %+v", store.summaryInput)
	}
}

func TestMockPayoutProviderModes(t *testing.T) {
	for _, test := range []struct {
		mode string
		want domain.PayoutStatus
	}{{"success", domain.PayoutStatusSucceeded}, {"failure", domain.PayoutStatusFailed}, {"pending", domain.PayoutStatusProcessing}} {
		provider := NewMockPayoutProvider(test.mode)
		result, err := provider.CreatePayout(context.Background(), ProviderPayoutRequest{PayoutID: testPaymentID})
		if err != nil || result.Status != test.want {
			t.Fatalf("mode=%s result=%+v err=%v", test.mode, result, err)
		}
		queried, err := provider.GetPayout(context.Background(), result.ProviderReference, "key")
		if err != nil || queried.Status != test.want {
			t.Fatalf("reconcile mode=%s result=%+v err=%v", test.mode, queried, err)
		}
	}
}

func TestPayoutWorkerCompletesSuccessAndFailure(t *testing.T) {
	for _, test := range []struct {
		mode string
		want domain.PayoutStatus
	}{{"success", domain.PayoutStatusSucceeded}, {"failure", domain.PayoutStatusFailed}} {
		cipher := testCipher(t)
		encrypted, nonce, err := cipher.Encrypt("0123456789")
		if err != nil {
			t.Fatal(err)
		}
		store := &fakePayoutStore{jobs: []repository.PayoutJob{{PayoutID: testPaymentID, IdempotencyKey: "provider-key", AmountMinor: 20_000, Currency: "VND", BankCode: "VCB", AccountHolderName: "TEST", EncryptedAccountNumber: encrypted, EncryptionNonce: nonce}}}
		worker := NewPayoutWorker(store, NewMockPayoutProvider(test.mode), cipher, zap.NewNop(), time.Second, time.Second, time.Second, 10)
		processed, err := worker.Process(context.Background())
		if err != nil || processed != 1 {
			t.Fatalf("mode=%s processed=%d err=%v", test.mode, processed, err)
		}
		if len(store.completed) != 1 || store.completed[0].Status != test.want {
			t.Fatalf("mode=%s completion=%+v", test.mode, store.completed)
		}
	}
}

func TestPayoutWorkerReschedulesTransientProviderError(t *testing.T) {
	cipher := testCipher(t)
	encrypted, nonce, _ := cipher.Encrypt("0123456789")
	store := &fakePayoutStore{jobs: []repository.PayoutJob{{PayoutID: testPaymentID, EncryptedAccountNumber: encrypted, EncryptionNonce: nonce}}}
	worker := NewPayoutWorker(store, failingPayoutProvider{}, cipher, zap.NewNop(), time.Second, time.Second, time.Second, 10)
	if processed, err := worker.Process(context.Background()); err != nil || processed != 0 || store.rescheduled != 1 {
		t.Fatalf("processed=%d rescheduled=%d err=%v", processed, store.rescheduled, err)
	}
}

func TestPayoutWorkerReconcilesStalePayout(t *testing.T) {
	cipher := testCipher(t)
	encrypted, nonce, _ := cipher.Encrypt("0123456789")
	providerReference := "mock_" + testPaymentID
	store := &fakePayoutStore{staleJobs: []repository.PayoutJob{{PayoutID: testPaymentID, IdempotencyKey: "provider-key", AmountMinor: 20_000, Currency: "VND", BankCode: "VCB", AccountHolderName: "TEST", EncryptedAccountNumber: encrypted, EncryptionNonce: nonce, ProviderReference: &providerReference}}}
	worker := NewPayoutWorker(store, NewMockPayoutProvider("success"), cipher, zap.NewNop(), time.Second, time.Second, time.Second, 10)
	processed, err := worker.Reconcile(context.Background())
	if err != nil || processed != 1 || len(store.completed) != 1 || store.completed[0].Status != domain.PayoutStatusSucceeded {
		t.Fatalf("processed=%d completed=%+v err=%v", processed, store.completed, err)
	}
}

type failingPayoutProvider struct{}

func (failingPayoutProvider) Name() string { return "failure" }
func (failingPayoutProvider) CreatePayout(context.Context, ProviderPayoutRequest) (ProviderPayoutResult, error) {
	return ProviderPayoutResult{}, errors.New("temporary unavailable")
}
func (failingPayoutProvider) GetPayout(context.Context, string, string) (ProviderPayoutResult, error) {
	return ProviderPayoutResult{}, errors.New("temporary unavailable")
}

var _ PayoutStore = (*fakePayoutStore)(nil)
