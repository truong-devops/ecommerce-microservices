package events

import (
	"context"
	"errors"
	"math"
	"time"

	"notification-service/internal/domain"
	"notification-service/internal/repository"

	"github.com/jackc/pgx/v5/pgconn"
	"go.uber.org/zap"
)

type Dispatcher struct {
	repo      *repository.NotificationRepository
	provider  NotificationProvider
	logger    *zap.Logger
	interval  time.Duration
	batchSize int
	maxRetry  int
	running   bool
}

func NewDispatcher(
	repo *repository.NotificationRepository,
	provider NotificationProvider,
	logger *zap.Logger,
	interval time.Duration,
	batchSize int,
	maxRetry int,
) *Dispatcher {
	return &Dispatcher{
		repo:      repo,
		provider:  provider,
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

	notifications, err := d.repo.FindDispatchable(ctx, d.batchSize)
	if err != nil {
		if isPgCode(err, "42P01") {
			d.logger.Warn("notifications table is not ready. run migration first")
			return
		}
		d.logger.Error("failed to fetch dispatchable notifications", zap.Error(err))
		return
	}

	for _, notification := range notifications {
		tx, err := d.repo.BeginTx(ctx)
		if err != nil {
			d.logger.Error("dispatcher begin tx failed", zap.Error(err))
			continue
		}

		result, err := d.provider.Send(ctx, SendNotificationInput{
			NotificationID: notification.ID,
			RecipientID:    notification.RecipientID,
			Channel:        notification.Channel,
			Subject:        notification.Subject,
			Content:        notification.Content,
			EventType:      notification.EventType,
			Payload:        notification.Payload,
		})
		if err == nil {
			saveErr := d.repo.SaveAttempt(ctx, tx, repository.CreateAttemptInput{
				NotificationID:  notification.ID,
				Provider:        result.Provider,
				Status:          string(domain.NotificationStatusSent),
				ResponseMessage: result.ResponseMessage,
				ErrorCode:       nil,
				Metadata:        nil,
			})
			if saveErr == nil {
				saveErr = d.repo.MarkSent(ctx, tx, notification.ID)
			}
			if saveErr == nil {
				saveErr = tx.Commit(ctx)
			}
			if saveErr != nil {
				_ = tx.Rollback(ctx)
				d.logger.Error("dispatcher mark sent failed", zap.Error(saveErr))
			}
			continue
		}

		retryCount := notification.RetryCount + 1
		cappedRetry := minInt(retryCount, d.maxRetry)
		nextRetrySeconds := minInt(int(math.Pow(2, float64(cappedRetry))), 300)
		var nextRetryAt *time.Time
		if retryCount < d.maxRetry {
			t := time.Now().UTC().Add(time.Duration(nextRetrySeconds) * time.Second)
			nextRetryAt = &t
		}

		errCode := "DISPATCH_FAILED"
		errMsg := err.Error()
		saveErr := d.repo.SaveAttempt(ctx, tx, repository.CreateAttemptInput{
			NotificationID:  notification.ID,
			Provider:        "mock-provider",
			Status:          string(domain.NotificationStatusFailed),
			ResponseMessage: nil,
			ErrorCode:       &errCode,
			Metadata:        map[string]any{"error": errMsg},
		})
		if saveErr == nil {
			saveErr = d.repo.MarkFailed(ctx, tx, notification.ID, retryCount, nextRetryAt)
		}
		if saveErr == nil {
			saveErr = tx.Commit(ctx)
		}
		if saveErr != nil {
			_ = tx.Rollback(ctx)
			d.logger.Error("dispatcher mark failed failed", zap.Error(saveErr))
			continue
		}

		d.logger.Error("failed to dispatch notification",
			zap.String("notification_id", notification.ID),
			zap.Int("retry_count", retryCount),
			zap.String("status", string(domain.NotificationStatusFailed)),
			zap.Error(err),
		)
	}
}

func isPgCode(err error, code string) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == code
	}
	return false
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
