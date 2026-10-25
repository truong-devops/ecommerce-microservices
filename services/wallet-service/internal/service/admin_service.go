package service

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"wallet-service/internal/domain"
	"wallet-service/internal/httpx"
	"wallet-service/internal/repository"

	"github.com/google/uuid"
)

type AdminWalletStore interface {
	GetAdminWalletSummary(context.Context, string) (domain.AdminWalletSummary, error)
	ListAdminWallets(context.Context, repository.ListAdminWalletsInput) (domain.AdminWalletPage, error)
	GetAdminWallet(context.Context, string) (domain.AdminWallet, error)
	SetAdminWalletFrozen(context.Context, repository.AdminActionInput, bool) (domain.AdminWallet, error)
	SetAdminBankAccountStatus(context.Context, repository.AdminActionInput, domain.BankAccountStatus) (domain.AdminWallet, error)
	ListAdminTransactions(context.Context, string, int, int) (domain.TransactionPage, error)
	ListAdminPayouts(context.Context, repository.ListAdminPayoutsInput) (domain.AdminPayoutPage, error)
	ListAdminAuditLogs(context.Context, repository.ListAdminAuditLogsInput) (domain.AdminAuditLogPage, error)
	PrepareManualPayout(context.Context, repository.PrepareManualPayoutInput) (repository.ManualPayoutData, error)
	CompleteManualPayout(context.Context, repository.CompleteManualPayoutInput) (domain.AdminPayout, bool, error)
}

type AdminService struct {
	store          AdminWalletStore
	cipher         *BankAccountCipher
	payoutEnabled  bool
	payoutProvider string
	now            func() time.Time
}

func NewAdminService(store AdminWalletStore, cipher *BankAccountCipher, payoutEnabled bool, payoutProvider string) *AdminService {
	return &AdminService{
		store: store, cipher: cipher, payoutEnabled: payoutEnabled,
		payoutProvider: strings.ToLower(strings.TrimSpace(payoutProvider)),
		now:            func() time.Time { return time.Now().UTC() },
	}
}

func (s *AdminService) GetSummary(ctx context.Context, user domain.UserContext) (domain.AdminWalletSummary, error) {
	if err := validateAdmin(user); err != nil {
		return domain.AdminWalletSummary{}, err
	}
	return s.store.GetAdminWalletSummary(ctx, supportedCurrency)
}

func (s *AdminService) ListWallets(ctx context.Context, user domain.UserContext, search, state, bankStatus, rawOwnerType string, page, pageSize int) (domain.AdminWalletPage, error) {
	if err := validateAdmin(user); err != nil {
		return domain.AdminWalletPage{}, err
	}
	state = strings.ToUpper(strings.TrimSpace(state))
	if state != "" && state != "ACTIVE" && state != "FROZEN" {
		return domain.AdminWalletPage{}, validationError("state must be ACTIVE or FROZEN")
	}
	bankStatus = strings.ToUpper(strings.TrimSpace(bankStatus))
	if bankStatus != "" && bankStatus != "MISSING" && bankStatus != string(domain.BankAccountStatusUnverified) && bankStatus != string(domain.BankAccountStatusAllowlisted) && bankStatus != string(domain.BankAccountStatusDisabled) {
		return domain.AdminWalletPage{}, validationError("invalid bank account status")
	}
	ownerType := domain.WalletOwnerType(strings.ToUpper(strings.TrimSpace(rawOwnerType)))
	if ownerType != "" && ownerType != domain.WalletOwnerSeller && ownerType != domain.WalletOwnerCustomer {
		return domain.AdminWalletPage{}, validationError("ownerType must be SELLER or CUSTOMER")
	}
	return s.store.ListAdminWallets(ctx, repository.ListAdminWalletsInput{
		Currency: supportedCurrency, Search: strings.TrimSpace(search), State: state,
		BankStatus: bankStatus, OwnerType: ownerType, Page: page, PageSize: pageSize,
	})
}

func (s *AdminService) GetWallet(ctx context.Context, user domain.UserContext, walletID string) (domain.AdminWallet, error) {
	if err := validateAdmin(user); err != nil {
		return domain.AdminWallet{}, err
	}
	if err := validateUUID("walletId", walletID); err != nil {
		return domain.AdminWallet{}, err
	}
	result, err := s.store.GetAdminWallet(ctx, walletID)
	return result, mapAdminError(err)
}

func (s *AdminService) SetWalletFrozen(ctx context.Context, user domain.UserContext, walletID string, frozen bool, reason string) (domain.AdminWallet, error) {
	input, err := adminActionInput(user, walletID, reason)
	if err != nil {
		return domain.AdminWallet{}, err
	}
	result, err := s.store.SetAdminWalletFrozen(ctx, input, frozen)
	return result, mapAdminError(err)
}

func (s *AdminService) SetBankAccountStatus(ctx context.Context, user domain.UserContext, walletID, rawStatus, reason string) (domain.AdminWallet, error) {
	input, err := adminActionInput(user, walletID, reason)
	if err != nil {
		return domain.AdminWallet{}, err
	}
	status := domain.BankAccountStatus(strings.ToUpper(strings.TrimSpace(rawStatus)))
	if status != domain.BankAccountStatusUnverified && status != domain.BankAccountStatusAllowlisted && status != domain.BankAccountStatusDisabled {
		return domain.AdminWallet{}, validationError("status must be UNVERIFIED, ALLOWLISTED, or DISABLED")
	}
	result, err := s.store.SetAdminBankAccountStatus(ctx, input, status)
	return result, mapAdminError(err)
}

func (s *AdminService) ListTransactions(ctx context.Context, user domain.UserContext, walletID string, page, pageSize int) (domain.TransactionPage, error) {
	if err := validateAdmin(user); err != nil {
		return domain.TransactionPage{}, err
	}
	if err := validateUUID("walletId", walletID); err != nil {
		return domain.TransactionPage{}, err
	}
	result, err := s.store.ListAdminTransactions(ctx, walletID, page, pageSize)
	return result, mapAdminError(err)
}

func (s *AdminService) ListPayouts(ctx context.Context, user domain.UserContext, walletID, rawStatus string, page, pageSize int) (domain.AdminPayoutPage, error) {
	if err := validateAdmin(user); err != nil {
		return domain.AdminPayoutPage{}, err
	}
	if walletID != "" {
		if err := validateUUID("walletId", walletID); err != nil {
			return domain.AdminPayoutPage{}, err
		}
	}
	status := domain.PayoutStatus(strings.ToUpper(strings.TrimSpace(rawStatus)))
	if status != "" && status != domain.PayoutStatusRequested && status != domain.PayoutStatusProcessing && status != domain.PayoutStatusSucceeded && status != domain.PayoutStatusFailed && status != domain.PayoutStatusCancelled {
		return domain.AdminPayoutPage{}, validationError("invalid payout status")
	}
	return s.store.ListAdminPayouts(ctx, repository.ListAdminPayoutsInput{WalletID: walletID, Status: status, Page: page, PageSize: pageSize})
}

func (s *AdminService) ListAuditLogs(ctx context.Context, user domain.UserContext, walletID string, page, pageSize int) (domain.AdminAuditLogPage, error) {
	if err := validateAdmin(user); err != nil {
		return domain.AdminAuditLogPage{}, err
	}
	if walletID != "" {
		if err := validateUUID("walletId", walletID); err != nil {
			return domain.AdminAuditLogPage{}, err
		}
	}
	return s.store.ListAdminAuditLogs(ctx, repository.ListAdminAuditLogsInput{WalletID: walletID, Page: page, PageSize: pageSize})
}

func (s *AdminService) PrepareManualPayout(ctx context.Context, user domain.UserContext, payoutID string) (domain.AdminPayoutTransfer, error) {
	if err := s.validateManualPayout(user, payoutID); err != nil {
		return domain.AdminPayoutTransfer{}, err
	}
	transferCode := buildPayoutTransferCode(payoutID)
	data, err := s.store.PrepareManualPayout(ctx, repository.PrepareManualPayoutInput{
		PayoutID: payoutID, ActorID: user.UserID, ActorEmail: user.Email,
		Reason: "Prepared manual VietQR bank transfer", TransferCode: transferCode,
	})
	if err != nil {
		return domain.AdminPayoutTransfer{}, mapAdminError(err)
	}
	accountNumber, err := s.cipher.Decrypt(data.EncryptedAccountNumber, data.EncryptionNonce)
	if err != nil {
		return domain.AdminPayoutTransfer{}, err
	}
	defer func() { accountNumber = "" }()
	transferContent := transferCode
	qrCodeURL := fmt.Sprintf(
		"https://img.vietqr.io/image/%s-%s-compact2.svg?amount=%d&addInfo=%s&accountName=%s",
		url.PathEscape(vietQRBankID(data.BankCode)), url.PathEscape(accountNumber), data.AmountMinor,
		url.QueryEscape(transferContent), url.QueryEscape(data.AccountHolderName),
	)
	result := domain.AdminPayoutTransfer{
		PayoutID: data.PayoutID, WalletID: data.WalletID, OwnerID: data.OwnerID,
		OwnerType: data.OwnerType, PayoutType: data.PayoutType,
		AmountMinor: data.AmountMinor, Currency: data.Currency, Status: data.Status,
		BankCode: data.BankCode, AccountNumber: accountNumber, AccountHolderName: data.AccountHolderName,
		TransferContent: transferContent, QRCodeURL: qrCodeURL,
	}
	if data.OwnerType == domain.WalletOwnerSeller {
		result.SellerID = data.OwnerID
	}
	return result, nil
}

func buildPayoutTransferCode(payoutID string) string {
	compactID := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(payoutID), "-", ""))
	if len(compactID) > 12 {
		compactID = compactID[:12]
	}
	return "EMALL" + compactID
}

func vietQRBankID(bankCode string) string {
	// eMall stores VTB for VietinBank while VietQR/NAPAS uses ICB.
	if strings.EqualFold(strings.TrimSpace(bankCode), "VTB") {
		return "ICB"
	}
	return strings.ToUpper(strings.TrimSpace(bankCode))
}

func (s *AdminService) CompleteManualPayout(ctx context.Context, user domain.UserContext, payoutID, action, providerReference, reason string) (domain.AdminPayout, error) {
	if err := s.validateManualPayout(user, payoutID); err != nil {
		return domain.AdminPayout{}, err
	}
	action = strings.ToUpper(strings.TrimSpace(action))
	reason = strings.TrimSpace(reason)
	if len(reason) < 3 || len(reason) > 500 {
		return domain.AdminPayout{}, validationError("reason must contain 3-500 characters")
	}
	status := domain.PayoutStatusCancelled
	providerReference = strings.TrimSpace(providerReference)
	switch action {
	case "CONFIRM":
		status = domain.PayoutStatusSucceeded
		if len(providerReference) < 3 || len(providerReference) > 128 {
			return domain.AdminPayout{}, validationError("providerReference must contain 3-128 characters when confirming a payout")
		}
	case "REJECT":
		providerReference = ""
	default:
		return domain.AdminPayout{}, validationError("action must be CONFIRM or REJECT")
	}
	result, _, err := s.store.CompleteManualPayout(ctx, repository.CompleteManualPayoutInput{
		PayoutID: payoutID, ActorID: user.UserID, ActorEmail: user.Email,
		Reason: reason, ProviderReference: providerReference, Status: status, ProcessedAt: s.now(),
	})
	return result, mapAdminError(err)
}

func (s *AdminService) validateManualPayout(user domain.UserContext, payoutID string) error {
	if err := validateAdmin(user); err != nil {
		return err
	}
	if err := validateUUID("payoutId", payoutID); err != nil {
		return err
	}
	if !s.payoutEnabled || s.payoutProvider != "manual_vietqr" {
		return httpx.NewAppError(http.StatusConflict, domain.ErrorCodePayoutProviderInvalid, "Manual VietQR payouts are not enabled", nil)
	}
	if s.cipher == nil {
		return httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Bank account encryption is unavailable", nil)
	}
	return nil
}

func validateAdmin(user domain.UserContext) error {
	if user.Role != domain.RoleAdmin && user.Role != domain.RoleSuperAdmin {
		return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Only administrators can manage wallets", nil)
	}
	if _, err := uuid.Parse(strings.TrimSpace(user.UserID)); err != nil {
		return httpx.NewAppError(http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Invalid authenticated user", nil)
	}
	return nil
}

func adminActionInput(user domain.UserContext, walletID, reason string) (repository.AdminActionInput, error) {
	if err := validateAdmin(user); err != nil {
		return repository.AdminActionInput{}, err
	}
	if err := validateUUID("walletId", walletID); err != nil {
		return repository.AdminActionInput{}, err
	}
	reason = strings.TrimSpace(reason)
	if len(reason) < 3 || len(reason) > 500 {
		return repository.AdminActionInput{}, validationError("reason must contain 3-500 characters")
	}
	return repository.AdminActionInput{WalletID: walletID, ActorID: user.UserID, ActorEmail: user.Email, Reason: reason}, nil
}

func validateUUID(field, value string) error {
	if _, err := uuid.Parse(strings.TrimSpace(value)); err != nil {
		return validationError(field + " must be UUID")
	}
	return nil
}

func mapAdminError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, repository.ErrWalletNotFound):
		return httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeWalletNotFound, "Wallet not found", nil)
	case errors.Is(err, repository.ErrBankAccountNotFound):
		return httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeBankAccountNotFound, "Bank account not found", nil)
	case errors.Is(err, repository.ErrPayoutNotFound):
		return httpx.NewAppError(http.StatusNotFound, domain.ErrorCodePayoutNotFound, "Payout not found", nil)
	case errors.Is(err, repository.ErrPayoutStateConflict):
		return httpx.NewAppError(http.StatusConflict, domain.ErrorCodePayoutStateConflict, "Payout is no longer available for this action", nil)
	default:
		return err
	}
}
