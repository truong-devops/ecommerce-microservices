package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"api-gateway/internal/config"
	"api-gateway/internal/observability"
	"api-gateway/internal/router"

	"go.uber.org/zap"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		zap.NewExample().Fatal("failed to load config", zap.Error(err))
	}

	logger, err := observability.NewLogger(cfg.AppEnv)
	if err != nil {
		zap.NewExample().Fatal("failed to create logger", zap.Error(err))
	}
	defer func() {
		_ = logger.Sync()
	}()

	metrics := observability.NewMetrics(cfg.AppName)

	// Extension point: initialize OpenTelemetry provider/tracing here.
	handler, err := router.New(cfg, logger, metrics)
	if err != nil {
		logger.Fatal("failed to build router", zap.Error(err))
	}

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		logger.Info("api-gateway started",
			zap.String("app", cfg.AppName),
			zap.String("env", cfg.AppEnv),
			zap.String("addr", server.Addr),
		)

		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Fatal("server failed", zap.Error(err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutdown signal received")
	ctx, cancel := context.WithTimeout(context.Background(), cfg.Server.ShutdownTimeout)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Error("graceful shutdown failed", zap.Error(err))
		if closeErr := server.Close(); closeErr != nil {
			logger.Error("force close failed", zap.Error(closeErr))
		}
	}

	logger.Info("api-gateway stopped")
}
