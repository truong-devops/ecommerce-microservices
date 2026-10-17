package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"wallet-service/internal/domain"

	"github.com/jackc/pgx/v5"
)

var (
	ErrWalletNotFound         = errors.New("wallet not found")
	ErrWalletFrozen           = errors.New("wallet is frozen")
	ErrBankAccountNotFound    = errors.New("bank account not found")
	ErrBankAccountNotVerified = errors.New("bank account is not verified")
	ErrPayoutNotFound         = errors.New("payout not found")
	ErrInsufficientBalance    = errors.New("insufficient available balance")
	ErrIdempotencyConflict    = errors.New("idempotency key was used for another request")
)

type UpsertBankAccountInput struct {
	SellerID, Currency, BankCode, AccountHolderName, Last4 string
	EncryptedAccountNumber, EncryptionNonce                []byte
}

type CreatePayoutInput struct {
	SellerID, Currency, IdempotencyKey, RequestHash string
	AmountMinor                                     int64
	IdempotencyExpiresAt                            time.Time
}

type ListPayoutsInput struct {
	SellerID, Currency string
	Status             domain.PayoutStatus
	Page, PageSize     int
}

type PayoutSummaryInput struct {
	SellerID, Currency    string
	WeekStart, MonthStart time.Time
}

type PayoutJob struct {
	PayoutID, IdempotencyKey, Currency, BankCode, AccountHolderName string
	AmountMinor                                                     int64
	EncryptedAccountNumber, EncryptionNonce                         []byte
	ProviderReference                                               *string
}

type CompletePayoutInput struct {
	PayoutID, Provider, ProviderReference, FailureCode, FailureMessage string
	Status                                                             domain.PayoutStatus
	ProcessedAt                                                        time.Time
}

func (r *WalletRepository) UpsertBankAccount(ctx context.Context, input UpsertBankAccountInput) (domain.BankAccount, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return domain.BankAccount{}, err
	}
	defer tx.Rollback(ctx)
	walletID, err := ensureWallet(ctx, tx, input.SellerID, input.Currency)
	if err != nil {
		return domain.BankAccount{}, err
	}
	for _, accountType := range []domain.AccountType{domain.AccountTypeSellerHeld, domain.AccountTypeSellerAvailable, domain.AccountTypePayoutPending} {
		if _, err := ensureLedgerAccount(ctx, tx, &walletID, accountType, input.Currency); err != nil {
			return domain.BankAccount{}, err
		}
	}
	var account domain.BankAccount
	var last4 string
	err = tx.QueryRow(ctx, `
		INSERT INTO bank_accounts (wallet_id, bank_code, account_holder_name, encrypted_account_number, encryption_nonce, account_number_last4, status, is_default)
		VALUES ($1, $2, $3, $4, $5, $6, 'UNVERIFIED', true)
		ON CONFLICT (wallet_id) WHERE is_default = true DO UPDATE
		SET bank_code = EXCLUDED.bank_code,
		    account_holder_name = EXCLUDED.account_holder_name,
		    encrypted_account_number = EXCLUDED.encrypted_account_number,
		    encryption_nonce = EXCLUDED.encryption_nonce,
		    account_number_last4 = EXCLUDED.account_number_last4,
		    status = 'UNVERIFIED', updated_at = now()
		RETURNING id, bank_code, account_holder_name, account_number_last4, status, is_default, created_at, updated_at
	`, walletID, input.BankCode, input.AccountHolderName, input.EncryptedAccountNumber, input.EncryptionNonce, input.Last4).Scan(
		&account.ID, &account.BankCode, &account.AccountHolderName, &last4, &account.Status, &account.IsDefault, &account.CreatedAt, &account.UpdatedAt,
	)
	if err != nil {
		return domain.BankAccount{}, err
	}
	account.MaskedAccountNumber = maskLast4(last4)
	if err := tx.Commit(ctx); err != nil {
		return domain.BankAccount{}, err
	}
	return account, nil
}

func (r *WalletRepository) GetBankAccount(ctx context.Context, sellerID, currency string) (domain.BankAccount, error) {
	var account domain.BankAccount
	var last4 string
	err := r.pool.QueryRow(ctx, `
		SELECT b.id, b.bank_code, b.account_holder_name, b.account_number_last4, b.status, b.is_default, b.created_at, b.updated_at
		FROM bank_accounts b JOIN wallets w ON w.id = b.wallet_id
		WHERE w.seller_id = $1 AND w.currency = $2 AND b.is_default = true
	`, sellerID, currency).Scan(&account.ID, &account.BankCode, &account.AccountHolderName, &last4, &account.Status, &account.IsDefault, &account.CreatedAt, &account.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.BankAccount{}, ErrBankAccountNotFound
	}
	if err != nil {
		return domain.BankAccount{}, err
	}
	account.MaskedAccountNumber = maskLast4(last4)
	return account, nil
}

func (r *WalletRepository) CreatePayout(ctx context.Context, input CreatePayoutInput) (domain.Payout, bool, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return domain.Payout{}, false, err
	}
	defer tx.Rollback(ctx)
	var walletID string
	var frozen bool
	err = tx.QueryRow(ctx, `SELECT id, is_frozen FROM wallets WHERE seller_id = $1 AND currency = $2 FOR UPDATE`, input.SellerID, input.Currency).Scan(&walletID, &frozen)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Payout{}, false, ErrWalletNotFound
	}
	if err != nil {
		return domain.Payout{}, false, err
	}

	if _, err := tx.Exec(ctx, `DELETE FROM idempotency_records WHERE actor_id = $1 AND idempotency_key = $2 AND expires_at <= now()`, input.SellerID, input.IdempotencyKey); err != nil {
		return domain.Payout{}, false, err
	}
	var existingHash, existingResourceID string
	err = tx.QueryRow(ctx, `SELECT request_hash, COALESCE(resource_id::text, '') FROM idempotency_records WHERE actor_id = $1 AND idempotency_key = $2 FOR UPDATE`, input.SellerID, input.IdempotencyKey).Scan(&existingHash, &existingResourceID)
	if err == nil {
		if existingHash != input.RequestHash || existingResourceID == "" {
			return domain.Payout{}, false, ErrIdempotencyConflict
		}
		payout, findErr := getPayoutWithQuerier(ctx, tx, input.SellerID, existingResourceID)
		if findErr != nil {
			return domain.Payout{}, false, findErr
		}
		if err := tx.Commit(ctx); err != nil {
			return domain.Payout{}, false, err
		}
		return payout, true, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return domain.Payout{}, false, err
	}
	if frozen {
		return domain.Payout{}, false, ErrWalletFrozen
	}

	var bankAccountID, bankCode, holderName, last4 string
	var bankAccountStatus domain.BankAccountStatus
	var encrypted, nonce []byte
	err = tx.QueryRow(ctx, `
		SELECT id, bank_code, account_holder_name, encrypted_account_number, encryption_nonce, account_number_last4, status
		FROM bank_accounts WHERE wallet_id = $1 AND is_default = true FOR UPDATE
	`, walletID).Scan(&bankAccountID, &bankCode, &holderName, &encrypted, &nonce, &last4, &bankAccountStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Payout{}, false, ErrBankAccountNotFound
	}
	if err != nil {
		return domain.Payout{}, false, err
	}
	if bankAccountStatus != domain.BankAccountStatusAllowlisted {
		return domain.Payout{}, false, ErrBankAccountNotVerified
	}
	availableAccountID, err := ensureLedgerAccount(ctx, tx, &walletID, domain.AccountTypeSellerAvailable, input.Currency)
	if err != nil {
		return domain.Payout{}, false, err
	}
	pendingAccountID, err := ensureLedgerAccount(ctx, tx, &walletID, domain.AccountTypePayoutPending, input.Currency)
	if err != nil {
		return domain.Payout{}, false, err
	}
	var available int64
	if err := tx.QueryRow(ctx, `SELECT COALESCE(SUM(amount_minor), 0) FROM ledger_entries WHERE account_id = $1`, availableAccountID).Scan(&available); err != nil {
		return domain.Payout{}, false, err
	}
	if available < input.AmountMinor {
		return domain.Payout{}, false, ErrInsufficientBalance
	}

	var payout domain.Payout
	err = tx.QueryRow(ctx, `
		INSERT INTO payouts (wallet_id, bank_account_id, amount_minor, currency, bank_code, account_holder_name, encrypted_account_number, encryption_nonce, account_number_last4)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		RETURNING id, amount_minor, currency, status, bank_code, account_holder_name, account_number_last4, provider, provider_reference, failure_code, failure_message, requested_at, processed_at, created_at, updated_at
	`, walletID, bankAccountID, input.AmountMinor, input.Currency, bankCode, holderName, encrypted, nonce, last4).Scan(
		&payout.ID, &payout.AmountMinor, &payout.Currency, &payout.Status, &payout.BankCode, &payout.AccountHolderName, &last4, &payout.Provider, &payout.ProviderReference, &payout.FailureCode, &payout.FailureMessage, &payout.RequestedAt, &payout.ProcessedAt, &payout.CreatedAt, &payout.UpdatedAt,
	)
	if err != nil {
		return domain.Payout{}, false, err
	}
	payout.MaskedAccountNumber = maskLast4(last4)
	transactionID, err := insertLedgerTransaction(ctx, tx, domain.TransactionTypePayoutRequest, "payout", payout.ID, "payout-request:"+payout.ID, input.Currency, "Seller requested payout", payout.RequestedAt)
	if err != nil {
		return domain.Payout{}, false, err
	}
	if err := insertLedgerEntries(ctx, tx, transactionID, map[string]int64{availableAccountID: -input.AmountMinor, pendingAccountID: input.AmountMinor}); err != nil {
		return domain.Payout{}, false, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO idempotency_records (actor_id, idempotency_key, request_hash, resource_type, resource_id, response_status, expires_at) VALUES ($1,$2,$3,'payout',$4,201,$5)`, input.SellerID, input.IdempotencyKey, input.RequestHash, payout.ID, input.IdempotencyExpiresAt); err != nil {
		return domain.Payout{}, false, err
	}
	if err := insertOutboxEvent(ctx, tx, "payout", payout.ID, "wallet.payout-requested", map[string]any{"payoutId": payout.ID, "sellerId": input.SellerID, "amount": input.AmountMinor, "currency": input.Currency}); err != nil {
		return domain.Payout{}, false, err
	}
	if _, err := tx.Exec(ctx, `UPDATE wallets SET updated_at = now() WHERE id = $1`, walletID); err != nil {
		return domain.Payout{}, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.Payout{}, false, err
	}
	return payout, false, nil
}

func (r *WalletRepository) GetPayout(ctx context.Context, sellerID, payoutID string) (domain.Payout, error) {
	return getPayoutWithQuerier(ctx, r.pool, sellerID, payoutID)
}

func (r *WalletRepository) ListPayouts(ctx context.Context, input ListPayoutsInput) (domain.PayoutPage, error) {
	result := domain.PayoutPage{Items: []domain.Payout{}, Page: input.Page, PageSize: input.PageSize}
	offset := (input.Page - 1) * input.PageSize
	rows, err := r.pool.Query(ctx, `
		SELECT p.id, p.amount_minor, p.currency, p.status, p.bank_code, p.account_holder_name, p.account_number_last4,
		       p.provider, p.provider_reference, p.failure_code, p.failure_message, p.requested_at, p.processed_at, p.created_at, p.updated_at, COUNT(*) OVER()
		FROM payouts p JOIN wallets w ON w.id = p.wallet_id
		WHERE w.seller_id = $1 AND w.currency = $2 AND ($3 = '' OR p.status = $3)
		ORDER BY p.requested_at DESC, p.id DESC LIMIT $4 OFFSET $5
	`, input.SellerID, input.Currency, input.Status, input.PageSize, offset)
	if err != nil {
		return domain.PayoutPage{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var item domain.Payout
		var last4 string
		if err := rows.Scan(&item.ID, &item.AmountMinor, &item.Currency, &item.Status, &item.BankCode, &item.AccountHolderName, &last4, &item.Provider, &item.ProviderReference, &item.FailureCode, &item.FailureMessage, &item.RequestedAt, &item.ProcessedAt, &item.CreatedAt, &item.UpdatedAt, &result.TotalItems); err != nil {
			return domain.PayoutPage{}, err
		}
		item.MaskedAccountNumber = maskLast4(last4)
		result.Items = append(result.Items, item)
	}
	return result, rows.Err()
}

func (r *WalletRepository) GetPayoutSummary(ctx context.Context, input PayoutSummaryInput) (domain.PayoutSummary, error) {
	var summary domain.PayoutSummary
	err := r.pool.QueryRow(ctx, `
		SELECT
		  COALESCE(SUM(p.amount_minor) FILTER (WHERE COALESCE(p.processed_at, p.requested_at) >= $3), 0),
		  COALESCE(SUM(p.amount_minor) FILTER (WHERE COALESCE(p.processed_at, p.requested_at) >= $4), 0),
		  COALESCE(SUM(p.amount_minor), 0)
		FROM payouts p
		JOIN wallets w ON w.id = p.wallet_id
		WHERE w.seller_id = $1 AND w.currency = $2 AND p.status = 'SUCCEEDED'
	`, input.SellerID, input.Currency, input.WeekStart, input.MonthStart).Scan(&summary.PaidThisWeek, &summary.PaidThisMonth, &summary.TotalPaidOut)
	return summary, err
}

func (r *WalletRepository) ClaimPayouts(ctx context.Context, now time.Time, limit int) ([]PayoutJob, error) {
	rows, err := r.pool.Query(ctx, `
		WITH candidates AS (
		  SELECT id FROM payouts WHERE status = 'REQUESTED' AND next_attempt_at <= $1 ORDER BY requested_at FOR UPDATE SKIP LOCKED LIMIT $2
		), claimed AS (
		  UPDATE payouts p SET status='PROCESSING', attempt_count=attempt_count+1, processing_started_at=$1, updated_at=now()
		  FROM candidates c WHERE p.id=c.id
		  RETURNING p.id, p.amount_minor, p.currency, p.bank_code, p.account_holder_name, p.encrypted_account_number, p.encryption_nonce, p.provider_reference
		)
		SELECT id, amount_minor, currency, bank_code, account_holder_name, encrypted_account_number, encryption_nonce, provider_reference FROM claimed
	`, now, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	jobs := make([]PayoutJob, 0, limit)
	for rows.Next() {
		var job PayoutJob
		if err := rows.Scan(&job.PayoutID, &job.AmountMinor, &job.Currency, &job.BankCode, &job.AccountHolderName, &job.EncryptedAccountNumber, &job.EncryptionNonce, &job.ProviderReference); err != nil {
			return nil, err
		}
		job.IdempotencyKey = "payout-provider:" + job.PayoutID
		jobs = append(jobs, job)
	}
	return jobs, rows.Err()
}

func (r *WalletRepository) FindStalePayouts(ctx context.Context, before time.Time, limit int) ([]PayoutJob, error) {
	rows, err := r.pool.Query(ctx, `SELECT id, amount_minor, currency, bank_code, account_holder_name, encrypted_account_number, encryption_nonce, provider_reference FROM payouts WHERE status='PROCESSING' AND processing_started_at <= $1 ORDER BY processing_started_at LIMIT $2`, before, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	jobs := make([]PayoutJob, 0, limit)
	for rows.Next() {
		var job PayoutJob
		if err := rows.Scan(&job.PayoutID, &job.AmountMinor, &job.Currency, &job.BankCode, &job.AccountHolderName, &job.EncryptedAccountNumber, &job.EncryptionNonce, &job.ProviderReference); err != nil {
			return nil, err
		}
		job.IdempotencyKey = "payout-provider:" + job.PayoutID
		jobs = append(jobs, job)
	}
	return jobs, rows.Err()
}

func (r *WalletRepository) CompletePayout(ctx context.Context, input CompletePayoutInput) (bool, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	var walletID, sellerID, currency string
	var amount int64
	var status domain.PayoutStatus
	err = tx.QueryRow(ctx, `SELECT p.wallet_id, w.seller_id, p.amount_minor, p.currency, p.status FROM payouts p JOIN wallets w ON w.id=p.wallet_id WHERE p.id=$1 FOR UPDATE OF p`, input.PayoutID).Scan(&walletID, &sellerID, &amount, &currency, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, ErrPayoutNotFound
	}
	if err != nil {
		return false, err
	}
	if status == domain.PayoutStatusSucceeded || status == domain.PayoutStatusFailed {
		return false, tx.Commit(ctx)
	}
	if status != domain.PayoutStatusProcessing {
		return false, fmt.Errorf("payout %s cannot complete from status %s", input.PayoutID, status)
	}
	pendingID, err := ensureLedgerAccount(ctx, tx, &walletID, domain.AccountTypePayoutPending, currency)
	if err != nil {
		return false, err
	}
	var targetID string
	transactionType := domain.TransactionTypePayoutSuccess
	eventType := "wallet.payout-succeeded"
	description := "Payout completed by provider"
	if input.Status == domain.PayoutStatusSucceeded {
		targetID, err = ensureLedgerAccount(ctx, tx, nil, domain.AccountTypePlatformPayout, currency)
	} else if input.Status == domain.PayoutStatusFailed {
		targetID, err = ensureLedgerAccount(ctx, tx, &walletID, domain.AccountTypeSellerAvailable, currency)
		transactionType, eventType, description = domain.TransactionTypePayoutFailure, "wallet.payout-failed", "Failed payout returned to seller balance"
	} else {
		return false, fmt.Errorf("unsupported terminal payout status %s", input.Status)
	}
	if err != nil {
		return false, err
	}
	transactionID, err := insertLedgerTransaction(ctx, tx, transactionType, "payout", input.PayoutID, "payout-complete:"+input.PayoutID, currency, description, input.ProcessedAt)
	if err != nil {
		return false, err
	}
	if err := insertLedgerEntries(ctx, tx, transactionID, map[string]int64{pendingID: -amount, targetID: amount}); err != nil {
		return false, err
	}
	_, err = tx.Exec(ctx, `UPDATE payouts SET status=$2, provider=$3, provider_reference=NULLIF($4,''), failure_code=NULLIF($5,''), failure_message=NULLIF($6,''), processed_at=$7, updated_at=now() WHERE id=$1`, input.PayoutID, input.Status, input.Provider, input.ProviderReference, input.FailureCode, input.FailureMessage, input.ProcessedAt)
	if err != nil {
		return false, err
	}
	if err := refreshWalletFrozenState(ctx, tx, walletID); err != nil {
		return false, err
	}
	if err := insertOutboxEvent(ctx, tx, "payout", input.PayoutID, eventType, map[string]any{"payoutId": input.PayoutID, "sellerId": sellerID, "amount": amount, "currency": currency, "providerReference": input.ProviderReference, "failureCode": input.FailureCode}); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

func (r *WalletRepository) MarkPayoutPending(ctx context.Context, payoutID, provider, providerReference string, reconciledAt time.Time) error {
	_, err := r.pool.Exec(ctx, `UPDATE payouts SET provider=$2, provider_reference=NULLIF($3,''), last_reconciled_at=$4, updated_at=now() WHERE id=$1 AND status='PROCESSING'`, payoutID, provider, providerReference, reconciledAt)
	return err
}

func (r *WalletRepository) ReschedulePayout(ctx context.Context, payoutID string, nextAttemptAt time.Time) error {
	_, err := r.pool.Exec(ctx, `UPDATE payouts SET status='REQUESTED', next_attempt_at=$2, processing_started_at=NULL, updated_at=now() WHERE id=$1 AND status='PROCESSING'`, payoutID, nextAttemptAt)
	return err
}

type payoutQuerier interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func getPayoutWithQuerier(ctx context.Context, q payoutQuerier, sellerID, payoutID string) (domain.Payout, error) {
	var payout domain.Payout
	var last4 string
	err := q.QueryRow(ctx, `SELECT p.id,p.amount_minor,p.currency,p.status,p.bank_code,p.account_holder_name,p.account_number_last4,p.provider,p.provider_reference,p.failure_code,p.failure_message,p.requested_at,p.processed_at,p.created_at,p.updated_at FROM payouts p JOIN wallets w ON w.id=p.wallet_id WHERE w.seller_id=$1 AND p.id=$2`, sellerID, payoutID).Scan(&payout.ID, &payout.AmountMinor, &payout.Currency, &payout.Status, &payout.BankCode, &payout.AccountHolderName, &last4, &payout.Provider, &payout.ProviderReference, &payout.FailureCode, &payout.FailureMessage, &payout.RequestedAt, &payout.ProcessedAt, &payout.CreatedAt, &payout.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Payout{}, ErrPayoutNotFound
	}
	if err != nil {
		return domain.Payout{}, err
	}
	payout.MaskedAccountNumber = maskLast4(last4)
	return payout, nil
}

func maskLast4(last4 string) string { return "****" + last4 }
