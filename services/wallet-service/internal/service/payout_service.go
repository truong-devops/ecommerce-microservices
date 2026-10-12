package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"wallet-service/internal/domain"
	"wallet-service/internal/httpx"
	"wallet-service/internal/repository"

	"github.com/google/uuid"
)

var (
	bankCodePattern      = regexp.MustCompile(`^[A-Z0-9_-]{2,32}$`)
	accountNumberPattern = regexp.MustCompile(`^[0-9]{6,20}$`)
)

type PayoutStore interface {
	UpsertBankAccount(context.Context, repository.UpsertBankAccountInput) (domain.BankAccount, error)
	GetBankAccount(context.Context, string, string) (domain.BankAccount, error)
	CreatePayout(context.Context, repository.CreatePayoutInput) (domain.Payout, bool, error)
	GetPayout(context.Context, string, string) (domain.Payout, error)
	ListPayouts(context.Context, repository.ListPayoutsInput) (domain.PayoutPage, error)
	GetPayoutSummary(context.Context, repository.PayoutSummaryInput) (domain.PayoutSummary, error)
	ClaimPayouts(context.Context, time.Time, int) ([]repository.PayoutJob, error)
	FindStalePayouts(context.Context, time.Time, int) ([]repository.PayoutJob, error)
	CompletePayout(context.Context, repository.CompletePayoutInput) (bool, error)
	MarkPayoutPending(context.Context, string, string, string, time.Time) error
	ReschedulePayout(context.Context, string, time.Time) error
}

type PayoutService struct {
	store          PayoutStore
	cipher         *BankAccountCipher
	enabled        bool
	minAmount      int64
	maxAmount      int64
	idempotencyTTL time.Duration
	now            func() time.Time
	metrics        PayoutMetrics
}

type PayoutMetrics interface {
	RecordPayoutRequested()
	RecordPayoutCompleted(status string)
	RecordProviderRetry()
}

type noopPayoutMetrics struct{}

func (noopPayoutMetrics) RecordPayoutRequested()       {}
func (noopPayoutMetrics) RecordPayoutCompleted(string) {}
func (noopPayoutMetrics) RecordProviderRetry()         {}

func NewPayoutService(store PayoutStore, cipher *BankAccountCipher, enabled bool, minAmount, maxAmount int64, idempotencyTTL time.Duration) *PayoutService {
	return &PayoutService{store: store, cipher: cipher, enabled: enabled, minAmount: minAmount, maxAmount: maxAmount, idempotencyTTL: idempotencyTTL, now: func() time.Time { return time.Now().UTC() }, metrics: noopPayoutMetrics{}}
}

func (s *PayoutService) SetMetrics(metrics PayoutMetrics) {
	if metrics != nil {
		s.metrics = metrics
	}
}

func (s *PayoutService) UpsertMyBankAccount(ctx context.Context, user domain.UserContext, bankCode, accountNumber, holderName string) (domain.BankAccount, error) {
	if err := validateSeller(user); err != nil {
		return domain.BankAccount{}, err
	}
	bankCode = strings.ToUpper(strings.TrimSpace(bankCode))
	accountNumber = strings.TrimSpace(accountNumber)
	holderName = strings.Join(strings.Fields(strings.ToUpper(holderName)), " ")
	if !bankCodePattern.MatchString(bankCode) {
		return domain.BankAccount{}, validationError("bankCode must contain 2-32 uppercase letters, digits, underscores, or hyphens")
	}
	if !accountNumberPattern.MatchString(accountNumber) {
		return domain.BankAccount{}, validationError("accountNumber must contain 6-20 digits")
	}
	if len(holderName) < 2 || len(holderName) > 255 {
		return domain.BankAccount{}, validationError("accountHolderName must contain 2-255 characters")
	}
	encrypted, nonce, err := s.cipher.Encrypt(accountNumber)
	if err != nil {
		return domain.BankAccount{}, err
	}
	return s.store.UpsertBankAccount(ctx, repository.UpsertBankAccountInput{
		SellerID: user.UserID, Currency: supportedCurrency, BankCode: bankCode, AccountHolderName: holderName,
		Last4: accountNumber[len(accountNumber)-4:], EncryptedAccountNumber: encrypted, EncryptionNonce: nonce,
	})
}

func (s *PayoutService) GetMyBankAccount(ctx context.Context, user domain.UserContext) (domain.BankAccount, error) {
	if err := validateSeller(user); err != nil {
		return domain.BankAccount{}, err
	}
	account, err := s.store.GetBankAccount(ctx, user.UserID, supportedCurrency)
	return account, mapPayoutError(err)
}

func (s *PayoutService) CreateMyPayout(ctx context.Context, user domain.UserContext, idempotencyKey string, amount int64, currency string) (domain.Payout, bool, error) {
	if err := validateSeller(user); err != nil {
		return domain.Payout{}, false, err
	}
	if !s.enabled {
		return domain.Payout{}, false, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodePayoutDisabled, "Payout requests are disabled", nil)
	}
	idempotencyKey = strings.TrimSpace(idempotencyKey)
	if len(idempotencyKey) < 8 || len(idempotencyKey) > 255 {
		return domain.Payout{}, false, validationError("Idempotency-Key must contain 8-255 characters")
	}
	normalizedCurrency, err := normalizeCurrency(currency)
	if err != nil {
		return domain.Payout{}, false, err
	}
	if amount < s.minAmount || amount > s.maxAmount {
		return domain.Payout{}, false, validationError("amount is outside the configured payout limits")
	}
	hash := sha256.Sum256([]byte(strings.Join([]string{user.UserID, normalizedCurrency, stringAmount(amount)}, ":")))
	payout, replay, err := s.store.CreatePayout(ctx, repository.CreatePayoutInput{
		SellerID: user.UserID, Currency: normalizedCurrency, AmountMinor: amount,
		IdempotencyKey: idempotencyKey, RequestHash: hex.EncodeToString(hash[:]), IdempotencyExpiresAt: s.now().Add(s.idempotencyTTL),
	})
	if err == nil && !replay {
		s.metrics.RecordPayoutRequested()
	}
	return payout, replay, mapPayoutError(err)
}

func (s *PayoutService) GetMyPayout(ctx context.Context, user domain.UserContext, payoutID string) (domain.Payout, error) {
	if err := validateSeller(user); err != nil {
		return domain.Payout{}, err
	}
	if _, err := uuid.Parse(strings.TrimSpace(payoutID)); err != nil {
		return domain.Payout{}, validationError("payout id must be UUID")
	}
	payout, err := s.store.GetPayout(ctx, user.UserID, payoutID)
	return payout, mapPayoutError(err)
}

func (s *PayoutService) ListMyPayouts(ctx context.Context, user domain.UserContext, status string, page, pageSize int) (domain.PayoutPage, error) {
	if err := validateSeller(user); err != nil {
		return domain.PayoutPage{}, err
	}
	status = strings.ToUpper(strings.TrimSpace(status))
	if status != "" && status != string(domain.PayoutStatusRequested) && status != string(domain.PayoutStatusProcessing) && status != string(domain.PayoutStatusSucceeded) && status != string(domain.PayoutStatusFailed) && status != string(domain.PayoutStatusCancelled) {
		return domain.PayoutPage{}, validationError("status is invalid")
	}
	return s.store.ListPayouts(ctx, repository.ListPayoutsInput{SellerID: user.UserID, Currency: supportedCurrency, Status: domain.PayoutStatus(status), Page: page, PageSize: pageSize})
}

func (s *PayoutService) GetMyPayoutSummary(ctx context.Context, user domain.UserContext, weekStart, monthStart time.Time) (domain.PayoutSummary, error) {
	if err := validateSeller(user); err != nil {
		return domain.PayoutSummary{}, err
	}
	if weekStart.IsZero() || monthStart.IsZero() {
		return domain.PayoutSummary{}, validationError("weekStart and monthStart are required")
	}
	return s.store.GetPayoutSummary(ctx, repository.PayoutSummaryInput{
		SellerID: user.UserID, Currency: supportedCurrency,
		WeekStart: weekStart.UTC(), MonthStart: monthStart.UTC(),
	})
}

func validateSeller(user domain.UserContext) error {
	if user.Role != domain.RoleSeller {
		return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Only sellers can access payouts", nil)
	}
	if _, err := uuid.Parse(strings.TrimSpace(user.UserID)); err != nil {
		return httpx.NewAppError(http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Invalid authenticated user", nil)
	}
	return nil
}

func validationError(message string) error {
	return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationFailed, message, nil)
}

func mapPayoutError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, repository.ErrWalletNotFound):
		return httpx.NewAppError(http.StatusConflict, domain.ErrorCodeWalletNotFound, "Wallet has no funds yet", nil)
	case errors.Is(err, repository.ErrWalletFrozen):
		return httpx.NewAppError(http.StatusConflict, domain.ErrorCodeWalletFrozen, "Wallet is frozen", nil)
	case errors.Is(err, repository.ErrBankAccountNotFound):
		return httpx.NewAppError(http.StatusConflict, domain.ErrorCodeBankAccountNotFound, "A bank account is required", nil)
	case errors.Is(err, repository.ErrPayoutNotFound):
		return httpx.NewAppError(http.StatusNotFound, domain.ErrorCodePayoutNotFound, "Payout not found", nil)
	case errors.Is(err, repository.ErrInsufficientBalance):
		return httpx.NewAppError(http.StatusConflict, domain.ErrorCodeInsufficientBalance, "Insufficient available balance", nil)
	case errors.Is(err, repository.ErrIdempotencyConflict):
		return httpx.NewAppError(http.StatusConflict, domain.ErrorCodeIdempotencyConflict, "Idempotency-Key was already used with another request", nil)
	default:
		return err
	}
}

func stringAmount(value int64) string {
	const digits = "0123456789"
	if value == 0 {
		return "0"
	}
	buffer := [20]byte{}
	i := len(buffer)
	for value > 0 {
		i--
		buffer[i] = digits[value%10]
		value /= 10
	}
	return string(buffer[i:])
}
