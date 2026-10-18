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

	"wallet-service/internal/config"
	"wallet-service/internal/events"
	"wallet-service/internal/handler"
	"wallet-service/internal/observability"
	"wallet-service/internal/repository"
	"wallet-service/internal/router"
	"wallet-service/internal/service"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "--healthcheck" {
		runHealthcheck()
		return
	}
	cfg, err := config.Load()
	if err != nil {
		panic(fmt.Errorf("load config: %w", err))
	}
	logger, err := newLogger(cfg.AppEnv)
	if err != nil {
		panic(fmt.Errorf("init logger: %w", err))
	}
	defer logger.Sync()

	startupCtx, startupCancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer startupCancel()
	pool, err := pgxpool.New(startupCtx, cfg.DatabaseURL)
	if err != nil {
		logger.Fatal("init postgres pool failed", zap.Error(err))
	}
	defer pool.Close()
	if err := pool.Ping(startupCtx); err != nil {
		logger.Fatal("connect postgres failed", zap.Error(err))
	}
	if cfg.RunMigrations {
		if err := runMigration(startupCtx, pool, cfg.MigrationFile); err != nil {
			logger.Fatal("run wallet migration failed", zap.Error(err))
		}
	}

	walletRepository := repository.NewWalletRepository(pool)
	walletService := service.NewWalletService(walletRepository, logger, cfg.HoldDuration, cfg.ReleaseBatch)
	bankCipher, err := service.NewBankAccountCipher(cfg.BankEncryptionKey)
	if err != nil {
		logger.Fatal("init bank account encryption failed", zap.Error(err))
	}
	payoutService := service.NewPayoutService(walletRepository, bankCipher, cfg.PayoutEnabled, cfg.PayoutMinAmount, cfg.PayoutMaxAmount, cfg.PayoutIdempotencyTTL)
	adminService := service.NewAdminService(walletRepository, bankCipher, cfg.PayoutEnabled, cfg.PayoutProvider)
	var payoutWorker *service.PayoutWorker
	if cfg.PayoutProvider == "mock" {
		payoutProvider := service.NewMockPayoutProvider(cfg.MockPayoutMode)
		payoutWorker = service.NewPayoutWorker(walletRepository, payoutProvider, bankCipher, logger, cfg.PayoutInterval, cfg.PayoutReconcileInterval, cfg.PayoutStaleAfter, cfg.PayoutBatch)
	}
	metrics := observability.NewMetrics()
	payoutService.SetMetrics(metrics)
	if payoutWorker != nil {
		payoutWorker.SetMetrics(metrics)
	}
	healthService := service.NewHealthService(cfg.AppName, walletRepository)
	walletHandler := handler.NewWalletHandler(walletService)
	payoutHandler := handler.NewPayoutHandler(payoutService)
	adminHandler := handler.NewAdminHandler(adminService)
	healthHandler := handler.NewHealthHandler(healthService)
	httpHandler := router.New(cfg, logger, nil, walletHandler, payoutHandler, adminHandler, healthHandler, metrics)

	publisher := events.NewPublisher(cfg, logger)
	defer publisher.Close()
	dispatcher := events.NewDispatcher(walletRepository, publisher, logger, cfg.OutboxDispatchInterval, cfg.OutboxBatch, cfg.OutboxMaxRetry)
	consumer := events.NewConsumer(cfg, logger, walletService)
	defer consumer.Close()
	releaseWorker := service.NewReleaseWorker(walletService, logger, cfg.ReleaseInterval)

	runCtx, runCancel := context.WithCancel(context.Background())
	defer runCancel()
	if cfg.KafkaEnabled {
		go dispatcher.Run(runCtx)
		go consumer.Run(runCtx)
	}
	go releaseWorker.Run(runCtx)
	if cfg.PayoutEnabled && payoutWorker != nil {
		go payoutWorker.Run(runCtx)
	}

	server := &http.Server{
		Addr: fmt.Sprintf(":%d", cfg.Port), Handler: httpHandler,
		ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 20 * time.Second,
		WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second,
	}
	go func() {
		logger.Info("wallet-service started", zap.Int("port", cfg.Port), zap.String("api_prefix", cfg.APIPrefix))
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Fatal("wallet http server failed", zap.Error(err))
		}
	}()

	signalChannel := make(chan os.Signal, 1)
	signal.Notify(signalChannel, syscall.SIGINT, syscall.SIGTERM)
	<-signalChannel
	runCancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer shutdownCancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("wallet graceful shutdown failed", zap.Error(err))
	}
	logger.Info("wallet-service stopped")
}

func runHealthcheck() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3015"
	}
	client := &http.Client{Timeout: 3 * time.Second}
	response, err := client.Get("http://127.0.0.1:" + port + "/api/v1/health")
	if err != nil || response.StatusCode != http.StatusOK {
		os.Exit(1)
	}
	_ = response.Body.Close()
}

func runMigration(ctx context.Context, pool *pgxpool.Pool, migrationFile string) error {
	data, err := os.ReadFile(filepath.Clean(migrationFile))
	if err != nil {
		return fmt.Errorf("read migration %s: %w", migrationFile, err)
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
