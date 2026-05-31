package service

import (
	"context"
	"time"

	"go.uber.org/zap"
)

type SePayReconciliationWorker struct {
	svc       *PaymentService
	client    *SePayAPIClient
	logger    *zap.Logger
	enabled   bool
	interval  time.Duration
	batchSize int
}

func NewSePayReconciliationWorker(
	svc *PaymentService,
	client *SePayAPIClient,
	logger *zap.Logger,
	enabled bool,
	interval time.Duration,
	batchSize int,
) *SePayReconciliationWorker {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &SePayReconciliationWorker{
		svc:       svc,
		client:    client,
		logger:    logger,
		enabled:   enabled,
		interval:  interval,
		batchSize: batchSize,
	}
}

func (w *SePayReconciliationWorker) Run(ctx context.Context) {
	if !w.enabled || w.svc == nil || w.client == nil {
		return
	}
	if w.interval <= 0 {
		w.interval = 30 * time.Minute
	}

	w.reconcile(ctx)

	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.reconcile(ctx)
		}
	}
}

func (w *SePayReconciliationWorker) reconcile(ctx context.Context) {
	count, err := w.svc.ReconcileSePayTransactions(ctx, w.client, w.batchSize)
	if err != nil {
		w.logger.Error("sepay reconciliation failed", zap.Error(err))
		return
	}
	if count > 0 {
		w.logger.Warn("sepay reconciliation imported missing transactions", zap.Int("count", count))
	}
}
