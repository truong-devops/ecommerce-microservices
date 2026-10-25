package service

import (
	"context"
	"testing"

	"wallet-service/internal/domain"
	"wallet-service/internal/repository"
)

type fakeAdminStore struct {
	actionInput repository.AdminActionInput
	bankStatus  domain.BankAccountStatus
	frozen      bool
	manualData  repository.ManualPayoutData
	manualInput repository.CompleteManualPayoutInput
}

func (f *fakeAdminStore) GetAdminWalletSummary(context.Context, string) (domain.AdminWalletSummary, error) {
	return domain.AdminWalletSummary{TotalWallets: 2}, nil
}
func (f *fakeAdminStore) ListAdminWallets(context.Context, repository.ListAdminWalletsInput) (domain.AdminWalletPage, error) {
	return domain.AdminWalletPage{}, nil
}
func (f *fakeAdminStore) GetAdminWallet(context.Context, string) (domain.AdminWallet, error) {
	return domain.AdminWallet{}, nil
}
func (f *fakeAdminStore) SetAdminWalletFrozen(_ context.Context, input repository.AdminActionInput, frozen bool) (domain.AdminWallet, error) {
	f.actionInput = input
	f.frozen = frozen
	return domain.AdminWallet{ID: input.WalletID, IsFrozen: frozen}, nil
}
func (f *fakeAdminStore) SetAdminBankAccountStatus(_ context.Context, input repository.AdminActionInput, status domain.BankAccountStatus) (domain.AdminWallet, error) {
	f.actionInput = input
	f.bankStatus = status
	return domain.AdminWallet{ID: input.WalletID}, nil
}
func (f *fakeAdminStore) ListAdminTransactions(context.Context, string, int, int) (domain.TransactionPage, error) {
	return domain.TransactionPage{}, nil
}
func (f *fakeAdminStore) ListAdminPayouts(context.Context, repository.ListAdminPayoutsInput) (domain.AdminPayoutPage, error) {
	return domain.AdminPayoutPage{}, nil
}
func (f *fakeAdminStore) ListAdminAuditLogs(context.Context, repository.ListAdminAuditLogsInput) (domain.AdminAuditLogPage, error) {
	return domain.AdminAuditLogPage{}, nil
}
func (f *fakeAdminStore) PrepareManualPayout(context.Context, repository.PrepareManualPayoutInput) (repository.ManualPayoutData, error) {
	return f.manualData, nil
}
func (f *fakeAdminStore) CompleteManualPayout(_ context.Context, input repository.CompleteManualPayoutInput) (domain.AdminPayout, bool, error) {
	f.manualInput = input
	return domain.AdminPayout{Payout: domain.Payout{ID: input.PayoutID, Status: input.Status}}, true, nil
}

func TestAdminServiceRestrictsModerator(t *testing.T) {
	service := NewAdminService(&fakeAdminStore{}, testCipher(t), true, "manual_vietqr")
	_, err := service.GetSummary(context.Background(), domain.UserContext{
		UserID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", Role: domain.RoleModerator,
	})
	if err == nil {
		t.Fatal("expected moderator to be rejected")
	}
}

func TestAdminServiceRecordsActorAndReasonForBankVerification(t *testing.T) {
	store := &fakeAdminStore{}
	service := NewAdminService(store, testCipher(t), true, "manual_vietqr")
	admin := domain.UserContext{
		UserID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		Email:  "admin@example.com",
		Role:   domain.RoleAdmin,
	}
	walletID := "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
	if _, err := service.SetBankAccountStatus(context.Background(), admin, walletID, "allowlisted", "Bank owner checked"); err != nil {
		t.Fatal(err)
	}
	if store.bankStatus != domain.BankAccountStatusAllowlisted {
		t.Fatalf("status=%s", store.bankStatus)
	}
	if store.actionInput.ActorID != admin.UserID || store.actionInput.ActorEmail != admin.Email || store.actionInput.Reason != "Bank owner checked" {
		t.Fatalf("unexpected audit input: %+v", store.actionInput)
	}
}

func TestAdminServiceRequiresActionReason(t *testing.T) {
	store := &fakeAdminStore{}
	service := NewAdminService(store, testCipher(t), true, "manual_vietqr")
	admin := domain.UserContext{UserID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", Role: domain.RoleSuperAdmin}
	_, err := service.SetWalletFrozen(context.Background(), admin, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", true, " ")
	if err == nil {
		t.Fatal("expected missing reason to fail")
	}
}

func TestAdminServicePreparesManualVietQRAndConfirmsReference(t *testing.T) {
	cipher := testCipher(t)
	encrypted, nonce, err := cipher.Encrypt("0123456789")
	if err != nil {
		t.Fatal(err)
	}
	store := &fakeAdminStore{manualData: repository.ManualPayoutData{
		PayoutID:    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		WalletID:    "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
		OwnerID:     "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
		OwnerType:   domain.WalletOwnerSeller,
		PayoutType:  "SELLER_WITHDRAWAL",
		AmountMinor: 125_000, Currency: "VND", Status: domain.PayoutStatusProcessing,
		BankCode: "VCB", AccountHolderName: "TEST SELLER",
		EncryptedAccountNumber: encrypted, EncryptionNonce: nonce,
	}}
	service := NewAdminService(store, cipher, true, "manual_vietqr")
	admin := domain.UserContext{UserID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", Email: "admin@example.com", Role: domain.RoleAdmin}
	transfer, err := service.PrepareManualPayout(context.Background(), admin, store.manualData.PayoutID)
	if err != nil {
		t.Fatal(err)
	}
	if transfer.AccountNumber != "0123456789" || transfer.TransferContent != "EMALLBBBBBBBBBBBB" || transfer.QRCodeURL == "" {
		t.Fatalf("unexpected transfer: %+v", transfer)
	}
	_, err = service.CompleteManualPayout(context.Background(), admin, store.manualData.PayoutID, "CONFIRM", "FT-12345", "Bank transfer completed")
	if err != nil {
		t.Fatal(err)
	}
	if store.manualInput.Status != domain.PayoutStatusSucceeded || store.manualInput.ProviderReference != "FT-12345" {
		t.Fatalf("unexpected completion: %+v", store.manualInput)
	}
}
