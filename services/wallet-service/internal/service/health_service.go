package service

import (
	"context"
	"time"
)

type HealthStore interface {
	Ping(ctx context.Context) error
}

type HealthService struct {
	appName string
	store   HealthStore
}

func NewHealthService(appName string, store HealthStore) *HealthService {
	return &HealthService{appName: appName, store: store}
}

func (s *HealthService) Health() map[string]any {
	return map[string]any{"status": "ok", "service": s.appName, "timestamp": time.Now().UTC().Format(time.RFC3339)}
}

func (s *HealthService) Ready(ctx context.Context) (map[string]any, error) {
	if err := s.store.Ping(ctx); err != nil {
		return nil, err
	}
	return map[string]any{
		"status":       "ready",
		"dependencies": map[string]any{"postgres": true},
		"timestamp":    time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func (s *HealthService) Live() map[string]any {
	return map[string]any{"status": "alive", "service": s.appName, "timestamp": time.Now().UTC().Format(time.RFC3339)}
}
