package service

import (
	"context"

	"live-service/internal/repository"
)

type HealthService struct {
	appName string
	repo    repository.Repository
	redis   *RedisService
}

func NewHealthService(appName string, repo repository.Repository, redis *RedisService) *HealthService {
	return &HealthService{appName: appName, repo: repo, redis: redis}
}

func (s *HealthService) Health() map[string]any {
	return map[string]any{"service": s.appName, "status": "ok"}
}

func (s *HealthService) Live() map[string]any {
	return map[string]any{"service": s.appName, "status": "live"}
}

func (s *HealthService) Ready(ctx context.Context) (map[string]any, error) {
	if err := s.repo.Ping(ctx); err != nil {
		return nil, err
	}
	if s.redis != nil {
		if err := s.redis.Ping(ctx); err != nil {
			return nil, err
		}
	}
	return map[string]any{"service": s.appName, "status": "ready"}, nil
}
