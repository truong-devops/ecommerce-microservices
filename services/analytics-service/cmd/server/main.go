package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"analytics-service/internal/config"
	"analytics-service/internal/events"
	"analytics-service/internal/handler"
	"analytics-service/internal/repository"
	"analytics-service/internal/router"
	"analytics-service/internal/service"

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

	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		logger.Fatal("failed to parse postgres config", zap.Error(err))
	}
	poolCfg.MaxConns = int32(cfg.DBPoolMax)

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		logger.Fatal("failed to init postgres pool", zap.Error(err))
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		logger.Fatal("failed to connect postgres", zap.Error(err))
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

	repo := repository.NewAnalyticsRepository(pool)
	if err := repo.EnsureSchema(ctx); err != nil {
		logger.Fatal("failed to ensure schema", zap.Error(err))
	}

	analyticsService := service.NewAnalyticsService(repo, redisService, cfg.IngestDedupeTTLSeconds)
	orderClient := service.NewOrderClient(cfg.OrderServiceBaseURL, cfg.OrderServiceInternalToken, cfg.DependencyTimeout, cfg.RecommendationOrderFetchPageSize)
	recommendationService := service.NewRecommendationService(repo, orderClient, service.RecommendationConfig{
		Enabled:           cfg.RecommendationEnabled,
		WindowDays:        cfg.RecommendationWindowDays,
		MinSupportCount:   cfg.RecommendationMinSupportCount,
		MinConfidence:     cfg.RecommendationMinConfidence,
		MaxAntecedentSize: cfg.RecommendationMaxAntecedentSize,
		MaxRules:          cfg.RecommendationMaxRules,
	})
	healthService := service.NewHealthService(cfg.AppName, repo, redisService)

	analyticsHandler := handler.NewAnalyticsHandler(analyticsService, recommendationService)
	healthHandler := handler.NewHealthHandler(healthService)

	httpHandler := router.New(cfg, logger, redisService, analyticsHandler, healthHandler)

	consumer := events.NewConsumer(cfg.KafkaEnabled, cfg.KafkaBrokers, cfg.KafkaTopic, cfg.KafkaGroup, cfg.KafkaClientID, analyticsService, logger)

	runCtx, runCancel := context.WithCancel(context.Background())
	defer runCancel()
	go consumer.Run(runCtx)
	if cfg.RecommendationTrainingEnabled {
		go runRecommendationScheduler(runCtx, recommendationService, logger, cfg.RecommendationTrainingHour)
	}

	server := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           httpHandler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       20 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		logger.Info("analytics-service started", zap.String("service", cfg.AppName), zap.Int("port", cfg.Port), zap.String("apiPrefix", cfg.APIPrefix))
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

func runRecommendationScheduler(ctx context.Context, svc *service.RecommendationService, logger *zap.Logger, hour int) {
	for {
		next := nextDailyRun(time.Now(), hour)
		timer := time.NewTimer(time.Until(next))
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
			trainCtx, cancel := context.WithTimeout(ctx, 30*time.Minute)
			result, err := svc.Train(trainCtx)
			cancel()
			if err != nil {
				logger.Error("recommendation training failed", zap.Error(err))
				continue
			}
			logger.Info("recommendation training completed", zap.Any("result", result))
		}
	}
}

func nextDailyRun(now time.Time, hour int) time.Time {
	if hour < 0 || hour > 23 {
		hour = 2
	}
	next := time.Date(now.Year(), now.Month(), now.Day(), hour, 0, 0, 0, now.Location())
	if !next.After(now) {
		next = next.Add(24 * time.Hour)
	}
	return next
}

func newLogger(appEnv string) (*zap.Logger, error) {
	if appEnv == "production" {
		return zap.NewProduction()
	}
	return zap.NewDevelopment()
}
