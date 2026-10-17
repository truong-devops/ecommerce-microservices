package repository

import (
	"context"
	"errors"
	"time"

	"wallet-service/internal/domain"

	"github.com/jackc/pgx/v5"
)

type ListAdminWalletsInput struct {
	Currency   string
	Search     string
	State      string
	BankStatus string
	Page       int
	PageSize   int
}

type ListAdminPayoutsInput struct {
	WalletID string
	Status   domain.PayoutStatus
	Page     int
	PageSize int
}

type ListAdminAuditLogsInput struct {
	WalletID string
	Page     int
	PageSize int
}

type AdminActionInput struct {
	WalletID   string
	ActorID    string
	ActorEmail string
	Reason     string
}

type scanRow interface {
	Scan(dest ...any) error
}

func (r *WalletRepository) GetAdminWalletSummary(ctx context.Context, currency string) (domain.AdminWalletSummary, error) {
	var result domain.AdminWalletSummary
	err := r.pool.QueryRow(ctx, `
		WITH balances AS (
		  SELECT w.id, w.is_frozen,
		         COALESCE(SUM(e.amount_minor) FILTER (WHERE a.account_type = 'SELLER_HELD'), 0) AS held_amount,
		         COALESCE(SUM(e.amount_minor) FILTER (WHERE a.account_type = 'SELLER_AVAILABLE'), 0) AS available_amount,
		         COALESCE(SUM(e.amount_minor) FILTER (WHERE a.account_type = 'PAYOUT_PENDING'), 0) AS payout_pending_amount
		  FROM wallets w
		  LEFT JOIN ledger_accounts a ON a.wallet_id = w.id
		  LEFT JOIN ledger_entries e ON e.account_id = a.id
		  WHERE w.currency = $1
		  GROUP BY w.id
		), paid AS (
		  SELECT wallet_id, COALESCE(SUM(amount_minor), 0) AS total_paid_out
		  FROM payouts WHERE status = 'SUCCEEDED' AND currency = $1 GROUP BY wallet_id
		)
		SELECT COUNT(*),
		       COUNT(*) FILTER (WHERE balances.is_frozen),
		       COUNT(*) FILTER (WHERE bank.status = 'UNVERIFIED'),
		       COUNT(*) FILTER (WHERE bank.status = 'DISABLED'),
		       (SELECT COUNT(*) FROM payouts WHERE currency = $1 AND status IN ('REQUESTED', 'PROCESSING')),
		       COALESCE(SUM(balances.held_amount), 0),
		       COALESCE(SUM(balances.available_amount), 0),
		       COALESCE(SUM(balances.payout_pending_amount), 0),
		       COALESCE(SUM(paid.total_paid_out), 0)
		FROM balances
		LEFT JOIN bank_accounts bank ON bank.wallet_id = balances.id AND bank.is_default = true
		LEFT JOIN paid ON paid.wallet_id = balances.id
	`, currency).Scan(
		&result.TotalWallets,
		&result.FrozenWallets,
		&result.UnverifiedBankAccounts,
		&result.DisabledBankAccounts,
		&result.PendingPayouts,
		&result.HeldAmount,
		&result.AvailableAmount,
		&result.PayoutPendingAmount,
		&result.TotalPaidOut,
	)
	return result, err
}

func (r *WalletRepository) ListAdminWallets(ctx context.Context, input ListAdminWalletsInput) (domain.AdminWalletPage, error) {
	result := domain.AdminWalletPage{Items: []domain.AdminWallet{}, Page: input.Page, PageSize: input.PageSize}
	offset := (input.Page - 1) * input.PageSize
	rows, err := r.pool.Query(ctx, `
		WITH balances AS (
		  SELECT w.id, w.seller_id, w.currency, w.is_frozen, w.created_at, w.updated_at,
		         COALESCE(SUM(e.amount_minor) FILTER (WHERE a.account_type = 'SELLER_HELD'), 0) AS held_amount,
		         COALESCE(SUM(e.amount_minor) FILTER (WHERE a.account_type = 'SELLER_AVAILABLE'), 0) AS available_amount,
		         COALESCE(SUM(e.amount_minor) FILTER (WHERE a.account_type = 'PAYOUT_PENDING'), 0) AS payout_pending_amount
		  FROM wallets w
		  LEFT JOIN ledger_accounts a ON a.wallet_id = w.id
		  LEFT JOIN ledger_entries e ON e.account_id = a.id
		  WHERE w.currency = $1
		  GROUP BY w.id
		), paid AS (
		  SELECT wallet_id, COALESCE(SUM(amount_minor), 0) AS total_paid_out
		  FROM payouts WHERE status = 'SUCCEEDED' AND currency = $1 GROUP BY wallet_id
		)
		SELECT balances.id, balances.seller_id, balances.currency,
		       balances.held_amount, balances.available_amount, balances.payout_pending_amount,
		       COALESCE(paid.total_paid_out, 0), balances.is_frozen,
		       COALESCE(bank.id::text, ''), COALESCE(bank.bank_code, ''),
		       COALESCE(bank.account_holder_name, ''), COALESCE(bank.account_number_last4, ''),
		       COALESCE(bank.status, ''), COALESCE(bank.is_default, false),
		       COALESCE(bank.created_at, 'epoch'::timestamptz), COALESCE(bank.updated_at, 'epoch'::timestamptz),
		       balances.created_at, balances.updated_at, COUNT(*) OVER()
		FROM balances
		LEFT JOIN paid ON paid.wallet_id = balances.id
		LEFT JOIN bank_accounts bank ON bank.wallet_id = balances.id AND bank.is_default = true
		WHERE ($2 = '' OR balances.seller_id::text ILIKE '%' || $2 || '%' OR bank.account_holder_name ILIKE '%' || $2 || '%' OR bank.account_number_last4 ILIKE '%' || $2 || '%')
		  AND ($3 = '' OR ($3 = 'FROZEN' AND balances.is_frozen) OR ($3 = 'ACTIVE' AND NOT balances.is_frozen))
		  AND ($4 = '' OR ($4 = 'MISSING' AND bank.id IS NULL) OR bank.status = $4)
		ORDER BY balances.updated_at DESC, balances.id DESC
		LIMIT $5 OFFSET $6
	`, input.Currency, input.Search, input.State, input.BankStatus, input.PageSize, offset)
	if err != nil {
		return domain.AdminWalletPage{}, err
	}
	defer rows.Close()
	for rows.Next() {
		item, scanErr := scanAdminWallet(rows, &result.TotalItems)
		if scanErr != nil {
			return domain.AdminWalletPage{}, scanErr
		}
		result.Items = append(result.Items, item)
	}
	return result, rows.Err()
}

func (r *WalletRepository) GetAdminWallet(ctx context.Context, walletID string) (domain.AdminWallet, error) {
	row := r.pool.QueryRow(ctx, `
		WITH balance AS (
		  SELECT w.id, w.seller_id, w.currency, w.is_frozen, w.created_at, w.updated_at,
		         COALESCE(SUM(e.amount_minor) FILTER (WHERE a.account_type = 'SELLER_HELD'), 0) AS held_amount,
		         COALESCE(SUM(e.amount_minor) FILTER (WHERE a.account_type = 'SELLER_AVAILABLE'), 0) AS available_amount,
		         COALESCE(SUM(e.amount_minor) FILTER (WHERE a.account_type = 'PAYOUT_PENDING'), 0) AS payout_pending_amount
		  FROM wallets w
		  LEFT JOIN ledger_accounts a ON a.wallet_id = w.id
		  LEFT JOIN ledger_entries e ON e.account_id = a.id
		  WHERE w.id = $1
		  GROUP BY w.id
		)
		SELECT balance.id, balance.seller_id, balance.currency,
		       balance.held_amount, balance.available_amount, balance.payout_pending_amount,
		       COALESCE((SELECT SUM(amount_minor) FROM payouts WHERE wallet_id = balance.id AND status = 'SUCCEEDED'), 0),
		       balance.is_frozen,
		       COALESCE(bank.id::text, ''), COALESCE(bank.bank_code, ''),
		       COALESCE(bank.account_holder_name, ''), COALESCE(bank.account_number_last4, ''),
		       COALESCE(bank.status, ''), COALESCE(bank.is_default, false),
		       COALESCE(bank.created_at, 'epoch'::timestamptz), COALESCE(bank.updated_at, 'epoch'::timestamptz),
		       balance.created_at, balance.updated_at
		FROM balance
		LEFT JOIN bank_accounts bank ON bank.wallet_id = balance.id AND bank.is_default = true
	`, walletID)
	item, err := scanAdminWallet(row, nil)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.AdminWallet{}, ErrWalletNotFound
	}
	return item, err
}

func scanAdminWallet(row scanRow, totalItems *int64) (domain.AdminWallet, error) {
	var item domain.AdminWallet
	var bankID, bankCode, holderName, last4, bankStatus string
	var bankDefault bool
	var bankCreatedAt, bankUpdatedAt time.Time
	dest := []any{
		&item.ID, &item.SellerID, &item.Currency,
		&item.HeldAmount, &item.AvailableAmount, &item.PayoutPendingAmount,
		&item.TotalPaidOut, &item.IsFrozen,
		&bankID, &bankCode, &holderName, &last4, &bankStatus, &bankDefault,
		&bankCreatedAt, &bankUpdatedAt, &item.CreatedAt, &item.UpdatedAt,
	}
	if totalItems != nil {
		dest = append(dest, totalItems)
	}
	if err := row.Scan(dest...); err != nil {
		return domain.AdminWallet{}, err
	}
	if bankID != "" {
		item.BankAccount = &domain.BankAccount{
			ID: bankID, BankCode: bankCode, AccountHolderName: holderName,
			MaskedAccountNumber: maskLast4(last4), Status: domain.BankAccountStatus(bankStatus),
			IsDefault: bankDefault, CreatedAt: bankCreatedAt, UpdatedAt: bankUpdatedAt,
		}
	}
	return item, nil
}

func (r *WalletRepository) SetAdminWalletFrozen(ctx context.Context, input AdminActionInput, frozen bool) (domain.AdminWallet, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return domain.AdminWallet{}, err
	}
	defer tx.Rollback(ctx)
	var previous bool
	err = tx.QueryRow(ctx, `SELECT is_frozen FROM wallets WHERE id = $1 FOR UPDATE`, input.WalletID).Scan(&previous)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.AdminWallet{}, ErrWalletNotFound
	}
	if err != nil {
		return domain.AdminWallet{}, err
	}
	if _, err = tx.Exec(ctx, `UPDATE wallets SET is_frozen = $2, updated_at = now() WHERE id = $1`, input.WalletID, frozen); err != nil {
		return domain.AdminWallet{}, err
	}
	action := "WALLET_UNFROZEN"
	if frozen {
		action = "WALLET_FROZEN"
	}
	if err = insertAdminAudit(ctx, tx, input, action, nil, boolStatus(previous), boolStatus(frozen)); err != nil {
		return domain.AdminWallet{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return domain.AdminWallet{}, err
	}
	return r.GetAdminWallet(ctx, input.WalletID)
}

func (r *WalletRepository) SetAdminBankAccountStatus(ctx context.Context, input AdminActionInput, status domain.BankAccountStatus) (domain.AdminWallet, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return domain.AdminWallet{}, err
	}
	defer tx.Rollback(ctx)
	var bankAccountID string
	var previous domain.BankAccountStatus
	err = tx.QueryRow(ctx, `
		SELECT id, status FROM bank_accounts
		WHERE wallet_id = $1 AND is_default = true FOR UPDATE
	`, input.WalletID).Scan(&bankAccountID, &previous)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.AdminWallet{}, ErrBankAccountNotFound
	}
	if err != nil {
		return domain.AdminWallet{}, err
	}
	if _, err = tx.Exec(ctx, `UPDATE bank_accounts SET status = $2, updated_at = now() WHERE id = $1`, bankAccountID, status); err != nil {
		return domain.AdminWallet{}, err
	}
	if _, err = tx.Exec(ctx, `UPDATE wallets SET updated_at = now() WHERE id = $1`, input.WalletID); err != nil {
		return domain.AdminWallet{}, err
	}
	action := "BANK_ACCOUNT_STATUS_CHANGED"
	if status == domain.BankAccountStatusAllowlisted {
		action = "BANK_ACCOUNT_VERIFIED"
	} else if status == domain.BankAccountStatusDisabled {
		action = "BANK_ACCOUNT_DISABLED"
	}
	if err = insertAdminAudit(ctx, tx, input, action, &bankAccountID, string(previous), string(status)); err != nil {
		return domain.AdminWallet{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return domain.AdminWallet{}, err
	}
	return r.GetAdminWallet(ctx, input.WalletID)
}

func insertAdminAudit(ctx context.Context, tx pgx.Tx, input AdminActionInput, action string, bankAccountID *string, previousStatus, newStatus string) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO wallet_admin_audit_logs (
		  actor_id, actor_email, action, wallet_id, bank_account_id, previous_status, new_status, reason
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
	`, input.ActorID, input.ActorEmail, action, input.WalletID, bankAccountID, previousStatus, newStatus, input.Reason)
	return err
}

func boolStatus(value bool) string {
	if value {
		return "FROZEN"
	}
	return "ACTIVE"
}

func (r *WalletRepository) ListAdminTransactions(ctx context.Context, walletID string, page, pageSize int) (domain.TransactionPage, error) {
	var exists bool
	if err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wallets WHERE id = $1)`, walletID).Scan(&exists); err != nil {
		return domain.TransactionPage{}, err
	}
	if !exists {
		return domain.TransactionPage{}, ErrWalletNotFound
	}
	result := domain.TransactionPage{Items: []domain.LedgerTransaction{}, Page: page, PageSize: pageSize}
	offset := (page - 1) * pageSize
	rows, err := r.pool.Query(ctx, `
		WITH wallet_transactions AS (
		  SELECT t.id, t.transaction_type, t.reference_type, t.reference_id, t.currency,
		         t.description, t.occurred_at, t.created_at,
		         COALESCE(SUM(e.amount_minor) FILTER (WHERE a.wallet_id = $1), 0) AS amount_minor
		  FROM ledger_transactions t
		  JOIN ledger_entries e ON e.transaction_id = t.id
		  JOIN ledger_accounts a ON a.id = e.account_id
		  GROUP BY t.id
		  HAVING BOOL_OR(a.wallet_id = $1)
		)
		SELECT id, transaction_type, reference_type, reference_id, amount_minor,
		       currency, description, occurred_at, created_at, COUNT(*) OVER()
		FROM wallet_transactions ORDER BY occurred_at DESC, id DESC LIMIT $2 OFFSET $3
	`, walletID, pageSize, offset)
	if err != nil {
		return domain.TransactionPage{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var item domain.LedgerTransaction
		if err = rows.Scan(&item.ID, &item.TransactionType, &item.ReferenceType, &item.ReferenceID, &item.AmountMinor, &item.Currency, &item.Description, &item.OccurredAt, &item.CreatedAt, &result.TotalItems); err != nil {
			return domain.TransactionPage{}, err
		}
		result.Items = append(result.Items, item)
	}
	return result, rows.Err()
}

func (r *WalletRepository) ListAdminPayouts(ctx context.Context, input ListAdminPayoutsInput) (domain.AdminPayoutPage, error) {
	result := domain.AdminPayoutPage{Items: []domain.AdminPayout{}, Page: input.Page, PageSize: input.PageSize}
	offset := (input.Page - 1) * input.PageSize
	rows, err := r.pool.Query(ctx, `
		SELECT p.id, p.amount_minor, p.currency, p.status, p.bank_code, p.account_holder_name,
		       p.account_number_last4, p.provider, p.provider_reference, p.failure_code, p.failure_message,
		       p.requested_at, p.processed_at, p.created_at, p.updated_at,
		       w.id, w.seller_id, COUNT(*) OVER()
		FROM payouts p JOIN wallets w ON w.id = p.wallet_id
		WHERE ($1 = '' OR w.id::text = $1) AND ($2 = '' OR p.status = $2)
		ORDER BY p.requested_at DESC, p.id DESC LIMIT $3 OFFSET $4
	`, input.WalletID, input.Status, input.PageSize, offset)
	if err != nil {
		return domain.AdminPayoutPage{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var item domain.AdminPayout
		var last4 string
		if err = rows.Scan(
			&item.ID, &item.AmountMinor, &item.Currency, &item.Status, &item.BankCode, &item.AccountHolderName,
			&last4, &item.Provider, &item.ProviderReference, &item.FailureCode, &item.FailureMessage,
			&item.RequestedAt, &item.ProcessedAt, &item.CreatedAt, &item.UpdatedAt,
			&item.WalletID, &item.SellerID, &result.TotalItems,
		); err != nil {
			return domain.AdminPayoutPage{}, err
		}
		item.MaskedAccountNumber = maskLast4(last4)
		result.Items = append(result.Items, item)
	}
	return result, rows.Err()
}

func (r *WalletRepository) ListAdminAuditLogs(ctx context.Context, input ListAdminAuditLogsInput) (domain.AdminAuditLogPage, error) {
	result := domain.AdminAuditLogPage{Items: []domain.AdminAuditLog{}, Page: input.Page, PageSize: input.PageSize}
	offset := (input.Page - 1) * input.PageSize
	rows, err := r.pool.Query(ctx, `
		SELECT id, actor_id, actor_email, action, wallet_id, bank_account_id,
		       previous_status, new_status, reason, created_at, COUNT(*) OVER()
		FROM wallet_admin_audit_logs
		WHERE ($1 = '' OR wallet_id::text = $1)
		ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3
	`, input.WalletID, input.PageSize, offset)
	if err != nil {
		return domain.AdminAuditLogPage{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var item domain.AdminAuditLog
		if err = rows.Scan(
			&item.ID, &item.ActorID, &item.ActorEmail, &item.Action, &item.WalletID,
			&item.BankAccountID, &item.PreviousStatus, &item.NewStatus, &item.Reason,
			&item.CreatedAt, &result.TotalItems,
		); err != nil {
			return domain.AdminAuditLogPage{}, err
		}
		result.Items = append(result.Items, item)
	}
	return result, rows.Err()
}
