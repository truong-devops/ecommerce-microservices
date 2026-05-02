package service

import (
	"context"
	"time"

	"go.uber.org/zap"
)

type ReservationExpirer struct {
	svc      *InventoryService
	logger   *zap.Logger
	interval time.Duration
	running  bool
}

func NewReservationExpirer(svc *InventoryService, logger *zap.Logger, interval time.Duration) *ReservationExpirer {
	return &ReservationExpirer{svc: svc, logger: logger, interval: interval}
}

func (e *ReservationExpirer) Run(ctx context.Context) {
	ticker := time.NewTicker(e.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			e.expire(ctx)
		}
	}
}

func (e *ReservationExpirer) expire(ctx context.Context) {
	if e.running {
		return
	}
	e.running = true
	defer func() { e.running = false }()

	if err := e.svc.ExpireActiveReservationsBatch(ctx); err != nil {
		e.logger.Error("reservation expirer failed", zap.Error(err))
	}
}
