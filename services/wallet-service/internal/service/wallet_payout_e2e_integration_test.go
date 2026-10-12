package service_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"wallet-service/internal/domain"
	"wallet-service/internal/repository"
	"wallet-service/internal/service"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

func TestPaymentToPayoutEndToEndIntegration(t *testing.T) {
	databaseURL := os.Getenv("WALLET_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("WALLET_TEST_DATABASE_URL is not configured")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	lockConnection, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := lockConnection.Exec(ctx, `SELECT pg_advisory_lock(77002602)`); err != nil {
		lockConnection.Release()
		t.Fatal(err)
	}
	defer func() {
		_, _ = lockConnection.Exec(context.Background(), `SELECT pg_advisory_unlock(77002602)`)
		lockConnection.Release()
	}()
	migration, err := os.ReadFile(filepath.Join("..", "..", "migrations", "0001_init_wallet_service.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, string(migration)); err != nil {
		t.Fatal(err)
	}
	truncateE2ETables(t, ctx, pool)
	defer truncateE2ETables(t, context.Background(), pool)

	repo := repository.NewWalletRepository(pool)
	sellerID := "71111111-1111-4111-8111-111111111111"
	paymentID := "72222222-2222-4222-8222-222222222222"
	orderID := "73333333-3333-4333-8333-333333333333"
	deliveredAt := time.Now().UTC().Add(-time.Hour)
	if _, err := repo.ApplyDelivery(ctx, repository.DeliveryInput{OrderID: orderID, SellerID: sellerID, DeliveredAt: deliveredAt, HoldDuration: time.Second, Meta: domain.EventMeta{EventID: "e2e-delivered", EventType: "order.delivered", Topic: "order.events", OccurredAt: deliveredAt}}); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.ApplyCapture(ctx, repository.CaptureInput{PaymentID: paymentID, OrderID: orderID, SellerID: sellerID, AmountMinor: 100_000, Currency: "VND", HoldDuration: time.Second, Meta: domain.EventMeta{EventID: "e2e-captured", EventType: "payment.captured", Topic: "payment.events", OccurredAt: deliveredAt}}); err != nil {
		t.Fatal(err)
	}
	if released, err := repo.ReleaseDueHolds(ctx, time.Now().UTC(), 10); err != nil || released != 1 {
		t.Fatalf("release: count=%d err=%v", released, err)
	}

	cipher, err := service.NewBankAccountCipher("e2e-bank-account-encryption-key-32-chars")
	if err != nil {
		t.Fatal(err)
	}
	payoutService := service.NewPayoutService(repo, cipher, true, 10_000, 10_000_000, 24*time.Hour)
	user := domain.UserContext{UserID: sellerID, Role: domain.RoleSeller}
	if _, err := payoutService.UpsertMyBankAccount(ctx, user, "VCB", "0123456789", "DEMO SELLER"); err != nil {
		t.Fatal(err)
	}
	payout, replay, err := payoutService.CreateMyPayout(ctx, user, "e2e-payout-key-001", 60_000, "VND")
	if err != nil || replay {
		t.Fatalf("create payout: replay=%v err=%v", replay, err)
	}

	worker := service.NewPayoutWorker(repo, service.NewMockPayoutProvider("success"), cipher, zap.NewNop(), time.Second, time.Second, time.Second, 10)
	if processed, err := worker.Process(ctx); err != nil || processed != 1 {
		t.Fatalf("process payout: count=%d err=%v", processed, err)
	}
	result, err := payoutService.GetMyPayout(ctx, user, payout.ID)
	if err != nil || result.Status != domain.PayoutStatusSucceeded {
		t.Fatalf("payout=%+v err=%v", result, err)
	}
	balance, err := repo.GetBalance(ctx, sellerID, "VND")
	if err != nil || balance.HeldAmount != 0 || balance.AvailableAmount != 40_000 || balance.PayoutPendingAmount != 0 || balance.TotalPaidOut != 60_000 {
		t.Fatalf("unexpected final balance: %+v err=%v", balance, err)
	}
	var unbalanced int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM (SELECT transaction_id FROM ledger_entries GROUP BY transaction_id HAVING SUM(amount_minor) <> 0) invalid`).Scan(&unbalanced); err != nil || unbalanced != 0 {
		t.Fatalf("unbalanced=%d err=%v", unbalanced, err)
	}
}

func truncateE2ETables(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	_, err := pool.Exec(ctx, `TRUNCATE TABLE outbox_events, processed_events, idempotency_records, payouts, bank_accounts, pending_payment_reversals, fund_holds, order_delivery_signals, ledger_entries, ledger_transactions, ledger_accounts, wallets RESTART IDENTITY CASCADE`)
	if err != nil {
		t.Fatal(err)
	}
}
