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

	"order-service/internal/config"
	"order-service/internal/events"
	"order-service/internal/handler"
	"order-service/internal/metrics"
	"order-service/internal/repository"
	"order-service/internal/router"
	"order-service/internal/service"

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

	repo := repository.NewOrderRepository(pool)
	checkoutSagaMetrics := metrics.NewCheckoutSagaMetrics()
	idemService := service.NewIdempotencyService(repo, redisService, cfg.IdempotencyRecordTTLMinutes, cfg.IdempotencyLockTTLSeconds)
	productCatalogClient := service.NewProductCatalogClient(cfg.ProductServiceBaseURL, cfg.DependencyTimeout)
	orderService := service.NewOrderService(repo, idemService, productCatalogClient, checkoutSagaMetrics)
	orderSagaService := service.NewOrderSagaService(repo, logger, checkoutSagaMetrics)
	healthService := service.NewHealthService(cfg.AppName, repo, redisService)

	orderHandler := handler.NewOrderHandler(orderService)
	healthHandler := handler.NewHealthHandler(healthService)

	httpHandler := router.New(cfg, logger, redisService, orderHandler, healthHandler, checkoutSagaMetrics)

	publisher := events.NewPublisher(cfg, logger)
	defer publisher.Close()

	dispatcher := events.NewDispatcher(repo, publisher, logger, cfg.DispatchInterval, cfg.DispatchBatch, cfg.DispatchMaxRetry)
	inventoryConsumer := events.NewInventorySagaConsumer(cfg, logger, orderSagaService)
	paymentConsumer := events.NewPaymentSagaConsumer(cfg, logger, orderSagaService)
	sagaTimeoutWorker := service.NewSagaTimeoutWorker(orderSagaService, logger, cfg.SagaTimeoutEnabled, cfg.SagaTimeoutInterval, cfg.SagaTimeoutAfter, cfg.SagaTimeoutBatch)
	defer inventoryConsumer.Close()
	defer paymentConsumer.Close()
	runCtx, runCancel := context.WithCancel(context.Background())
	defer runCancel()
	go dispatcher.Run(runCtx)
	go inventoryConsumer.Run(runCtx)
	go paymentConsumer.Run(runCtx)
	go sagaTimeoutWorker.Run(runCtx)

	server := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           httpHandler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       20 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		logger.Info("order-service started",
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
	data, err := os.ReadFile(filepath.Clean(migrationFile))
	if err != nil {
		return fmt.Errorf("read migration file %s: %w", migrationFile, err)
	}

	if _, err := pool.Exec(ctx, string(data)); err != nil {
		return fmt.Errorf("execute migration: %w", err)
	}

	return nil
}

func newLogger(appEnv string) (*zap.Logger, error) {
	if appEnv == "production" {
		return zap.NewProduction()
	}
	return zap.NewDevelopment()
}
