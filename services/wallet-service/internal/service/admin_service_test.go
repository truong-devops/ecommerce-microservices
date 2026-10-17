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

func TestAdminServiceRestrictsModerator(t *testing.T) {
	service := NewAdminService(&fakeAdminStore{})
	_, err := service.GetSummary(context.Background(), domain.UserContext{
		UserID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", Role: domain.RoleModerator,
	})
	if err == nil {
		t.Fatal("expected moderator to be rejected")
	}
}

func TestAdminServiceRecordsActorAndReasonForBankVerification(t *testing.T) {
	store := &fakeAdminStore{}
	service := NewAdminService(store)
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
	service := NewAdminService(store)
	admin := domain.UserContext{UserID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", Role: domain.RoleSuperAdmin}
	_, err := service.SetWalletFrozen(context.Background(), admin, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", true, " ")
	if err == nil {
		t.Fatal("expected missing reason to fail")
	}
}
