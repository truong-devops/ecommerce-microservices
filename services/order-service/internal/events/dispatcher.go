package events

import (
	"context"
	"math"
	"time"

	"order-service/internal/repository"

	"go.uber.org/zap"
)

type Dispatcher struct {
	repo      *repository.OrderRepository
	publisher *Publisher
	logger    *zap.Logger
	interval  time.Duration
	batchSize int
	maxRetry  int
	running   bool
}

func NewDispatcher(
	repo *repository.OrderRepository,
	publisher *Publisher,
	logger *zap.Logger,
	interval time.Duration,
	batchSize int,
	maxRetry int,
) *Dispatcher {
	return &Dispatcher{
		repo:      repo,
		publisher: publisher,
		logger:    logger,
		interval:  interval,
		batchSize: batchSize,
		maxRetry:  maxRetry,
	}
}

func (d *Dispatcher) Run(ctx context.Context) {
	ticker := time.NewTicker(d.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			d.dispatchPending(ctx)
		}
	}
}

func (d *Dispatcher) dispatchPending(ctx context.Context) {
	if d.running {
		return
	}
	d.running = true
	defer func() { d.running = false }()

	events, err := d.repo.FindDispatchableOutboxEvents(ctx, d.batchSize)
	if err != nil {
		d.logger.Error("failed to fetch dispatchable outbox events", zap.Error(err))
		return
	}

	for _, event := range events {
		if err := d.publisher.Publish(ctx, event.EventType, event.Payload); err == nil {
			if markErr := d.repo.MarkOutboxPublished(ctx, event.ID); markErr != nil {
				d.logger.Error("failed to mark outbox event published", zap.String("event_id", event.ID), zap.Error(markErr))
			}
			continue
		}

		retryCount := event.RetryCount + 1
		cappedRetry := minInt(retryCount, d.maxRetry)
		nextRetrySeconds := minInt(int(math.Pow(2, float64(cappedRetry))), 300)
		var nextRetryAt *time.Time
		if retryCount < d.maxRetry {
			t := time.Now().UTC().Add(time.Duration(nextRetrySeconds) * time.Second)
			nextRetryAt = &t
		}

		if markErr := d.repo.MarkOutboxFailed(ctx, event.ID, retryCount, nextRetryAt); markErr != nil {
			d.logger.Error("failed to mark outbox event failed", zap.String("event_id", event.ID), zap.Error(markErr))
			continue
		}

		d.logger.Error("failed to publish outbox event",
			zap.String("event_id", event.ID),
			zap.String("event_type", event.EventType),
			zap.Int("retry_count", retryCount),
			zap.Error(err),
		)
	}
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
