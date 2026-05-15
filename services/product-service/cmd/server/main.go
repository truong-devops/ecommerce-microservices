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

	"product-service/internal/config"
	"product-service/internal/events"
	"product-service/internal/handler"
	"product-service/internal/repository"
	"product-service/internal/router"
	"product-service/internal/search"
	"product-service/internal/service"

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

	mongoClient, mongoDB, err := connectMongo(cfg)
	if err != nil {
		logger.Fatal("failed to connect mongo", zap.Error(err))
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = mongoClient.Disconnect(ctx)
	}()

	productRepo := repository.NewMongoProductRepository(mongoDB)
	videoRepo := repository.NewMongoVideoRepository(mongoDB)
	shopDecorRepo := repository.NewMongoShopDecorRepository(mongoDB)
	ctxIdx, cancelIdx := context.WithTimeout(context.Background(), 20*time.Second)
	if err := productRepo.EnsureIndexes(ctxIdx); err != nil {
		cancelIdx()
		logger.Fatal("failed to ensure product indexes", zap.Error(err))
	}
	if err := videoRepo.EnsureIndexes(ctxIdx); err != nil {
		cancelIdx()
		logger.Fatal("failed to ensure video indexes", zap.Error(err))
	}
	if err := shopDecorRepo.EnsureIndexes(ctxIdx); err != nil {
		cancelIdx()
		logger.Fatal("failed to ensure shop decor indexes", zap.Error(err))
	}
	cancelIdx()

	redisService, err := service.NewRedisService(cfg.RedisEnabled, cfg.RedisURL)
	if err != nil {
		logger.Fatal("failed to init redis", zap.Error(err))
	}
	defer func() {
		_ = redisService.Close()
	}()

	searchClient := search.NewProductSearchClient(cfg)
	ctxSearch, cancelSearch := context.WithTimeout(context.Background(), 10*time.Second)
	_ = searchClient.EnsureIndex(ctxSearch)
	cancelSearch()

	eventPublisher := events.NewProductEventPublisher(cfg, logger)
	defer eventPublisher.Close()

	productService := service.NewProductService(productRepo, searchClient, eventPublisher, cfg.MediaPublicBaseURL)
	videoService := service.NewVideoService(videoRepo, productRepo, redisService, eventPublisher, cfg.MediaPublicBaseURL)
	shopDecorService := service.NewShopDecorService(shopDecorRepo)
	healthService := service.NewHealthService(cfg.AppName, mongoClient, redisService)

	httpHandler := router.New(
		cfg,
		logger,
		redisService,
		handler.NewProductHandler(productService),
		handler.NewVideoHandler(videoService),
		handler.NewShopDecorHandler(shopDecorService),
		handler.NewHealthHandler(healthService),
	)

	server := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           httpHandler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       20 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		logger.Info("product-service started", zap.String("service", cfg.AppName), zap.Int("port", cfg.Port), zap.String("apiPrefix", cfg.APIPrefix))
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Fatal("http server error", zap.Error(err))
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	ctxShutdown, cancelShutdown := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancelShutdown()
	if err := server.Shutdown(ctxShutdown); err != nil {
		logger.Error("graceful shutdown failed", zap.Error(err))
	}
	logger.Info("server stopped")
}

func connectMongo(cfg config.Config) (*mongo.Client, *mongo.Database, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(cfg.MongoURI))
	if err != nil {
		return nil, nil, err
	}
	if err := client.Ping(ctx, nil); err != nil {
		_ = client.Disconnect(ctx)
		return nil, nil, err
	}
	return client, client.Database(cfg.MongoDatabase), nil
}

func newLogger(appEnv string) (*zap.Logger, error) {
	if appEnv == "production" {
		return zap.NewProduction()
	}
	return zap.NewDevelopment()
}
