package service

import (
	"context"
	"time"

	"go.uber.org/zap"
)

type PaymentExpiryWorker struct {
	svc       *PaymentService
	logger    *zap.Logger
	enabled   bool
	interval  time.Duration
	batchSize int
}

func NewPaymentExpiryWorker(svc *PaymentService, logger *zap.Logger, enabled bool, interval time.Duration, batchSize int) *PaymentExpiryWorker {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &PaymentExpiryWorker{
		svc:       svc,
		logger:    logger,
		enabled:   enabled,
		interval:  interval,
		batchSize: batchSize,
	}
}

func (w *PaymentExpiryWorker) Run(ctx context.Context) {
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
			count, err := w.svc.FailExpiredPayments(ctx, w.batchSize)
			if err != nil {
				w.logger.Error("expired payment scan failed", zap.Error(err))
				continue
			}
			if count > 0 {
				w.logger.Warn("expired pending payments marked failed", zap.Int("count", count))
			}
		}
	}
}
