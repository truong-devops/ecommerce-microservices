package service

import (
	"context"
	"time"

	"go.uber.org/zap"
)

type SagaTimeoutWorker struct {
	svc          *OrderSagaService
	logger       *zap.Logger
	enabled      bool
	interval     time.Duration
	timeoutAfter time.Duration
	batchSize    int
}

func NewSagaTimeoutWorker(
	svc *OrderSagaService,
	logger *zap.Logger,
	enabled bool,
	interval time.Duration,
	timeoutAfter time.Duration,
	batchSize int,
) *SagaTimeoutWorker {
	return &SagaTimeoutWorker{
		svc:          svc,
		logger:       logger,
		enabled:      enabled,
		interval:     interval,
		timeoutAfter: timeoutAfter,
		batchSize:    batchSize,
	}
}

func (w *SagaTimeoutWorker) Run(ctx context.Context) {
	if !w.enabled || w.svc == nil {
		return
	}
	if w.interval <= 0 {
		w.interval = time.Minute
	}
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.runOnce(ctx)
		}
	}
}

func (w *SagaTimeoutWorker) runOnce(ctx context.Context) {
	count, err := w.svc.FailStalePendingSagas(ctx, w.timeoutAfter, w.batchSize)
	if err != nil {
		w.logger.Error("checkout saga timeout scan failed", zap.Error(err))
		return
	}
	if count > 0 {
		w.logger.Warn("checkout saga timeout marked stale orders failed", zap.Int("count", count))
	}
}
