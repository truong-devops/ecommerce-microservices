package service

import (
	"context"
	"time"

	"go.uber.org/zap"
)

type ReleaseWorker struct {
	service  *WalletService
	logger   *zap.Logger
	interval time.Duration
}

func NewReleaseWorker(service *WalletService, logger *zap.Logger, interval time.Duration) *ReleaseWorker {
	return &ReleaseWorker{service: service, logger: logger, interval: interval}
}

func (w *ReleaseWorker) Run(ctx context.Context) {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			count, err := w.service.ReleaseDueFunds(ctx)
			if err != nil {
				w.logger.Error("release due wallet funds failed", zap.Error(err))
				continue
			}
			if count > 0 {
				w.logger.Info("released due wallet funds", zap.Int("count", count))
			}
		}
	}
}
