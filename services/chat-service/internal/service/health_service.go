package service

import (
	"context"

	"chat-service/internal/repository"
)

type HealthService struct {
	appName string
	repo    *repository.ChatRepository
	redis   *RedisService
}

func NewHealthService(appName string, repo *repository.ChatRepository, redis *RedisService) *HealthService {
	return &HealthService{appName: appName, repo: repo, redis: redis}
}

func (s *HealthService) Health(ctx context.Context) map[string]any {
	return map[string]any{"service": s.appName, "status": "ok"}
}

func (s *HealthService) Ready(ctx context.Context) (map[string]any, error) {
	if err := s.repo.Ping(ctx); err != nil {
		return nil, err
	}
	if err := s.redis.Ping(ctx); err != nil {
		return nil, err
	}

	return map[string]any{
		"service": s.appName,
		"ready":   true,
		"deps": map[string]bool{
			"mongo": true,
			"redis": true,
		},
	}, nil
}

func (s *HealthService) Live(ctx context.Context) map[string]any {
	return map[string]any{"service": s.appName, "live": true}
}
