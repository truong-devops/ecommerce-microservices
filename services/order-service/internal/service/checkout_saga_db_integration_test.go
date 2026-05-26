package service

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"order-service/internal/domain"
	"order-service/internal/repository"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

func TestCheckoutSagaRepositoryIntegration(t *testing.T) {
	databaseURL := strings.TrimSpace(os.Getenv("CHECKOUT_SAGA_TEST_DATABASE_URL"))
	if databaseURL == "" {
		t.Skip("set CHECKOUT_SAGA_TEST_DATABASE_URL to run Postgres checkout saga integration tests")
	}

	ctx := context.Background()
	pool := setupCheckoutSagaTestDB(t, ctx, databaseURL)
	repo := repository.NewOrderRepository(pool)

	t.Run("processed events are scoped by consumer", func(t *testing.T) {
		tx, err := repo.BeginTx(ctx)
		if err != nil {
			t.Fatalf("begin tx: %v", err)
		}
		defer tx.Rollback(ctx)

		input := repository.ProcessedEventInput{
			ConsumerName: "order-service",
			EventID:      "evt-shared-1",
			EventType:    "inventory.reserved",
			Topic:        "inventory.events",
			Partition:    0,
			OffsetValue:  10,
		}
		duplicate, err := repo.TryMarkEventProcessed(ctx, tx, input)
		if err != nil || duplicate {
			t.Fatalf("first insert duplicate=%v err=%v", duplicate, err)
		}
		duplicate, err = repo.TryMarkEventProcessed(ctx, tx, input)
		if err != nil || !duplicate {
			t.Fatalf("same consumer/event should be duplicate duplicate=%v err=%v", duplicate, err)
		}
		input.ConsumerName = "inventory-service"
		duplicate, err = repo.TryMarkEventProcessed(ctx, tx, input)
		if err != nil || duplicate {
			t.Fatalf("different consumer should not be duplicate duplicate=%v err=%v", duplicate, err)
		}
		if err := tx.Commit(ctx); err != nil {
			t.Fatalf("commit: %v", err)
		}

		tx, err = repo.BeginTx(ctx)
		if err != nil {
			t.Fatalf("begin reused-offset tx: %v", err)
		}
		defer tx.Rollback(ctx)
		input.ConsumerName = "order-service"
		input.EventID = "evt-new-after-topic-recreated"
		duplicate, err = repo.TryMarkEventProcessed(ctx, tx, input)
		if err != nil || duplicate {
			t.Fatalf("new event id at a reused Kafka offset should be processed duplicate=%v err=%v", duplicate, err)
		}
		if err := tx.Commit(ctx); err != nil {
			t.Fatalf("commit reused-offset tx: %v", err)
		}
	})

	t.Run("stale pending saga timeout fails order once", func(t *testing.T) {
		orderID := createPendingOrderWithSagaState(t, ctx, repo)
		_, err := pool.Exec(ctx, `
			UPDATE order_saga_states
			SET updated_at = now() - interval '30 minutes'
			WHERE order_id = $1
		`, orderID)
		if err != nil {
			t.Fatalf("age saga state: %v", err)
		}

		svc := NewOrderSagaService(repo, zap.NewNop())
		count, err := svc.FailStalePendingSagas(ctx, time.Minute, 10)
		if err != nil {
			t.Fatalf("fail stale pending sagas: %v", err)
		}
		if count != 1 {
			t.Fatalf("expected one stale saga, got %d", count)
		}

		var orderStatus, sagaStatus, failureCode string
		err = pool.QueryRow(ctx, `
			SELECT o.status::text, s.saga_status, s.failure_code
			FROM orders o
			JOIN order_saga_states s ON s.order_id = o.id
			WHERE o.id = $1
		`, orderID).Scan(&orderStatus, &sagaStatus, &failureCode)
		if err != nil {
			t.Fatalf("read saga result: %v", err)
		}
		if orderStatus != string(domain.OrderStatusFailed) || sagaStatus != string(domain.SagaStatusFailed) || failureCode != "CHECKOUT_SAGA_TIMEOUT" {
			t.Fatalf("unexpected timeout result order=%s saga=%s failure=%s", orderStatus, sagaStatus, failureCode)
		}

		count, err = svc.FailStalePendingSagas(ctx, time.Minute, 10)
		if err != nil {
			t.Fatalf("second timeout scan: %v", err)
		}
		if count != 0 {
			t.Fatalf("duplicate timeout run should not update same order again, got %d", count)
		}

		var historyCount, outboxCount int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM order_status_histories WHERE order_id = $1 AND to_status = 'FAILED'`, orderID).Scan(&historyCount); err != nil {
			t.Fatalf("count status histories: %v", err)
		}
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'order.status-updated'`, orderID).Scan(&outboxCount); err != nil {
			t.Fatalf("count outbox events: %v", err)
		}
		if historyCount != 1 || outboxCount != 1 {
			t.Fatalf("expected one status history and one outbox event, got histories=%d outbox=%d", historyCount, outboxCount)
		}
	})

	t.Run("timeout ignores checkout no longer pending", func(t *testing.T) {
		orderID := createPendingOrderWithSagaState(t, ctx, repo)
		_, err := pool.Exec(ctx, `
			UPDATE orders
			SET status = 'CONFIRMED'
			WHERE id = $1
		`, orderID)
		if err != nil {
			t.Fatalf("mark order confirmed: %v", err)
		}
		_, err = pool.Exec(ctx, `
			UPDATE order_saga_states
			SET updated_at = now() - interval '30 minutes'
			WHERE order_id = $1
		`, orderID)
		if err != nil {
			t.Fatalf("prepare confirmed order with stale saga state: %v", err)
		}

		svc := NewOrderSagaService(repo, zap.NewNop())
		count, err := svc.FailStalePendingSagas(ctx, time.Minute, 10)
		if err != nil {
			t.Fatalf("scan non-pending order saga: %v", err)
		}
		if count != 0 {
			t.Fatalf("confirmed order must not be reported as checkout timeout, got %d", count)
		}
	})
}

func setupCheckoutSagaTestDB(t *testing.T, ctx context.Context, databaseURL string) *pgxpool.Pool {
	t.Helper()

	adminPool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("connect admin db: %v", err)
	}
	t.Cleanup(adminPool.Close)

	schema := "checkout_saga_test_" + strings.ReplaceAll(uuid.NewString(), "-", "_")
	quotedSchema := pgx.Identifier{schema}.Sanitize()
	if _, err := adminPool.Exec(ctx, "CREATE SCHEMA "+quotedSchema); err != nil {
		t.Fatalf("create schema: %v", err)
	}
	t.Cleanup(func() {
		_, _ = adminPool.Exec(context.Background(), "DROP SCHEMA IF EXISTS "+quotedSchema+" CASCADE")
	})

	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		t.Fatalf("parse db url: %v", err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema + ",public"
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("connect schema db: %v", err)
	}
	t.Cleanup(pool.Close)

	migration, err := os.ReadFile(filepath.Join("..", "..", "migrations", "0001_init_order_service.sql"))
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	if _, err := pool.Exec(ctx, string(migration)); err != nil {
		t.Fatalf("run migration: %v", err)
	}
	return pool
}

func createPendingOrderWithSagaState(t *testing.T, ctx context.Context, repo *repository.OrderRepository) string {
	t.Helper()

	tx, err := repo.BeginTx(ctx)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	defer tx.Rollback(ctx)

	order, err := repo.CreateOrder(ctx, tx, repository.CreateOrderInput{
		OrderNumber:    "IT-" + strings.ReplaceAll(uuid.NewString(), "-", "")[:12],
		UserID:         uuid.NewString(),
		Status:         domain.OrderStatusPending,
		Currency:       "USD",
		SubtotalAmount: 10,
		ShippingAmount: 0,
		DiscountAmount: 0,
		TotalAmount:    10,
	})
	if err != nil {
		t.Fatalf("create order: %v", err)
	}
	if err := repo.CreateOrderSagaState(ctx, tx, order.ID); err != nil {
		t.Fatalf("create saga state: %v", err)
	}
	if _, err := repo.CreateOrderItems(ctx, tx, order.ID, []repository.CreateOrderItemInput{{
		ProductID:           "product-it",
		SKU:                 "SKU-IT",
		ProductNameSnapshot: "Integration Test Product",
		Quantity:            1,
		UnitPrice:           10,
		TotalPrice:          10,
	}}); err != nil {
		t.Fatalf("create order items: %v", err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("commit order: %v", err)
	}
	return order.ID
}
