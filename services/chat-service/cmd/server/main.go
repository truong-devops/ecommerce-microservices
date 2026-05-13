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

	"chat-service/internal/config"
	"chat-service/internal/events"
	"chat-service/internal/handler"
	"chat-service/internal/repository"
	"chat-service/internal/router"
	"chat-service/internal/service"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
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

	mongoClient, err := mongo.Connect(ctx, options.Client().ApplyURI(cfg.MongoURI))
	if err != nil {
		logger.Fatal("failed to init mongo client", zap.Error(err))
	}
	defer func() {
		closeCtx, closeCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer closeCancel()
		_ = mongoClient.Disconnect(closeCtx)
	}()

	if err := mongoClient.Ping(ctx, nil); err != nil {
		logger.Fatal("failed to connect mongo", zap.Error(err))
	}

	db := mongoClient.Database(cfg.MongoDatabase)
	repo := repository.NewChatRepository(db)
	if err := repo.EnsureIndexes(ctx); err != nil {
		logger.Fatal("failed to ensure indexes", zap.Error(err))
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

	sendLimiter := service.NewSendRateLimiter(cfg.SendMessageRateRPS, cfg.SendMessageRateBurst)
	chatService := service.NewChatService(repo, redisService, sendLimiter)
	healthService := service.NewHealthService(cfg.AppName, repo, redisService)

	chatHandler := handler.NewChatHandler(chatService, redisService, cfg.WSAllowedOrigins)
	healthHandler := handler.NewHealthHandler(healthService)

	httpHandler := router.New(cfg, logger, redisService, chatHandler, healthHandler)

	publisher := events.NewPublisher(cfg, logger)
	defer publisher.Close()

	dispatcher := events.NewDispatcher(repo, publisher, logger, cfg.DispatchInterval, cfg.DispatchBatch, cfg.DispatchMaxRetry)
	runCtx, runCancel := context.WithCancel(context.Background())
	defer runCancel()
	go dispatcher.Run(runCtx)

	server := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           httpHandler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       20 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		logger.Info("chat-service started",
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

func newLogger(appEnv string) (*zap.Logger, error) {
	if appEnv == "production" {
		return zap.NewProduction()
	}
	return zap.NewDevelopment()
}
