package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"wallet-service/internal/domain"

	"github.com/jackc/pgx/v5"
)

const manualVietQRProvider = "manual_vietqr"

type PrepareManualPayoutInput struct {
	PayoutID     string
	ActorID      string
	ActorEmail   string
	Reason       string
	TransferCode string
}

type ManualPayoutData struct {
	PayoutID, WalletID, OwnerID, Currency, BankAccountID, BankCode, AccountHolderName string
	OwnerType                                                                         domain.WalletOwnerType
	PayoutType                                                                        string
	AmountMinor                                                                       int64
	Status                                                                            domain.PayoutStatus
	EncryptedAccountNumber, EncryptionNonce                                           []byte
}

type CompleteManualPayoutInput struct {
	PayoutID, ActorID, ActorEmail, Reason, ProviderReference string
	Status                                                   domain.PayoutStatus
	ProcessedAt                                              time.Time
}

func (r *WalletRepository) PrepareManualPayout(ctx context.Context, input PrepareManualPayoutInput) (ManualPayoutData, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return ManualPayoutData{}, err
	}
	defer tx.Rollback(ctx)

	var result ManualPayoutData
	var provider *string
	err = tx.QueryRow(ctx, `
		SELECT p.id, p.wallet_id, w.seller_id, w.owner_type, p.payout_type, p.amount_minor, p.currency, p.status,
		       p.bank_account_id, p.bank_code, p.account_holder_name,
		       p.encrypted_account_number, p.encryption_nonce, p.provider
		FROM payouts p
		JOIN wallets w ON w.id = p.wallet_id
		WHERE p.id = $1
		FOR UPDATE OF p
	`, input.PayoutID).Scan(
		&result.PayoutID, &result.WalletID, &result.OwnerID, &result.OwnerType, &result.PayoutType, &result.AmountMinor,
		&result.Currency, &result.Status, &result.BankAccountID, &result.BankCode,
		&result.AccountHolderName, &result.EncryptedAccountNumber, &result.EncryptionNonce,
		&provider,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return ManualPayoutData{}, ErrPayoutNotFound
	}
	if err != nil {
		return ManualPayoutData{}, err
	}
	if result.Status != domain.PayoutStatusRequested && result.Status != domain.PayoutStatusProcessing {
		return ManualPayoutData{}, ErrPayoutStateConflict
	}
	if provider != nil && *provider != "" && *provider != manualVietQRProvider {
		return ManualPayoutData{}, ErrPayoutStateConflict
	}

	if result.Status == domain.PayoutStatusRequested {
		if _, err = tx.Exec(ctx, `
			UPDATE payouts
			SET status = 'PROCESSING', provider = $2, transfer_code = $3,
			    processing_started_at = now(), updated_at = now()
			WHERE id = $1
		`, input.PayoutID, manualVietQRProvider, input.TransferCode); err != nil {
			return ManualPayoutData{}, err
		}
		auditInput := AdminActionInput{WalletID: result.WalletID, ActorID: input.ActorID, ActorEmail: input.ActorEmail, Reason: input.Reason}
		if err = insertAdminAudit(ctx, tx, auditInput, "PAYOUT_TRANSFER_PREPARED", &result.BankAccountID, string(result.Status), string(domain.PayoutStatusProcessing)); err != nil {
			return ManualPayoutData{}, err
		}
		result.Status = domain.PayoutStatusProcessing
	} else if _, err = tx.Exec(ctx, `
		UPDATE payouts
		SET provider = $2, transfer_code = $3, updated_at = now()
		WHERE id = $1
	`, input.PayoutID, manualVietQRProvider, input.TransferCode); err != nil {
		return ManualPayoutData{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return ManualPayoutData{}, err
	}
	return result, nil
}

func (r *WalletRepository) CompleteManualPayout(ctx context.Context, input CompleteManualPayoutInput) (domain.AdminPayout, bool, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return domain.AdminPayout{}, false, err
	}
	defer tx.Rollback(ctx)

	var walletID, ownerID, currency, bankAccountID, payoutType string
	var ownerType domain.WalletOwnerType
	var amount int64
	var current domain.PayoutStatus
	var provider *string
	err = tx.QueryRow(ctx, `
		SELECT p.wallet_id, w.seller_id, w.owner_type, p.payout_type, p.amount_minor, p.currency, p.status, p.bank_account_id, p.provider
		FROM payouts p JOIN wallets w ON w.id = p.wallet_id
		WHERE p.id = $1 FOR UPDATE OF p
	`, input.PayoutID).Scan(&walletID, &ownerID, &ownerType, &payoutType, &amount, &currency, &current, &bankAccountID, &provider)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.AdminPayout{}, false, ErrPayoutNotFound
	}
	if err != nil {
		return domain.AdminPayout{}, false, err
	}
	if current == input.Status {
		if err = tx.Commit(ctx); err != nil {
			return domain.AdminPayout{}, false, err
		}
		result, getErr := r.GetAdminPayout(ctx, input.PayoutID)
		return result, false, getErr
	}
	if current != domain.PayoutStatusProcessing || (provider != nil && *provider != "" && *provider != manualVietQRProvider) {
		return domain.AdminPayout{}, false, ErrPayoutStateConflict
	}
	if input.Status != domain.PayoutStatusSucceeded && input.Status != domain.PayoutStatusCancelled {
		return domain.AdminPayout{}, false, fmt.Errorf("unsupported manual payout status %s", input.Status)
	}

	pendingID, err := ensureLedgerAccount(ctx, tx, &walletID, domain.AccountTypePayoutPending, currency)
	if err != nil {
		return domain.AdminPayout{}, false, err
	}
	var targetID string
	transactionType := domain.TransactionTypePayoutSuccess
	eventType := "wallet.payout-succeeded"
	description := "Manual bank payout confirmed by administrator"
	action := "PAYOUT_TRANSFER_CONFIRMED"
	failureCode, failureMessage := "", ""
	if input.Status == domain.PayoutStatusSucceeded {
		targetID, err = ensureLedgerAccount(ctx, tx, nil, domain.AccountTypePlatformPayout, currency)
	} else {
		targetID, err = ensureLedgerAccount(ctx, tx, &walletID, availableAccountType(ownerType), currency)
		transactionType = domain.TransactionTypePayoutCancel
		eventType = "wallet.payout-cancelled"
		description = "Rejected payout returned to wallet balance"
		action = "PAYOUT_TRANSFER_REJECTED"
		failureCode = "ADMIN_REJECTED"
		failureMessage = input.Reason
	}
	if err != nil {
		return domain.AdminPayout{}, false, err
	}
	transactionID, err := insertLedgerTransaction(ctx, tx, transactionType, "payout", input.PayoutID, "payout-manual-complete:"+input.PayoutID, currency, description, input.ProcessedAt)
	if err != nil {
		return domain.AdminPayout{}, false, err
	}
	if err = insertLedgerEntries(ctx, tx, transactionID, map[string]int64{pendingID: -amount, targetID: amount}); err != nil {
		return domain.AdminPayout{}, false, err
	}
	if _, err = tx.Exec(ctx, `
		UPDATE payouts SET status=$2, provider=$3, provider_reference=NULLIF($4,''),
		failure_code=NULLIF($5,''), failure_message=NULLIF($6,''), processed_at=$7, updated_at=now()
		WHERE id=$1
	`, input.PayoutID, input.Status, manualVietQRProvider, input.ProviderReference, failureCode, failureMessage, input.ProcessedAt); err != nil {
		return domain.AdminPayout{}, false, err
	}
	auditInput := AdminActionInput{WalletID: walletID, ActorID: input.ActorID, ActorEmail: input.ActorEmail, Reason: input.Reason}
	if err = insertAdminAudit(ctx, tx, auditInput, action, &bankAccountID, string(current), string(input.Status)); err != nil {
		return domain.AdminPayout{}, false, err
	}
	if err = refreshWalletFrozenState(ctx, tx, walletID); err != nil {
		return domain.AdminPayout{}, false, err
	}
	eventPayload := walletOwnerEventPayload(ownerID, ownerType)
	eventPayload["payoutId"] = input.PayoutID
	eventPayload["payoutType"] = payoutType
	eventPayload["amount"] = amount
	eventPayload["currency"] = currency
	eventPayload["providerReference"] = input.ProviderReference
	eventPayload["failureCode"] = failureCode
	if err = insertOutboxEvent(ctx, tx, "payout", input.PayoutID, eventType, eventPayload); err != nil {
		return domain.AdminPayout{}, false, err
	}
	if err = tx.Commit(ctx); err != nil {
		return domain.AdminPayout{}, false, err
	}
	result, err := r.GetAdminPayout(ctx, input.PayoutID)
	return result, true, err
}

func (r *WalletRepository) GetAdminPayout(ctx context.Context, payoutID string) (domain.AdminPayout, error) {
	var item domain.AdminPayout
	var last4 string
	err := r.pool.QueryRow(ctx, `
		SELECT p.id, p.amount_minor, p.currency, p.status, p.bank_code, p.account_holder_name,
		       p.account_number_last4, p.provider, p.provider_reference, p.failure_code, p.failure_message,
		       p.requested_at, p.processed_at, p.created_at, p.updated_at, w.id, w.seller_id, w.owner_type, p.payout_type
		FROM payouts p JOIN wallets w ON w.id = p.wallet_id WHERE p.id = $1
	`, payoutID).Scan(
		&item.ID, &item.AmountMinor, &item.Currency, &item.Status, &item.BankCode,
		&item.AccountHolderName, &last4, &item.Provider, &item.ProviderReference,
		&item.FailureCode, &item.FailureMessage, &item.RequestedAt, &item.ProcessedAt,
		&item.CreatedAt, &item.UpdatedAt, &item.WalletID, &item.OwnerID, &item.OwnerType, &item.PayoutType,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.AdminPayout{}, ErrPayoutNotFound
	}
	if err != nil {
		return domain.AdminPayout{}, err
	}
	item.MaskedAccountNumber = maskLast4(last4)
	if item.OwnerType == domain.WalletOwnerSeller {
		item.SellerID = item.OwnerID
	}
	return item, nil
}
