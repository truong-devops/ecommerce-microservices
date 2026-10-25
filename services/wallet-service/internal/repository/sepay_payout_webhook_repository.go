package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"wallet-service/internal/domain"

	"github.com/jackc/pgx/v5"
)

const sePaySystemActorID = "00000000-0000-0000-0000-000000000000"

type SePayPayoutWebhookInput struct {
	TransactionID       string
	TransferCode        string
	Gateway             string
	SourceAccountNumber string
	AmountMinor         int64
	Content             string
	ReferenceCode       string
	TransactionAt       time.Time
	RawPayload          []byte
}

type SePayPayoutWebhookResult struct {
	Outcome   string
	PayoutID  string
	Duplicate bool
}

func (r *WalletRepository) ProcessSePayPayoutWebhook(ctx context.Context, input SePayPayoutWebhookInput) (SePayPayoutWebhookResult, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return SePayPayoutWebhookResult{}, err
	}
	defer tx.Rollback(ctx)

	var insertedID string
	err = tx.QueryRow(ctx, `
		INSERT INTO sepay_payout_webhook_events (
			transaction_id, gateway, source_account_number, transfer_amount_minor,
			transfer_content, reference_code, transaction_at, process_status, raw_payload
		) VALUES ($1, NULLIF($2, ''), $3, $4, NULLIF($5, ''), NULLIF($6, ''), $7, 'RECEIVED', $8::jsonb)
		ON CONFLICT (transaction_id) DO NOTHING
		RETURNING transaction_id
	`, input.TransactionID, input.Gateway, input.SourceAccountNumber, input.AmountMinor,
		input.Content, input.ReferenceCode, input.TransactionAt, string(input.RawPayload)).Scan(&insertedID)
	if errors.Is(err, pgx.ErrNoRows) {
		if commitErr := tx.Commit(ctx); commitErr != nil {
			return SePayPayoutWebhookResult{}, commitErr
		}
		return SePayPayoutWebhookResult{Outcome: "DUPLICATE", Duplicate: true}, nil
	}
	if err != nil {
		return SePayPayoutWebhookResult{}, err
	}

	if strings.TrimSpace(input.TransferCode) == "" {
		return finishSePayWebhook(ctx, tx, input.TransactionID, "UNMATCHED", "Payout transfer code was not found", "")
	}

	var payoutID, walletID, ownerID, currency, bankAccountID, payoutType string
	var ownerType domain.WalletOwnerType
	var amount int64
	var status domain.PayoutStatus
	var provider *string
	err = tx.QueryRow(ctx, `
		SELECT p.id, p.wallet_id, w.seller_id, w.owner_type, p.payout_type, p.amount_minor, p.currency,
		       p.status, p.bank_account_id, p.provider
		FROM payouts p
		JOIN wallets w ON w.id = p.wallet_id
		WHERE p.transfer_code = $1
		FOR UPDATE OF p
	`, input.TransferCode).Scan(&payoutID, &walletID, &ownerID, &ownerType, &payoutType, &amount, &currency, &status, &bankAccountID, &provider)
	if errors.Is(err, pgx.ErrNoRows) {
		return finishSePayWebhook(ctx, tx, input.TransactionID, "UNMATCHED", "No payout matches the transfer code", "")
	}
	if err != nil {
		return SePayPayoutWebhookResult{}, err
	}

	if status == domain.PayoutStatusSucceeded {
		return finishSePayWebhook(ctx, tx, input.TransactionID, "REVIEW_REQUIRED", "A distinct outgoing transaction matched an already completed payout", payoutID)
	}
	if status != domain.PayoutStatusProcessing || provider == nil || *provider != manualVietQRProvider {
		return finishSePayWebhook(ctx, tx, input.TransactionID, "REVIEW_REQUIRED", "Payout is not awaiting a manual VietQR transfer", payoutID)
	}
	if currency != "VND" || amount != input.AmountMinor {
		reason := fmt.Sprintf("Amount mismatch: expected %d %s, received %d VND", amount, currency, input.AmountMinor)
		return finishSePayWebhook(ctx, tx, input.TransactionID, "REVIEW_REQUIRED", reason, payoutID)
	}

	pendingID, err := ensureLedgerAccount(ctx, tx, &walletID, domain.AccountTypePayoutPending, currency)
	if err != nil {
		return SePayPayoutWebhookResult{}, err
	}
	platformPayoutID, err := ensureLedgerAccount(ctx, tx, nil, domain.AccountTypePlatformPayout, currency)
	if err != nil {
		return SePayPayoutWebhookResult{}, err
	}
	transactionID, err := insertLedgerTransaction(
		ctx, tx, domain.TransactionTypePayoutSuccess, "payout", payoutID,
		"payout-sepay-out:"+input.TransactionID, currency,
		"Bank payout confirmed automatically from SePay outgoing transaction", input.TransactionAt,
	)
	if err != nil {
		return SePayPayoutWebhookResult{}, err
	}
	if err = insertLedgerEntries(ctx, tx, transactionID, map[string]int64{pendingID: -amount, platformPayoutID: amount}); err != nil {
		return SePayPayoutWebhookResult{}, err
	}

	providerReference := strings.TrimSpace(input.ReferenceCode)
	if providerReference == "" {
		providerReference = "sepay:" + input.TransactionID
	}
	if len(providerReference) > 128 {
		providerReference = providerReference[:128]
	}
	if _, err = tx.Exec(ctx, `
		UPDATE payouts
		SET status = 'SUCCEEDED', provider_reference = $2, failure_code = NULL,
		    failure_message = NULL, processed_at = $3, last_reconciled_at = now(), updated_at = now()
		WHERE id = $1
	`, payoutID, providerReference, input.TransactionAt); err != nil {
		return SePayPayoutWebhookResult{}, err
	}
	auditInput := AdminActionInput{
		WalletID: walletID, ActorID: sePaySystemActorID, ActorEmail: "sepay-webhook@system.local",
		Reason: "Matched SePay outgoing transaction " + input.TransactionID,
	}
	if err = insertAdminAudit(ctx, tx, auditInput, "PAYOUT_TRANSFER_AUTO_CONFIRMED", &bankAccountID, string(status), string(domain.PayoutStatusSucceeded)); err != nil {
		return SePayPayoutWebhookResult{}, err
	}
	if err = refreshWalletFrozenState(ctx, tx, walletID); err != nil {
		return SePayPayoutWebhookResult{}, err
	}
	eventPayload := walletOwnerEventPayload(ownerID, ownerType)
	eventPayload["payoutId"] = payoutID
	eventPayload["payoutType"] = payoutType
	eventPayload["amount"] = amount
	eventPayload["currency"] = currency
	eventPayload["providerReference"] = providerReference
	eventPayload["confirmationSource"] = "sepay-outgoing-webhook"
	if err = insertOutboxEvent(ctx, tx, "payout", payoutID, "wallet.payout-succeeded", eventPayload); err != nil {
		return SePayPayoutWebhookResult{}, err
	}
	return finishSePayWebhook(ctx, tx, input.TransactionID, "MATCHED", "", payoutID)
}

func finishSePayWebhook(ctx context.Context, tx pgx.Tx, transactionID, outcome, reason, payoutID string) (SePayPayoutWebhookResult, error) {
	if _, err := tx.Exec(ctx, `
		UPDATE sepay_payout_webhook_events
		SET payout_id = NULLIF($2, '')::uuid, process_status = $3,
		    failure_reason = NULLIF($4, ''), processed_at = now()
		WHERE transaction_id = $1
	`, transactionID, payoutID, outcome, reason); err != nil {
		return SePayPayoutWebhookResult{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return SePayPayoutWebhookResult{}, err
	}
	return SePayPayoutWebhookResult{Outcome: outcome, PayoutID: payoutID}, nil
}
