package service

import (
	"context"
	"time"

	"order-service/internal/repository"
)

type HealthService struct {
	appName string
	repo    *repository.OrderRepository
	redis   *RedisService
}

func NewHealthService(appName string, repo *repository.OrderRepository, redis *RedisService) *HealthService {
	return &HealthService{appName: appName, repo: repo, redis: redis}
}

func (s *HealthService) Health() map[string]any {
	return map[string]any{
		"status":    "ok",
		"service":   s.appName,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
}

func (s *HealthService) Ready(ctx context.Context) (map[string]any, error) {
	if err := s.repo.Ping(ctx); err != nil {
		return nil, err
	}

	var redisHealthy any = nil
	if s.redis.Enabled() {
		if err := s.redis.Ping(ctx); err != nil {
			return nil, err
		}
		redisHealthy = true
	}

	return map[string]any{
		"status": "ready",
		"dependencies": map[string]any{
			"postgres": true,
			"redis":    redisHealthy,
		},
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func (s *HealthService) Live() map[string]any {
	return map[string]any{
		"status":    "alive",
		"service":   s.appName,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
}
