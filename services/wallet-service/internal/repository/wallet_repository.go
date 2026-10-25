package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"wallet-service/internal/domain"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const walletEventConsumer = "wallet-service"

type WalletRepository struct {
	pool *pgxpool.Pool
}

type CaptureInput struct {
	PaymentID    string
	OrderID      string
	SellerID     string
	AmountMinor  int64
	Currency     string
	HoldDuration time.Duration
	Meta         domain.EventMeta
}

type DeliveryInput struct {
	OrderID      string
	SellerID     string
	DeliveredAt  time.Time
	HoldDuration time.Duration
	Meta         domain.EventMeta
}

type ReversalInput struct {
	PaymentID             string
	OrderID               string
	CustomerID            string
	SellerID              string
	CumulativeAmountMinor int64
	Currency              string
	IsChargeback          bool
	Meta                  domain.EventMeta
}

type ListTransactionsInput struct {
	OwnerID   string
	OwnerType domain.WalletOwnerType
	Currency  string
	Page      int
	PageSize  int
}

type OutboxEvent struct {
	ID         string
	EventType  string
	Payload    map[string]any
	RetryCount int
}

type holdRecord struct {
	ID             string
	WalletID       string
	PaymentID      string
	OrderID        string
	SellerID       string
	Currency       string
	CapturedAmount int64
	RefundedAmount int64
	ReleasedAmount int64
}

func NewWalletRepository(pool *pgxpool.Pool) *WalletRepository {
	return &WalletRepository{pool: pool}
}

func (r *WalletRepository) Ping(ctx context.Context) error {
	return r.pool.Ping(ctx)
}

func (r *WalletRepository) ApplyCapture(ctx context.Context, input CaptureInput) (bool, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)

	inserted, err := recordProcessedEvent(ctx, tx, input.Meta)
	if err != nil || !inserted {
		return false, finishDuplicate(ctx, tx, inserted, err)
	}

	walletID, err := ensureWallet(ctx, tx, input.SellerID, input.Currency)
	if err != nil {
		return false, err
	}
	platformAccountID, err := ensureLedgerAccount(ctx, tx, nil, domain.AccountTypePlatformClearing, input.Currency)
	if err != nil {
		return false, err
	}
	heldAccountID, err := ensureLedgerAccount(ctx, tx, &walletID, domain.AccountTypeSellerHeld, input.Currency)
	if err != nil {
		return false, err
	}
	if _, err := ensureLedgerAccount(ctx, tx, &walletID, domain.AccountTypeSellerAvailable, input.Currency); err != nil {
		return false, err
	}
	if _, err := ensureLedgerAccount(ctx, tx, &walletID, domain.AccountTypePayoutPending, input.Currency); err != nil {
		return false, err
	}

	var deliveredAt *time.Time
	err = tx.QueryRow(ctx, `
		SELECT delivered_at
		FROM order_delivery_signals
		WHERE order_id = $1 AND seller_id = $2
	`, input.OrderID, input.SellerID).Scan(&deliveredAt)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}
	if errors.Is(err, pgx.ErrNoRows) {
		deliveredAt = nil
	}

	var releaseAt *time.Time
	if deliveredAt != nil {
		value := deliveredAt.UTC().Add(input.HoldDuration)
		releaseAt = &value
	}

	var holdID string
	err = tx.QueryRow(ctx, `
		INSERT INTO fund_holds (
		  wallet_id, payment_id, order_id, seller_id, currency,
		  captured_amount_minor, delivered_at, release_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (payment_id) DO NOTHING
		RETURNING id
	`, walletID, input.PaymentID, input.OrderID, input.SellerID, input.Currency, input.AmountMinor, deliveredAt, releaseAt).Scan(&holdID)
	if errors.Is(err, pgx.ErrNoRows) {
		existing, findErr := findHoldForUpdate(ctx, tx, input.PaymentID)
		if findErr != nil {
			return false, findErr
		}
		if existing.OrderID != input.OrderID || existing.SellerID != input.SellerID || existing.Currency != input.Currency || existing.CapturedAmount != input.AmountMinor {
			return false, fmt.Errorf("capture identity mismatch for payment %s", input.PaymentID)
		}
		if err := tx.Commit(ctx); err != nil {
			return false, err
		}
		return false, nil
	}
	if err != nil {
		return false, err
	}

	transactionID, err := insertLedgerTransaction(ctx, tx, domain.TransactionTypePaymentHeld, "payment", input.PaymentID, "payment-captured:"+input.PaymentID, input.Currency, "Payment captured and held for seller", input.Meta.OccurredAt)
	if err != nil {
		return false, err
	}
	if err := insertLedgerEntries(ctx, tx, transactionID, map[string]int64{
		platformAccountID: -input.AmountMinor,
		heldAccountID:     input.AmountMinor,
	}); err != nil {
		return false, err
	}

	if err := insertOutboxEvent(ctx, tx, "fund_hold", holdID, "wallet.funds-held", map[string]any{
		"walletId": walletID, "sellerId": input.SellerID, "paymentId": input.PaymentID,
		"orderId": input.OrderID, "amount": input.AmountMinor, "currency": input.Currency,
		"releaseAt": releaseAt,
	}); err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx, `UPDATE wallets SET updated_at = now() WHERE id = $1`, walletID); err != nil {
		return false, err
	}

	var pendingAmount int64
	var pendingChargeback bool
	var pendingOccurredAt time.Time
	err = tx.QueryRow(ctx, `
		SELECT cumulative_amount_minor, is_chargeback, occurred_at
		FROM pending_payment_reversals
		WHERE payment_id = $1
		FOR UPDATE
	`, input.PaymentID).Scan(&pendingAmount, &pendingChargeback, &pendingOccurredAt)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}
	if err == nil {
		hold := holdRecord{
			ID: holdID, WalletID: walletID, PaymentID: input.PaymentID, OrderID: input.OrderID,
			SellerID: input.SellerID, Currency: input.Currency, CapturedAmount: input.AmountMinor,
		}
		var pendingCustomerID string
		if scanErr := tx.QueryRow(ctx, `SELECT COALESCE(customer_id::text, '') FROM pending_payment_reversals WHERE payment_id = $1`, input.PaymentID).Scan(&pendingCustomerID); scanErr != nil {
			return false, scanErr
		}
		if err := applyReversalToHold(ctx, tx, hold, pendingCustomerID, minInt64(pendingAmount, input.AmountMinor), pendingChargeback, pendingOccurredAt); err != nil {
			return false, err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM pending_payment_reversals WHERE payment_id = $1`, input.PaymentID); err != nil {
			return false, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

func (r *WalletRepository) ApplyDelivery(ctx context.Context, input DeliveryInput) (bool, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)

	inserted, err := recordProcessedEvent(ctx, tx, input.Meta)
	if err != nil || !inserted {
		return false, finishDuplicate(ctx, tx, inserted, err)
	}

	var storedOrderID string
	err = tx.QueryRow(ctx, `
		INSERT INTO order_delivery_signals (order_id, seller_id, delivered_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (order_id) DO UPDATE
		SET delivered_at = LEAST(order_delivery_signals.delivered_at, EXCLUDED.delivered_at),
		    updated_at = now()
		WHERE order_delivery_signals.seller_id = EXCLUDED.seller_id
		RETURNING order_id
	`, input.OrderID, input.SellerID, input.DeliveredAt).Scan(&storedOrderID)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, fmt.Errorf("order delivery seller mismatch for order %s", input.OrderID)
	}
	if err != nil {
		return false, err
	}

	releaseAt := input.DeliveredAt.UTC().Add(input.HoldDuration)
	if _, err := tx.Exec(ctx, `
		UPDATE fund_holds
		SET delivered_at = CASE
		      WHEN delivered_at IS NULL THEN $3
		      ELSE LEAST(delivered_at, $3)
		    END,
		    release_at = CASE
		      WHEN release_at IS NULL THEN $4
		      ELSE LEAST(release_at, $4)
		    END,
		    updated_at = now()
		WHERE order_id = $1 AND seller_id = $2
	`, input.OrderID, input.SellerID, input.DeliveredAt, releaseAt); err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE wallets
		SET updated_at = now()
		WHERE id IN (SELECT wallet_id FROM fund_holds WHERE order_id = $1 AND seller_id = $2)
	`, input.OrderID, input.SellerID); err != nil {
		return false, err
	}

	if err := insertOutboxEvent(ctx, tx, "order", input.OrderID, "wallet.delivery-recorded", map[string]any{
		"orderId": input.OrderID, "sellerId": input.SellerID,
		"deliveredAt": input.DeliveredAt, "releaseAt": releaseAt,
	}); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

func (r *WalletRepository) ApplyReversal(ctx context.Context, input ReversalInput) (bool, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)

	inserted, err := recordProcessedEvent(ctx, tx, input.Meta)
	if err != nil || !inserted {
		return false, finishDuplicate(ctx, tx, inserted, err)
	}

	hold, err := findHoldForUpdate(ctx, tx, input.PaymentID)
	if errors.Is(err, pgx.ErrNoRows) {
		var paymentID string
		err = tx.QueryRow(ctx, `
			INSERT INTO pending_payment_reversals (
			  payment_id, order_id, seller_id, customer_id, currency, cumulative_amount_minor, is_chargeback, occurred_at
			)
			VALUES ($1, $2, $3, NULLIF($4, '')::uuid, $5, $6, $7, $8)
			ON CONFLICT (payment_id) DO UPDATE
			SET cumulative_amount_minor = GREATEST(pending_payment_reversals.cumulative_amount_minor, EXCLUDED.cumulative_amount_minor),
			    is_chargeback = pending_payment_reversals.is_chargeback OR EXCLUDED.is_chargeback,
			    customer_id = COALESCE(pending_payment_reversals.customer_id, EXCLUDED.customer_id),
			    occurred_at = GREATEST(pending_payment_reversals.occurred_at, EXCLUDED.occurred_at),
			    updated_at = now()
			WHERE pending_payment_reversals.order_id = EXCLUDED.order_id
			  AND pending_payment_reversals.seller_id = EXCLUDED.seller_id
			  AND pending_payment_reversals.currency = EXCLUDED.currency
			RETURNING payment_id
		`, input.PaymentID, input.OrderID, input.SellerID, input.CustomerID, input.Currency, input.CumulativeAmountMinor, input.IsChargeback, input.Meta.OccurredAt).Scan(&paymentID)
		if errors.Is(err, pgx.ErrNoRows) {
			return false, fmt.Errorf("pending reversal identity mismatch for payment %s", input.PaymentID)
		}
		if err != nil {
			return false, err
		}
		if err := tx.Commit(ctx); err != nil {
			return false, err
		}
		return true, nil
	}
	if err != nil {
		return false, err
	}
	if hold.OrderID != input.OrderID || hold.SellerID != input.SellerID || hold.Currency != input.Currency {
		return false, fmt.Errorf("reversal identity mismatch for payment %s", input.PaymentID)
	}

	targetAmount := minInt64(input.CumulativeAmountMinor, hold.CapturedAmount)
	if targetAmount > hold.RefundedAmount {
		if err := applyReversalToHold(ctx, tx, hold, input.CustomerID, targetAmount, input.IsChargeback, input.Meta.OccurredAt); err != nil {
			return false, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

func (r *WalletRepository) ReleaseDueHolds(ctx context.Context, now time.Time, limit int) (int, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		SELECT id, wallet_id, payment_id, order_id, seller_id, currency,
		       captured_amount_minor, refunded_amount_minor, released_amount_minor
		FROM fund_holds
		WHERE release_at IS NOT NULL
		  AND release_at <= $1
		  AND status IN ('HELD', 'PARTIALLY_REFUNDED')
		ORDER BY release_at, id
		FOR UPDATE SKIP LOCKED
		LIMIT $2
	`, now, limit)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	holds := make([]holdRecord, 0, limit)
	for rows.Next() {
		var hold holdRecord
		if err := rows.Scan(&hold.ID, &hold.WalletID, &hold.PaymentID, &hold.OrderID, &hold.SellerID, &hold.Currency, &hold.CapturedAmount, &hold.RefundedAmount, &hold.ReleasedAmount); err != nil {
			return 0, err
		}
		holds = append(holds, hold)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	rows.Close()

	releasedCount := 0
	for _, hold := range holds {
		amount := hold.CapturedAmount - hold.RefundedAmount - hold.ReleasedAmount
		if amount <= 0 {
			if _, err := tx.Exec(ctx, `
				UPDATE fund_holds
				SET status = CASE
				      WHEN refunded_amount_minor >= captured_amount_minor THEN 'REFUNDED'
				      ELSE 'RELEASED'
				    END,
				    updated_at = now()
				WHERE id = $1
			`, hold.ID); err != nil {
				return 0, err
			}
			continue
		}
		heldAccountID, err := ensureLedgerAccount(ctx, tx, &hold.WalletID, domain.AccountTypeSellerHeld, hold.Currency)
		if err != nil {
			return 0, err
		}
		availableAccountID, err := ensureLedgerAccount(ctx, tx, &hold.WalletID, domain.AccountTypeSellerAvailable, hold.Currency)
		if err != nil {
			return 0, err
		}
		transactionID, err := insertLedgerTransaction(ctx, tx, domain.TransactionTypeFundsReleased, "fund_hold", hold.ID, "release:"+hold.ID, hold.Currency, "Held funds released to seller balance", now)
		if err != nil {
			return 0, err
		}
		if err := insertLedgerEntries(ctx, tx, transactionID, map[string]int64{
			heldAccountID:      -amount,
			availableAccountID: amount,
		}); err != nil {
			return 0, err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE fund_holds
			SET released_amount_minor = released_amount_minor + $2,
			    status = 'RELEASED',
			    updated_at = now()
			WHERE id = $1
		`, hold.ID, amount); err != nil {
			return 0, err
		}
		if err := refreshWalletFrozenState(ctx, tx, hold.WalletID); err != nil {
			return 0, err
		}
		if err := insertOutboxEvent(ctx, tx, "fund_hold", hold.ID, "wallet.funds-released", map[string]any{
			"walletId": hold.WalletID, "sellerId": hold.SellerID, "paymentId": hold.PaymentID,
			"orderId": hold.OrderID, "amount": amount, "currency": hold.Currency,
		}); err != nil {
			return 0, err
		}
		releasedCount++
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return releasedCount, nil
}

func (r *WalletRepository) GetBalance(ctx context.Context, ownerID string, ownerType domain.WalletOwnerType, currency string) (domain.WalletBalance, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return domain.WalletBalance{}, err
	}
	defer tx.Rollback(ctx)

	balance := domain.WalletBalance{OwnerID: ownerID, OwnerType: ownerType, Currency: currency, UpdatedAt: time.Now().UTC()}
	if ownerType == domain.WalletOwnerSeller {
		balance.SellerID = ownerID
	}
	var walletID string
	err = tx.QueryRow(ctx, `
		SELECT id, is_frozen, updated_at
		FROM wallets
		WHERE seller_id = $1 AND owner_type = $2 AND currency = $3
	`, ownerID, ownerType, currency).Scan(&walletID, &balance.IsFrozen, &balance.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		if err := tx.Commit(ctx); err != nil {
			return domain.WalletBalance{}, err
		}
		return balance, nil
	}
	if err != nil {
		return domain.WalletBalance{}, err
	}
	balance.WalletID = &walletID

	err = tx.QueryRow(ctx, `
		SELECT
		  COALESCE(SUM(e.amount_minor) FILTER (WHERE a.account_type = 'SELLER_HELD'), 0),
		  COALESCE(SUM(e.amount_minor) FILTER (WHERE a.account_type IN ('SELLER_AVAILABLE', 'CUSTOMER_AVAILABLE')), 0),
		  COALESCE(SUM(e.amount_minor) FILTER (WHERE a.account_type = 'PAYOUT_PENDING'), 0)
		FROM ledger_accounts a
		LEFT JOIN ledger_entries e ON e.account_id = a.id
		WHERE a.wallet_id = $1
	`, walletID).Scan(&balance.HeldAmount, &balance.AvailableAmount, &balance.PayoutPendingAmount)
	if err != nil {
		return domain.WalletBalance{}, err
	}
	if err := tx.QueryRow(ctx, `SELECT COALESCE(SUM(amount_minor), 0) FROM payouts WHERE wallet_id = $1 AND status = 'SUCCEEDED'`, walletID).Scan(&balance.TotalPaidOut); err != nil {
		return domain.WalletBalance{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.WalletBalance{}, err
	}
	return balance, nil
}

func (r *WalletRepository) ListTransactions(ctx context.Context, input ListTransactionsInput) (domain.TransactionPage, error) {
	result := domain.TransactionPage{Items: []domain.LedgerTransaction{}, Page: input.Page, PageSize: input.PageSize}
	var walletID string
	err := r.pool.QueryRow(ctx, `SELECT id FROM wallets WHERE seller_id = $1 AND owner_type = $2 AND currency = $3`, input.OwnerID, input.OwnerType, input.Currency).Scan(&walletID)
	if errors.Is(err, pgx.ErrNoRows) {
		return result, nil
	}
	if err != nil {
		return domain.TransactionPage{}, err
	}

	offset := (input.Page - 1) * input.PageSize
	rows, err := r.pool.Query(ctx, `
		WITH wallet_transactions AS (
		  SELECT
		    t.id, t.transaction_type, t.reference_type, t.reference_id, t.currency,
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
		FROM wallet_transactions
		ORDER BY occurred_at DESC, id DESC
		LIMIT $2 OFFSET $3
	`, walletID, input.PageSize, offset)
	if err != nil {
		return domain.TransactionPage{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var item domain.LedgerTransaction
		if err := rows.Scan(&item.ID, &item.TransactionType, &item.ReferenceType, &item.ReferenceID, &item.AmountMinor, &item.Currency, &item.Description, &item.OccurredAt, &item.CreatedAt, &result.TotalItems); err != nil {
			return domain.TransactionPage{}, err
		}
		result.Items = append(result.Items, item)
	}
	return result, rows.Err()
}

func (r *WalletRepository) FindDispatchableOutboxEvents(ctx context.Context, limit int) ([]OutboxEvent, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, event_type, payload, retry_count
		FROM outbox_events
		WHERE status IN ('PENDING', 'FAILED')
		  AND (next_retry_at IS NULL OR next_retry_at <= now())
		ORDER BY created_at
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]OutboxEvent, 0, limit)
	for rows.Next() {
		var event OutboxEvent
		var payload []byte
		if err := rows.Scan(&event.ID, &event.EventType, &payload, &event.RetryCount); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(payload, &event.Payload); err != nil {
			return nil, err
		}
		result = append(result, event)
	}
	return result, rows.Err()
}

func (r *WalletRepository) MarkOutboxPublished(ctx context.Context, eventID string) error {
	_, err := r.pool.Exec(ctx, `UPDATE outbox_events SET status = 'PUBLISHED', published_at = now() WHERE id = $1`, eventID)
	return err
}

func (r *WalletRepository) MarkOutboxFailed(ctx context.Context, eventID string, retryCount int, nextRetryAt *time.Time) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE outbox_events
		SET status = CASE WHEN $3::timestamptz IS NULL THEN 'DEAD' ELSE 'FAILED' END,
		    retry_count = $2,
		    next_retry_at = $3
		WHERE id = $1
	`, eventID, retryCount, nextRetryAt)
	return err
}

func recordProcessedEvent(ctx context.Context, tx pgx.Tx, meta domain.EventMeta) (bool, error) {
	eventID := strings.TrimSpace(meta.EventID)
	if eventID == "" {
		eventID = fmt.Sprintf("%s:%d:%d", meta.Topic, meta.Partition, meta.OffsetValue)
	}
	command, err := tx.Exec(ctx, `
		INSERT INTO processed_events (consumer_name, event_id, event_type, topic, partition, offset_value)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (consumer_name, event_id) DO NOTHING
	`, walletEventConsumer, eventID, meta.EventType, meta.Topic, meta.Partition, meta.OffsetValue)
	if err != nil {
		return false, err
	}
	return command.RowsAffected() == 1, nil
}

func finishDuplicate(ctx context.Context, tx pgx.Tx, inserted bool, processErr error) error {
	if processErr != nil {
		return processErr
	}
	if inserted {
		return nil
	}
	return tx.Commit(ctx)
}

func ensureWallet(ctx context.Context, tx pgx.Tx, sellerID, currency string) (string, error) {
	return ensureOwnerWallet(ctx, tx, sellerID, domain.WalletOwnerSeller, currency)
}

func ensureOwnerWallet(ctx context.Context, tx pgx.Tx, ownerID string, ownerType domain.WalletOwnerType, currency string) (string, error) {
	var walletID string
	err := tx.QueryRow(ctx, `
		INSERT INTO wallets (seller_id, owner_type, currency)
		VALUES ($1, $2, $3)
		ON CONFLICT (owner_type, seller_id, currency) DO UPDATE SET updated_at = wallets.updated_at
		RETURNING id
	`, ownerID, ownerType, currency).Scan(&walletID)
	return walletID, err
}

func ensureLedgerAccount(ctx context.Context, tx pgx.Tx, walletID *string, accountType domain.AccountType, currency string) (string, error) {
	var accountID string
	if walletID == nil {
		err := tx.QueryRow(ctx, `
			INSERT INTO ledger_accounts (wallet_id, account_type, currency)
			VALUES (NULL, $1, $2)
			ON CONFLICT (account_type, currency) WHERE wallet_id IS NULL
			DO UPDATE SET account_type = EXCLUDED.account_type
			RETURNING id
		`, accountType, currency).Scan(&accountID)
		return accountID, err
	}
	err := tx.QueryRow(ctx, `
		INSERT INTO ledger_accounts (wallet_id, account_type, currency)
		VALUES ($1, $2, $3)
		ON CONFLICT (wallet_id, account_type, currency) WHERE wallet_id IS NOT NULL
		DO UPDATE SET account_type = EXCLUDED.account_type
		RETURNING id
	`, *walletID, accountType, currency).Scan(&accountID)
	return accountID, err
}

func insertLedgerTransaction(ctx context.Context, tx pgx.Tx, transactionType domain.TransactionType, referenceType, referenceID, idempotencyKey, currency, description string, occurredAt time.Time) (string, error) {
	var transactionID string
	err := tx.QueryRow(ctx, `
		INSERT INTO ledger_transactions (
		  transaction_type, reference_type, reference_id, idempotency_key, currency, description, occurred_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id
	`, transactionType, referenceType, referenceID, idempotencyKey, currency, description, occurredAt).Scan(&transactionID)
	return transactionID, err
}

func insertLedgerEntries(ctx context.Context, tx pgx.Tx, transactionID string, entries map[string]int64) error {
	var total int64
	for accountID, amount := range entries {
		if amount == 0 {
			continue
		}
		total += amount
		if _, err := tx.Exec(ctx, `
			INSERT INTO ledger_entries (transaction_id, account_id, amount_minor)
			VALUES ($1, $2, $3)
		`, transactionID, accountID, amount); err != nil {
			return err
		}
	}
	if total != 0 {
		return fmt.Errorf("unbalanced ledger entries: total=%d", total)
	}
	return nil
}

func insertOutboxEvent(ctx context.Context, tx pgx.Tx, aggregateType, aggregateID, eventType string, payload map[string]any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
		VALUES ($1, $2, $3, $4)
	`, aggregateType, aggregateID, eventType, data)
	return err
}

func findHoldForUpdate(ctx context.Context, tx pgx.Tx, paymentID string) (holdRecord, error) {
	var hold holdRecord
	err := tx.QueryRow(ctx, `
		SELECT id, wallet_id, payment_id, order_id, seller_id, currency,
		       captured_amount_minor, refunded_amount_minor, released_amount_minor
		FROM fund_holds
		WHERE payment_id = $1
		FOR UPDATE
	`, paymentID).Scan(&hold.ID, &hold.WalletID, &hold.PaymentID, &hold.OrderID, &hold.SellerID, &hold.Currency, &hold.CapturedAmount, &hold.RefundedAmount, &hold.ReleasedAmount)
	return hold, err
}

func applyReversalToHold(ctx context.Context, tx pgx.Tx, hold holdRecord, customerID string, targetAmount int64, chargeback bool, occurredAt time.Time) error {
	delta := targetAmount - hold.RefundedAmount
	if delta <= 0 {
		return nil
	}
	heldRemaining := hold.CapturedAmount - hold.RefundedAmount - hold.ReleasedAmount
	if heldRemaining < 0 {
		heldRemaining = 0
	}
	fromHeld := minInt64(delta, heldRemaining)
	fromAvailable := delta - fromHeld

	platformAccountID, err := ensureLedgerAccount(ctx, tx, nil, domain.AccountTypePlatformClearing, hold.Currency)
	if err != nil {
		return err
	}
	heldAccountID, err := ensureLedgerAccount(ctx, tx, &hold.WalletID, domain.AccountTypeSellerHeld, hold.Currency)
	if err != nil {
		return err
	}
	availableAccountID, err := ensureLedgerAccount(ctx, tx, &hold.WalletID, domain.AccountTypeSellerAvailable, hold.Currency)
	if err != nil {
		return err
	}

	transactionType := domain.TransactionTypePaymentRefund
	description := "Payment refund reversed from seller wallet"
	if chargeback {
		transactionType = domain.TransactionTypeChargeback
		description = "Payment chargeback reversed from seller wallet"
	}
	transactionID, err := insertLedgerTransaction(
		ctx, tx, transactionType, "payment", hold.PaymentID,
		"reversal:"+hold.PaymentID+":"+strconv.FormatInt(targetAmount, 10),
		hold.Currency, description, occurredAt,
	)
	if err != nil {
		return err
	}
	entries := map[string]int64{platformAccountID: delta}
	if fromHeld > 0 {
		entries[heldAccountID] = -fromHeld
	}
	if fromAvailable > 0 {
		entries[availableAccountID] = -fromAvailable
	}
	if err := insertLedgerEntries(ctx, tx, transactionID, entries); err != nil {
		return err
	}
	if !chargeback {
		if strings.TrimSpace(customerID) == "" {
			return fmt.Errorf("customer id is required for payment refund %s", hold.PaymentID)
		}
		customerWalletID, err := ensureOwnerWallet(ctx, tx, customerID, domain.WalletOwnerCustomer, hold.Currency)
		if err != nil {
			return err
		}
		customerAvailableID, err := ensureLedgerAccount(ctx, tx, &customerWalletID, domain.AccountTypeCustomerAvailable, hold.Currency)
		if err != nil {
			return err
		}
		if _, err := ensureLedgerAccount(ctx, tx, &customerWalletID, domain.AccountTypePayoutPending, hold.Currency); err != nil {
			return err
		}
		creditTransactionID, err := insertLedgerTransaction(
			ctx, tx, domain.TransactionTypeCustomerRefundCredit, "payment", hold.PaymentID,
			"customer-refund-credit:"+hold.PaymentID+":"+strconv.FormatInt(targetAmount, 10),
			hold.Currency, "Payment refund credited to customer wallet", occurredAt,
		)
		if err != nil {
			return err
		}
		if err := insertLedgerEntries(ctx, tx, creditTransactionID, map[string]int64{
			platformAccountID: -delta, customerAvailableID: delta,
		}); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE wallets SET updated_at = now() WHERE id = $1`, customerWalletID); err != nil {
			return err
		}
		if err := insertOutboxEvent(ctx, tx, "wallet", customerWalletID, "wallet.customer-refund-credited", map[string]any{
			"walletId": customerWalletID, "ownerId": customerID, "ownerType": domain.WalletOwnerCustomer,
			"customerId": customerID, "paymentId": hold.PaymentID, "orderId": hold.OrderID,
			"amount": delta, "refundedAmount": targetAmount, "currency": hold.Currency,
		}); err != nil {
			return err
		}
	}

	status := domain.HoldStatusPartiallyRefunded
	if targetAmount >= hold.CapturedAmount {
		status = domain.HoldStatusRefunded
	} else if hold.ReleasedAmount >= hold.CapturedAmount-targetAmount {
		status = domain.HoldStatusReleased
	}
	if _, err := tx.Exec(ctx, `
		UPDATE fund_holds
		SET refunded_amount_minor = $2, status = $3, updated_at = now()
		WHERE id = $1
	`, hold.ID, targetAmount, status); err != nil {
		return err
	}
	if err := refreshWalletFrozenState(ctx, tx, hold.WalletID); err != nil {
		return err
	}
	eventType := "wallet.payment-refunded"
	if chargeback {
		eventType = "wallet.payment-charged-back"
	}
	return insertOutboxEvent(ctx, tx, "fund_hold", hold.ID, eventType, map[string]any{
		"walletId": hold.WalletID, "sellerId": hold.SellerID, "paymentId": hold.PaymentID,
		"orderId": hold.OrderID, "amount": delta, "refundedAmount": targetAmount, "currency": hold.Currency,
	})
}

func refreshWalletFrozenState(ctx context.Context, tx pgx.Tx, walletID string) error {
	_, err := tx.Exec(ctx, `
		UPDATE wallets w
		SET is_frozen = COALESCE((
		      SELECT SUM(e.amount_minor) < 0
		      FROM ledger_accounts a
		      LEFT JOIN ledger_entries e ON e.account_id = a.id
		      WHERE a.wallet_id = w.id AND a.account_type IN ('SELLER_AVAILABLE', 'CUSTOMER_AVAILABLE')
		      GROUP BY a.id
		    ), false),
		    updated_at = now()
		WHERE w.id = $1
	`, walletID)
	return err
}

func minInt64(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}
