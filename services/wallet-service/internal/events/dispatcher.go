package events

import (
	"context"
	"math"
	"time"

	"wallet-service/internal/repository"

	"go.uber.org/zap"
)

type Dispatcher struct {
	repository *repository.WalletRepository
	publisher  *Publisher
	logger     *zap.Logger
	interval   time.Duration
	batchSize  int
	maxRetry   int
}

func NewDispatcher(repository *repository.WalletRepository, publisher *Publisher, logger *zap.Logger, interval time.Duration, batchSize, maxRetry int) *Dispatcher {
	return &Dispatcher{repository: repository, publisher: publisher, logger: logger, interval: interval, batchSize: batchSize, maxRetry: maxRetry}
}

func (d *Dispatcher) Run(ctx context.Context) {
	ticker := time.NewTicker(d.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			d.dispatch(ctx)
		}
	}
}

func (d *Dispatcher) dispatch(ctx context.Context) {
	events, err := d.repository.FindDispatchableOutboxEvents(ctx, d.batchSize)
	if err != nil {
		d.logger.Error("find wallet outbox events failed", zap.Error(err))
		return
	}
	for _, event := range events {
		if err := d.publisher.Publish(ctx, event.ID, event.EventType, event.Payload); err == nil {
			if err := d.repository.MarkOutboxPublished(ctx, event.ID); err != nil {
				d.logger.Error("mark wallet outbox published failed", zap.String("event_id", event.ID), zap.Error(err))
			}
			continue
		}
		retryCount := event.RetryCount + 1
		var nextRetryAt *time.Time
		if retryCount < d.maxRetry {
			seconds := math.Min(math.Pow(2, float64(retryCount)), 300)
			value := time.Now().UTC().Add(time.Duration(seconds) * time.Second)
			nextRetryAt = &value
		}
		if err := d.repository.MarkOutboxFailed(ctx, event.ID, retryCount, nextRetryAt); err != nil {
			d.logger.Error("mark wallet outbox failed", zap.String("event_id", event.ID), zap.Error(err))
		}
	}
}
