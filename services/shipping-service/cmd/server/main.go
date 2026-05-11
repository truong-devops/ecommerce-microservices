package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"shipping-service/internal/config"
	"shipping-service/internal/events"
	"shipping-service/internal/handler"
	"shipping-service/internal/repository"
	"shipping-service/internal/router"
	"shipping-service/internal/service"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(fmt.Errorf("load config: %w", err))
	}

	logger, err := newLogger(cfg.AppEnv)
	if err != nil {
		panic(fmt.Errorf("init logger: %w", err))
	}
	defer logger.Sync()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Fatal("failed to init postgres pool", zap.Error(err))
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		logger.Fatal("failed to connect postgres", zap.Error(err))
	}

	if cfg.RunMigrations {
		if err := runMigration(ctx, pool, cfg.MigrationFile); err != nil {
			logger.Fatal("failed to run migration", zap.Error(err))
		}
	}

	redisService, err := service.NewRedisService(cfg.RedisEnabled, cfg.RedisURL)
	if err != nil {
		logger.Fatal("failed to init redis", zap.Error(err))
	}
	defer func() {
		closeCtx, closeCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer closeCancel()
		_ = redisService.Close(closeCtx)
	}()

	repo := repository.NewShippingRepository(pool)
	shippingService := service.NewShippingService(repo, cfg.WebhookIdempotencyTTLMinutes)
	healthService := service.NewHealthService(cfg.AppName, repo, redisService)

	shippingHandler := handler.NewShippingHandler(shippingService)
	healthHandler := handler.NewHealthHandler(healthService)

	httpHandler := router.New(cfg, logger, redisService, shippingHandler, healthHandler)

	publisher := events.NewPublisher(cfg, logger)
	defer publisher.Close()

	dispatcher := events.NewDispatcher(repo, publisher, logger, cfg.DispatchInterval, cfg.DispatchBatch, cfg.DispatchMaxRetry)
	consumer := events.NewOrderEventsConsumerWithService(cfg, shippingService, logger)
	defer consumer.Close()

	runCtx, runCancel := context.WithCancel(context.Background())
	defer runCancel()
	go dispatcher.Run(runCtx)
	go consumer.Run(runCtx)

	server := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           httpHandler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       20 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		logger.Info("shipping-service started",
			zap.String("service", cfg.AppName),
			zap.Int("port", cfg.Port),
			zap.String("apiPrefix", cfg.APIPrefix),
		)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Fatal("http server error", zap.Error(err))
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	runCancel()

	ctxShutdown, cancelShutdown := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancelShutdown()
	if err := server.Shutdown(ctxShutdown); err != nil {
		logger.Error("graceful shutdown failed", zap.Error(err))
	}

	logger.Info("server stopped")
}

func runMigration(ctx context.Context, pool *pgxpool.Pool, migrationFile string) error {
	if _, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`); err != nil {
		return fmt.Errorf("ensure schema_migrations failed: %w", err)
	}

	version := filepath.Base(filepath.Clean(migrationFile))

	var alreadyApplied bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`, version).Scan(&alreadyApplied); err != nil {
		return fmt.Errorf("check migration version failed: %w", err)
	}
	if alreadyApplied {
		return nil
	}

	var shipmentsExists bool
	if err := pool.QueryRow(ctx, `SELECT to_regclass('public.shipments') IS NOT NULL`).Scan(&shipmentsExists); err != nil {
		return fmt.Errorf("check shipments table failed: %w", err)
	}
	if shipmentsExists {
		if _, err := pool.Exec(ctx, `INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT (version) DO NOTHING`, version); err != nil {
			return fmt.Errorf("record existing migration state failed: %w", err)
		}
		return nil
	}

	data, err := os.ReadFile(filepath.Clean(migrationFile))
	if err != nil {
		return fmt.Errorf("read migration file %s: %w", migrationFile, err)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin migration tx failed: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, string(data)); err != nil {
		return fmt.Errorf("execute migration: %w", err)
	}

	if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT (version) DO NOTHING`, version); err != nil {
		return fmt.Errorf("persist migration version failed: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit migration failed: %w", err)
	}

	return nil
}

func newLogger(appEnv string) (*zap.Logger, error) {
	if appEnv == "production" {
		return zap.NewProduction()
	}
	return zap.NewDevelopment()
}
