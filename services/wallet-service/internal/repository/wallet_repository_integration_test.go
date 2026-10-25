package repository

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"wallet-service/internal/domain"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestPayoutIdempotencyAndLedgerLifecycleIntegration(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	runTestMigration(t, ctx, pool)
	truncateWalletTables(t, ctx, pool)
	t.Cleanup(func() { truncateWalletTables(t, context.Background(), pool) })
	repo := NewWalletRepository(pool)
	sellerID := "10111111-1111-4111-8111-111111111111"
	seedAvailableBalance(t, ctx, repo, sellerID, "20222222-2222-4222-8222-222222222222", "30333333-3333-4333-8333-333333333333", 100_000)
	seedVerifiedBankAccount(t, ctx, repo, sellerID)
	now := time.Now().UTC()
	input := CreatePayoutInput{SellerID: sellerID, Currency: "VND", AmountMinor: 60_000, IdempotencyKey: "payout-key-0001", RequestHash: "hash-1", IdempotencyExpiresAt: now.Add(time.Hour)}
	created, replay, err := repo.CreatePayout(ctx, input)
	if err != nil || replay {
		t.Fatalf("create payout: replay=%v err=%v", replay, err)
	}
	replayed, replay, err := repo.CreatePayout(ctx, input)
	if err != nil || !replay || replayed.ID != created.ID {
		t.Fatalf("replay payout: payout=%+v replay=%v err=%v", replayed, replay, err)
	}
	if _, _, err := repo.CreatePayout(ctx, CreatePayoutInput{SellerID: sellerID, Currency: "VND", AmountMinor: 50_000, IdempotencyKey: input.IdempotencyKey, RequestHash: "different", IdempotencyExpiresAt: now.Add(time.Hour)}); !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("conflicting idempotency key error=%v", err)
	}

	jobs, err := repo.ClaimPayouts(ctx, now.Add(time.Second), 10)
	if err != nil || len(jobs) != 1 {
		t.Fatalf("claim payout: jobs=%d err=%v", len(jobs), err)
	}
	if changed, err := repo.CompletePayout(ctx, CompletePayoutInput{PayoutID: created.ID, Provider: "mock", ProviderReference: "mock-failed", Status: domain.PayoutStatusFailed, FailureCode: "TEST", FailureMessage: "failure", ProcessedAt: now.Add(2 * time.Second)}); err != nil || !changed {
		t.Fatalf("fail payout: changed=%v err=%v", changed, err)
	}
	balance, err := repo.GetBalance(ctx, sellerID, domain.WalletOwnerSeller, "VND")
	if err != nil || balance.AvailableAmount != 100_000 || balance.PayoutPendingAmount != 0 {
		t.Fatalf("balance after failure: %+v err=%v", balance, err)
	}

	succeeded, _, err := repo.CreatePayout(ctx, CreatePayoutInput{SellerID: sellerID, Currency: "VND", AmountMinor: 80_000, IdempotencyKey: "payout-key-0002", RequestHash: "hash-2", IdempotencyExpiresAt: now.Add(time.Hour)})
	if err != nil {
		t.Fatalf("create successful payout: %v", err)
	}
	jobs, err = repo.ClaimPayouts(ctx, now.Add(3*time.Second), 10)
	if err != nil || len(jobs) != 1 {
		t.Fatalf("claim successful payout: jobs=%d err=%v", len(jobs), err)
	}
	if _, err := repo.CompletePayout(ctx, CompletePayoutInput{PayoutID: succeeded.ID, Provider: "mock", ProviderReference: "mock-success", Status: domain.PayoutStatusSucceeded, ProcessedAt: now.Add(4 * time.Second)}); err != nil {
		t.Fatalf("complete payout: %v", err)
	}
	balance, err = repo.GetBalance(ctx, sellerID, domain.WalletOwnerSeller, "VND")
	if err != nil || balance.AvailableAmount != 20_000 || balance.PayoutPendingAmount != 0 || balance.TotalPaidOut != 80_000 {
		t.Fatalf("balance after success: %+v err=%v", balance, err)
	}
	if _, err := repo.GetPayout(ctx, "99999999-9999-4999-8999-999999999999", domain.WalletOwnerSeller, succeeded.ID); !errors.Is(err, ErrPayoutNotFound) {
		t.Fatalf("another seller must not access payout, err=%v", err)
	}
	if _, err := repo.ApplyReversal(ctx, ReversalInput{PaymentID: "20222222-2222-4222-8222-222222222222", OrderID: "30333333-3333-4333-8333-333333333333", CustomerID: "88888888-8888-4888-8888-888888888888", SellerID: sellerID, CumulativeAmountMinor: 50_000, Currency: "VND", Meta: domain.EventMeta{EventID: "refund-after-payout", EventType: "payment.refunded", Topic: "payment.events", OccurredAt: now.Add(5 * time.Second)}}); err != nil {
		t.Fatalf("refund after payout: %v", err)
	}
	balance, err = repo.GetBalance(ctx, sellerID, domain.WalletOwnerSeller, "VND")
	if err != nil || balance.AvailableAmount != -30_000 || !balance.IsFrozen {
		t.Fatalf("refund debt must freeze wallet: %+v err=%v", balance, err)
	}
	if replayed, replay, err := repo.CreatePayout(ctx, CreatePayoutInput{SellerID: sellerID, Currency: "VND", AmountMinor: 80_000, IdempotencyKey: "payout-key-0002", RequestHash: "hash-2", IdempotencyExpiresAt: now.Add(time.Hour)}); err != nil || !replay || replayed.ID != succeeded.ID {
		t.Fatalf("frozen wallet must still replay a completed idempotent request: payout=%+v replay=%v err=%v", replayed, replay, err)
	}
	if _, _, err := repo.CreatePayout(ctx, CreatePayoutInput{SellerID: sellerID, Currency: "VND", AmountMinor: 10_000, IdempotencyKey: "frozen-wallet-key", RequestHash: "frozen", IdempotencyExpiresAt: now.Add(time.Hour)}); !errors.Is(err, ErrWalletFrozen) {
		t.Fatalf("frozen wallet payout error=%v", err)
	}
	seedAvailableBalance(t, ctx, repo, sellerID, "21222222-2222-4222-8222-222222222222", "31333333-3333-4333-8333-333333333333", 50_000)
	balance, err = repo.GetBalance(ctx, sellerID, domain.WalletOwnerSeller, "VND")
	if err != nil || balance.AvailableAmount != 20_000 || balance.IsFrozen {
		t.Fatalf("repaid wallet debt must unfreeze automatically: %+v err=%v", balance, err)
	}
	assertAllTransactionsBalanced(t, ctx, pool)
}

func TestExpiredIdempotencyKeyCanBeReusedIntegration(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	runTestMigration(t, ctx, pool)
	truncateWalletTables(t, ctx, pool)
	t.Cleanup(func() { truncateWalletTables(t, context.Background(), pool) })
	repo := NewWalletRepository(pool)
	sellerID := "12111111-1111-4111-8111-111111111111"
	seedAvailableBalance(t, ctx, repo, sellerID, "12222222-2222-4222-8222-222222222222", "12333333-3333-4333-8333-333333333333", 100_000)
	seedVerifiedBankAccount(t, ctx, repo, sellerID)
	key := "expired-key-0001"
	first, _, err := repo.CreatePayout(ctx, CreatePayoutInput{SellerID: sellerID, Currency: "VND", AmountMinor: 20_000, IdempotencyKey: key, RequestHash: "first", IdempotencyExpiresAt: time.Now().Add(-time.Minute)})
	if err != nil {
		t.Fatal(err)
	}
	second, replay, err := repo.CreatePayout(ctx, CreatePayoutInput{SellerID: sellerID, Currency: "VND", AmountMinor: 30_000, IdempotencyKey: key, RequestHash: "second", IdempotencyExpiresAt: time.Now().Add(time.Hour)})
	if err != nil || replay || second.ID == first.ID {
		t.Fatalf("expired key reuse: first=%s second=%s replay=%v err=%v", first.ID, second.ID, replay, err)
	}
}

func TestPayoutSummaryAndDeadOutboxIntegration(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	runTestMigration(t, ctx, pool)
	truncateWalletTables(t, ctx, pool)
	t.Cleanup(func() { truncateWalletTables(t, context.Background(), pool) })
	repo := NewWalletRepository(pool)
	sellerID := "13111111-1111-4111-8111-111111111111"
	seedAvailableBalance(t, ctx, repo, sellerID, "13222222-2222-4222-8222-222222222222", "13333333-3333-4333-8333-333333333333", 100_000)
	seedVerifiedBankAccount(t, ctx, repo, sellerID)
	now := time.Now().UTC()
	payout, _, err := repo.CreatePayout(ctx, CreatePayoutInput{SellerID: sellerID, Currency: "VND", AmountMinor: 40_000, IdempotencyKey: "summary-key-0001", RequestHash: "summary", IdempotencyExpiresAt: now.Add(time.Hour)})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ClaimPayouts(ctx, now.Add(time.Second), 10); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.CompletePayout(ctx, CompletePayoutInput{PayoutID: payout.ID, Provider: "mock", ProviderReference: "summary-provider-ref", Status: domain.PayoutStatusSucceeded, ProcessedAt: now}); err != nil {
		t.Fatal(err)
	}
	summary, err := repo.GetPayoutSummary(ctx, PayoutSummaryInput{SellerID: sellerID, Currency: "VND", WeekStart: now.Add(-time.Hour), MonthStart: now.Add(-24 * time.Hour)})
	if err != nil || summary.PaidThisWeek != 40_000 || summary.PaidThisMonth != 40_000 || summary.TotalPaidOut != 40_000 {
		t.Fatalf("summary=%+v err=%v", summary, err)
	}
	var eventID string
	if err := pool.QueryRow(ctx, `SELECT id FROM outbox_events ORDER BY created_at LIMIT 1`).Scan(&eventID); err != nil {
		t.Fatal(err)
	}
	if err := repo.MarkOutboxFailed(ctx, eventID, 10, nil); err != nil {
		t.Fatal(err)
	}
	var status string
	if err := pool.QueryRow(ctx, `SELECT status FROM outbox_events WHERE id=$1`, eventID).Scan(&status); err != nil || status != "DEAD" {
		t.Fatalf("status=%s err=%v", status, err)
	}
	events, err := repo.FindDispatchableOutboxEvents(ctx, 100)
	if err != nil {
		t.Fatal(err)
	}
	for _, event := range events {
		if event.ID == eventID {
			t.Fatalf("dead outbox event remained dispatchable: %s", eventID)
		}
	}
}

func TestConcurrentPayoutsNeverMakeBalanceNegativeIntegration(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	runTestMigration(t, ctx, pool)
	truncateWalletTables(t, ctx, pool)
	t.Cleanup(func() { truncateWalletTables(t, context.Background(), pool) })
	repo := NewWalletRepository(pool)
	sellerID := "40111111-1111-4111-8111-111111111111"
	seedAvailableBalance(t, ctx, repo, sellerID, "50222222-2222-4222-8222-222222222222", "60333333-3333-4333-8333-333333333333", 100_000)
	seedVerifiedBankAccount(t, ctx, repo, sellerID)

	start := make(chan struct{})
	errorsChannel := make(chan error, 2)
	var wait sync.WaitGroup
	for i, key := range []string{"concurrent-key-1", "concurrent-key-2"} {
		wait.Add(1)
		go func(index int, idempotencyKey string) {
			defer wait.Done()
			<-start
			_, _, err := repo.CreatePayout(ctx, CreatePayoutInput{SellerID: sellerID, Currency: "VND", AmountMinor: 80_000, IdempotencyKey: idempotencyKey, RequestHash: idempotencyKey, IdempotencyExpiresAt: time.Now().Add(time.Hour)})
			errorsChannel <- err
		}(i, key)
	}
	close(start)
	wait.Wait()
	close(errorsChannel)
	successes, insufficient := 0, 0
	for err := range errorsChannel {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, ErrInsufficientBalance):
			insufficient++
		default:
			t.Fatalf("unexpected concurrent payout error: %v", err)
		}
	}
	if successes != 1 || insufficient != 1 {
		t.Fatalf("success=%d insufficient=%d", successes, insufficient)
	}
	balance, err := repo.GetBalance(ctx, sellerID, domain.WalletOwnerSeller, "VND")
	if err != nil || balance.AvailableAmount != 20_000 || balance.PayoutPendingAmount != 80_000 {
		t.Fatalf("unexpected concurrent balance: %+v err=%v", balance, err)
	}
	assertAllTransactionsBalanced(t, ctx, pool)
}

func seedAvailableBalance(t *testing.T, ctx context.Context, repo *WalletRepository, sellerID, paymentID, orderID string, amount int64) {
	t.Helper()
	deliveredAt := time.Now().UTC().Add(-time.Hour)
	if _, err := repo.ApplyDelivery(ctx, DeliveryInput{OrderID: orderID, SellerID: sellerID, DeliveredAt: deliveredAt, HoldDuration: time.Second, Meta: domain.EventMeta{EventID: "delivery-" + orderID, EventType: "order.delivered", Topic: "order.events", OccurredAt: deliveredAt}}); err != nil {
		t.Fatalf("seed delivery: %v", err)
	}
	if _, err := repo.ApplyCapture(ctx, CaptureInput{PaymentID: paymentID, OrderID: orderID, SellerID: sellerID, AmountMinor: amount, Currency: "VND", HoldDuration: time.Second, Meta: domain.EventMeta{EventID: "capture-" + paymentID, EventType: "payment.captured", Topic: "payment.events", OccurredAt: deliveredAt}}); err != nil {
		t.Fatalf("seed capture: %v", err)
	}
	if released, err := repo.ReleaseDueHolds(ctx, time.Now().UTC(), 10); err != nil || released != 1 {
		t.Fatalf("seed release: released=%d err=%v", released, err)
	}
}

func seedVerifiedBankAccount(t *testing.T, ctx context.Context, repo *WalletRepository, sellerID string) {
	t.Helper()
	if _, err := repo.UpsertBankAccount(ctx, UpsertBankAccountInput{
		SellerID: sellerID, Currency: "VND", BankCode: "VCB", AccountHolderName: "TEST SELLER",
		Last4: "6789", EncryptedAccountNumber: []byte("encrypted"), EncryptionNonce: []byte("nonce"),
	}); err != nil {
		t.Fatalf("upsert bank account: %v", err)
	}
	var walletID string
	if err := repo.pool.QueryRow(ctx, `SELECT id FROM wallets WHERE seller_id=$1 AND currency='VND'`, sellerID).Scan(&walletID); err != nil {
		t.Fatalf("find wallet for bank verification: %v", err)
	}
	if _, err := repo.SetAdminBankAccountStatus(ctx, AdminActionInput{
		WalletID: walletID, ActorID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		ActorEmail: "test-admin@example.com", Reason: "Integration test verification",
	}, domain.BankAccountStatusAllowlisted); err != nil {
		t.Fatalf("verify bank account: %v", err)
	}
}

func TestWalletLedgerLifecycleIntegration(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	runTestMigration(t, ctx, pool)
	runTestMigration(t, ctx, pool)
	truncateWalletTables(t, ctx, pool)
	t.Cleanup(func() { truncateWalletTables(t, context.Background(), pool) })

	repository := NewWalletRepository(pool)
	sellerID := "11111111-1111-4111-8111-111111111111"
	paymentID := "22222222-2222-4222-8222-222222222222"
	orderID := "33333333-3333-4333-8333-333333333333"
	deliveredAt := time.Now().UTC().Add(-2 * time.Hour)

	processed, err := repository.ApplyDelivery(ctx, DeliveryInput{
		OrderID: orderID, SellerID: sellerID, DeliveredAt: deliveredAt, HoldDuration: time.Minute,
		Meta: domain.EventMeta{EventID: "evt-delivered", EventType: "order.delivered", Topic: "order.events", OffsetValue: 1, OccurredAt: deliveredAt},
	})
	if err != nil || !processed {
		t.Fatalf("apply delivery before capture: processed=%v err=%v", processed, err)
	}

	processed, err = repository.ApplyCapture(ctx, CaptureInput{
		PaymentID: paymentID, OrderID: orderID, SellerID: sellerID, AmountMinor: 100000,
		Currency: "VND", HoldDuration: time.Minute,
		Meta: domain.EventMeta{EventID: "evt-captured", EventType: "payment.captured", Topic: "payment.events", OffsetValue: 2, OccurredAt: deliveredAt.Add(time.Minute)},
	})
	if err != nil || !processed {
		t.Fatalf("apply capture: processed=%v err=%v", processed, err)
	}

	duplicate, err := repository.ApplyCapture(ctx, CaptureInput{
		PaymentID: paymentID, OrderID: orderID, SellerID: sellerID, AmountMinor: 100000,
		Currency: "VND", HoldDuration: time.Minute,
		Meta: domain.EventMeta{EventID: "evt-captured", EventType: "payment.captured", Topic: "payment.events", OffsetValue: 2, OccurredAt: deliveredAt.Add(time.Minute)},
	})
	if err != nil || duplicate {
		t.Fatalf("duplicate capture: processed=%v err=%v", duplicate, err)
	}
	if _, err := repository.ApplyCapture(ctx, CaptureInput{
		PaymentID: paymentID, OrderID: orderID, SellerID: sellerID, AmountMinor: 99_999,
		Currency: "VND", HoldDuration: time.Minute,
		Meta: domain.EventMeta{EventID: "evt-captured-conflict", EventType: "payment.captured", Topic: "payment.events", OffsetValue: 20, OccurredAt: deliveredAt.Add(time.Minute)},
	}); err == nil {
		t.Fatal("expected conflicting capture payload for the same payment id to fail")
	}

	balance, err := repository.GetBalance(ctx, sellerID, domain.WalletOwnerSeller, "VND")
	if err != nil {
		t.Fatalf("get held balance: %v", err)
	}
	if balance.HeldAmount != 100000 || balance.AvailableAmount != 0 {
		t.Fatalf("unexpected held balance: %+v", balance)
	}

	released, err := repository.ReleaseDueHolds(ctx, time.Now().UTC(), 100)
	if err != nil || released != 1 {
		t.Fatalf("release holds: count=%d err=%v", released, err)
	}
	balance, err = repository.GetBalance(ctx, sellerID, domain.WalletOwnerSeller, "VND")
	if err != nil {
		t.Fatalf("get released balance: %v", err)
	}
	if balance.HeldAmount != 0 || balance.AvailableAmount != 100000 {
		t.Fatalf("unexpected released balance: %+v", balance)
	}

	processed, err = repository.ApplyReversal(ctx, ReversalInput{
		PaymentID: paymentID, OrderID: orderID, CustomerID: "88888888-8888-4888-8888-888888888888", SellerID: sellerID,
		CumulativeAmountMinor: 25000, Currency: "VND",
		Meta: domain.EventMeta{EventID: "evt-refund", EventType: "payment.partially-refunded", Topic: "payment.events", OffsetValue: 3, OccurredAt: time.Now().UTC()},
	})
	if err != nil || !processed {
		t.Fatalf("apply refund: processed=%v err=%v", processed, err)
	}
	balance, err = repository.GetBalance(ctx, sellerID, domain.WalletOwnerSeller, "VND")
	if err != nil {
		t.Fatalf("get refunded balance: %v", err)
	}
	if balance.HeldAmount != 0 || balance.AvailableAmount != 75000 {
		t.Fatalf("unexpected refunded balance: %+v", balance)
	}
	customerID := "88888888-8888-4888-8888-888888888888"
	customerBalance, err := repository.GetBalance(ctx, customerID, domain.WalletOwnerCustomer, "VND")
	if err != nil || customerBalance.AvailableAmount != 25_000 || customerBalance.HeldAmount != 0 {
		t.Fatalf("unexpected customer refund balance: %+v err=%v", customerBalance, err)
	}
	var refundOwnerID, refundOwnerType, refundCustomerID string
	if err := pool.QueryRow(ctx, `
		SELECT payload->>'ownerId', payload->>'ownerType', payload->>'customerId'
		FROM outbox_events
		WHERE event_type = 'wallet.customer-refund-credited'
		ORDER BY created_at DESC
		LIMIT 1
	`).Scan(&refundOwnerID, &refundOwnerType, &refundCustomerID); err != nil {
		t.Fatalf("load customer refund outbox event: %v", err)
	}
	if refundOwnerID != customerID || refundOwnerType != string(domain.WalletOwnerCustomer) || refundCustomerID != customerID {
		t.Fatalf("unexpected customer refund outbox owner: owner=%s type=%s customer=%s", refundOwnerID, refundOwnerType, refundCustomerID)
	}
	duplicate, err = repository.ApplyReversal(ctx, ReversalInput{
		PaymentID: paymentID, OrderID: orderID, CustomerID: customerID, SellerID: sellerID,
		CumulativeAmountMinor: 25000, Currency: "VND",
		Meta: domain.EventMeta{EventID: "evt-refund-redelivery", EventType: "payment.partially-refunded", Topic: "payment.events", OffsetValue: 4, OccurredAt: time.Now().UTC()},
	})
	if err != nil || !duplicate {
		t.Fatalf("idempotent cumulative refund: processed=%v err=%v", duplicate, err)
	}
	customerBalance, err = repository.GetBalance(ctx, customerID, domain.WalletOwnerCustomer, "VND")
	if err != nil || customerBalance.AvailableAmount != 25_000 {
		t.Fatalf("duplicate refund changed customer balance: %+v err=%v", customerBalance, err)
	}
	var holdStatus domain.HoldStatus
	if err := pool.QueryRow(ctx, `SELECT status FROM fund_holds WHERE payment_id = $1`, paymentID).Scan(&holdStatus); err != nil || holdStatus != domain.HoldStatusReleased {
		t.Fatalf("partially refunded released hold status=%s err=%v", holdStatus, err)
	}

	page, err := repository.ListTransactions(ctx, ListTransactionsInput{OwnerID: sellerID, OwnerType: domain.WalletOwnerSeller, Currency: "VND", Page: 1, PageSize: 20})
	if err != nil {
		t.Fatalf("list transactions: %v", err)
	}
	if page.TotalItems != 3 || len(page.Items) != 3 {
		t.Fatalf("unexpected transaction page: %+v", page)
	}
	amounts := make(map[domain.TransactionType]int64, len(page.Items))
	for _, item := range page.Items {
		amounts[item.TransactionType] = item.AmountMinor
	}
	if amounts[domain.TransactionTypePaymentHeld] != 100_000 || amounts[domain.TransactionTypeFundsReleased] != 0 || amounts[domain.TransactionTypePaymentRefund] != -25_000 {
		t.Fatalf("unexpected net wallet transaction amounts: %+v", amounts)
	}
	customerPage, err := repository.ListTransactions(ctx, ListTransactionsInput{OwnerID: customerID, OwnerType: domain.WalletOwnerCustomer, Currency: "VND", Page: 1, PageSize: 20})
	if err != nil || customerPage.TotalItems != 1 || customerPage.Items[0].TransactionType != domain.TransactionTypeCustomerRefundCredit || customerPage.Items[0].AmountMinor != 25_000 {
		t.Fatalf("unexpected customer refund transactions: %+v err=%v", customerPage, err)
	}
	if _, err := repository.UpsertBankAccount(ctx, UpsertBankAccountInput{
		OwnerID: customerID, OwnerType: domain.WalletOwnerCustomer, Currency: "VND",
		BankCode: "VCB", AccountHolderName: "TEST CUSTOMER", Last4: "1234",
		EncryptedAccountNumber: []byte("customer-encrypted"), EncryptionNonce: []byte("customer-nonce"),
	}); err != nil {
		t.Fatalf("upsert customer bank account: %v", err)
	}
	if _, err := repository.SetAdminBankAccountStatus(ctx, AdminActionInput{
		WalletID: *customerBalance.WalletID, ActorID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		ActorEmail: "test-admin@example.com", Reason: "Verify customer refund account",
	}, domain.BankAccountStatusAllowlisted); err != nil {
		t.Fatalf("verify customer bank account: %v", err)
	}
	customerPayout, replay, err := repository.CreatePayout(ctx, CreatePayoutInput{
		OwnerID: customerID, OwnerType: domain.WalletOwnerCustomer, PayoutType: "CUSTOMER_REFUND",
		Currency: "VND", AmountMinor: 20_000, IdempotencyKey: "customer-refund-payout",
		RequestHash: "customer-refund-hash", IdempotencyExpiresAt: time.Now().UTC().Add(time.Hour),
	})
	if err != nil || replay {
		t.Fatalf("create customer refund payout: replay=%v err=%v", replay, err)
	}
	transfer, err := repository.PrepareManualPayout(ctx, PrepareManualPayoutInput{
		PayoutID: customerPayout.ID, ActorID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		ActorEmail: "test-admin@example.com", Reason: "Prepare customer refund",
		TransferCode: "EMALLCUSTOMER1",
	})
	if err != nil || transfer.OwnerType != domain.WalletOwnerCustomer || transfer.PayoutType != "CUSTOMER_REFUND" {
		t.Fatalf("prepare customer refund transfer: %+v err=%v", transfer, err)
	}
	webhookResult, err := repository.ProcessSePayPayoutWebhook(ctx, SePayPayoutWebhookInput{
		TransactionID: "sepay-customer-refund-1", TransferCode: "EMALLCUSTOMER1",
		Gateway: "VCB", SourceAccountNumber: "platform-account", AmountMinor: 20_000,
		Content: "EMALLCUSTOMER1", ReferenceCode: "BANK-CUSTOMER-REFUND-1",
		TransactionAt: time.Now().UTC(), RawPayload: []byte(`{"transferType":"out"}`),
	})
	if err != nil || webhookResult.Outcome != "MATCHED" {
		t.Fatalf("reconcile customer refund payout: %+v err=%v", webhookResult, err)
	}
	customerBalance, err = repository.GetBalance(ctx, customerID, domain.WalletOwnerCustomer, "VND")
	if err != nil || customerBalance.AvailableAmount != 5_000 || customerBalance.PayoutPendingAmount != 0 || customerBalance.TotalPaidOut != 20_000 {
		t.Fatalf("unexpected customer balance after bank refund: %+v err=%v", customerBalance, err)
	}

	assertAllTransactionsBalanced(t, ctx, pool)
	assertSingleCapture(t, ctx, pool, paymentID)
}

func TestPendingRefundIsAppliedAfterCaptureIntegration(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	runTestMigration(t, ctx, pool)
	truncateWalletTables(t, ctx, pool)
	t.Cleanup(func() { truncateWalletTables(t, context.Background(), pool) })

	repository := NewWalletRepository(pool)
	sellerID := "44444444-4444-4444-8444-444444444444"
	paymentID := "55555555-5555-4555-8555-555555555555"
	orderID := "66666666-6666-4666-8666-666666666666"

	if _, err := repository.ApplyReversal(ctx, ReversalInput{
		PaymentID: paymentID, OrderID: orderID, CustomerID: "99999999-9999-4999-8999-999999999999", SellerID: sellerID,
		CumulativeAmountMinor: 30000, Currency: "VND",
		Meta: domain.EventMeta{EventID: "evt-refund-first", EventType: "payment.refunded", Topic: "payment.events", OffsetValue: 1, OccurredAt: time.Now().UTC()},
	}); err != nil {
		t.Fatalf("store pending reversal: %v", err)
	}
	if _, err := repository.ApplyCapture(ctx, CaptureInput{
		PaymentID: paymentID, OrderID: orderID, SellerID: sellerID,
		AmountMinor: 100000, Currency: "VND", HoldDuration: time.Hour,
		Meta: domain.EventMeta{EventID: "evt-capture-second", EventType: "payment.captured", Topic: "payment.events", OffsetValue: 2, OccurredAt: time.Now().UTC()},
	}); err != nil {
		t.Fatalf("apply capture after pending reversal: %v", err)
	}

	balance, err := repository.GetBalance(ctx, sellerID, domain.WalletOwnerSeller, "VND")
	if err != nil {
		t.Fatalf("get balance: %v", err)
	}
	if balance.HeldAmount != 70000 || balance.AvailableAmount != 0 {
		t.Fatalf("unexpected balance after pending reversal: %+v", balance)
	}
	customerBalance, err := repository.GetBalance(ctx, "99999999-9999-4999-8999-999999999999", domain.WalletOwnerCustomer, "VND")
	if err != nil || customerBalance.AvailableAmount != 30_000 {
		t.Fatalf("pending refund was not credited after capture: %+v err=%v", customerBalance, err)
	}
	assertAllTransactionsBalanced(t, ctx, pool)
}

func TestDatabaseRejectsUnbalancedLedgerTransactionIntegration(t *testing.T) {
	pool := integrationPool(t)
	ctx := context.Background()
	runTestMigration(t, ctx, pool)
	truncateWalletTables(t, ctx, pool)
	t.Cleanup(func() { truncateWalletTables(t, context.Background(), pool) })

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin transaction: %v", err)
	}
	defer tx.Rollback(ctx)
	walletID, err := ensureWallet(ctx, tx, "77777777-7777-4777-8777-777777777777", "VND")
	if err != nil {
		t.Fatalf("ensure wallet: %v", err)
	}
	accountID, err := ensureLedgerAccount(ctx, tx, &walletID, domain.AccountTypeSellerHeld, "VND")
	if err != nil {
		t.Fatalf("ensure account: %v", err)
	}
	transactionID, err := insertLedgerTransaction(
		ctx, tx, domain.TransactionTypePaymentHeld, "payment",
		"88888888-8888-4888-8888-888888888888", "unbalanced-test", "VND", "invalid fixture", time.Now().UTC(),
	)
	if err != nil {
		t.Fatalf("insert ledger transaction: %v", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO ledger_entries (transaction_id, account_id, amount_minor)
		VALUES ($1, $2, 1000)
	`, transactionID, accountID); err != nil {
		t.Fatalf("insert unbalanced entry before deferred check: %v", err)
	}
	if err := tx.Commit(ctx); err == nil {
		t.Fatal("expected deferred ledger balance constraint to reject commit")
	}
}

func integrationPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	databaseURL := os.Getenv("WALLET_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("WALLET_TEST_DATABASE_URL is not configured")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("create integration pool: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Fatalf("ping integration database: %v", err)
	}
	t.Cleanup(pool.Close)
	lockConnection, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire integration test lock connection: %v", err)
	}
	if _, err := lockConnection.Exec(ctx, `SELECT pg_advisory_lock(77002602)`); err != nil {
		lockConnection.Release()
		t.Fatalf("acquire integration test lock: %v", err)
	}
	t.Cleanup(func() {
		_, _ = lockConnection.Exec(context.Background(), `SELECT pg_advisory_unlock(77002602)`)
		lockConnection.Release()
	})
	return pool
}

func runTestMigration(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	path := filepath.Join("..", "..", "migrations", "0001_init_wallet_service.sql")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	if _, err := pool.Exec(ctx, string(data)); err != nil {
		t.Fatalf("run migration: %v", err)
	}
}

func truncateWalletTables(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	_, err := pool.Exec(ctx, `
		TRUNCATE TABLE
		  outbox_events, processed_events, idempotency_records, payouts, bank_accounts,
		  pending_payment_reversals, fund_holds, order_delivery_signals,
		  ledger_entries, ledger_transactions, ledger_accounts, wallets
		RESTART IDENTITY CASCADE
	`)
	if err != nil {
		t.Fatalf("truncate wallet tables: %v", err)
	}
}

func assertAllTransactionsBalanced(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	var unbalanced int
	if err := pool.QueryRow(ctx, `
		SELECT count(*)
		FROM (
		  SELECT transaction_id
		  FROM ledger_entries
		  GROUP BY transaction_id
		  HAVING SUM(amount_minor) <> 0
		) invalid
	`).Scan(&unbalanced); err != nil {
		t.Fatalf("query unbalanced transactions: %v", err)
	}
	if unbalanced != 0 {
		t.Fatalf("found %d unbalanced transaction(s)", unbalanced)
	}
}

func assertSingleCapture(t *testing.T, ctx context.Context, pool *pgxpool.Pool, paymentID string) {
	t.Helper()
	var count int
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM ledger_transactions
		WHERE transaction_type = 'PAYMENT_HELD' AND reference_id = $1
	`, paymentID).Scan(&count); err != nil {
		t.Fatalf("count captures: %v", err)
	}
	if count != 1 {
		t.Fatalf("capture ledger transaction count=%d, want 1", count)
	}
}
