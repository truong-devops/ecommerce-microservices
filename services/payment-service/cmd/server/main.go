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

	"payment-service-go/internal/config"
	"payment-service-go/internal/events"
	"payment-service-go/internal/handler"
	"payment-service-go/internal/repository"
	"payment-service-go/internal/router"
	"payment-service-go/internal/service"

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

	repo := repository.NewPaymentRepository(pool)
	idempotencyService := service.NewIdempotencyService(repo, redisService, cfg.IdempotencyRecordTTLMinutes, cfg.IdempotencyLockTTLSeconds)
	gateway := service.NewMockPaymentGateway()
	orderClient := service.NewOrderClient(cfg.OrderServiceBaseURL, cfg.DependencyTimeout)
	paymentService := service.NewPaymentService(repo, idempotencyService, gateway, orderClient, cfg.GatewayProvider, cfg.WebhookIdempotencyTTLMin)
	healthService := service.NewHealthService(cfg.AppName, repo, redisService)

	paymentHandler := handler.NewPaymentHandler(paymentService)
	healthHandler := handler.NewHealthHandler(healthService)

	httpHandler := router.New(cfg, logger, redisService, paymentHandler, healthHandler)

	publisher := events.NewPublisher(cfg, logger)
	defer publisher.Close()

	dispatcher := events.NewDispatcher(repo, publisher, logger, cfg.DispatchInterval, cfg.DispatchBatch, cfg.DispatchMaxRetry)
	consumer := service.NewOrderEventsConsumer(cfg, logger, paymentService)

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
		logger.Info("payment-service started",
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
	consumer.Close()

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
