package service

import (
	"context"
	"time"
)

type HealthService struct {
	appName string
	storage *StorageService
}

func NewHealthService(appName string, storage *StorageService) *HealthService {
	return &HealthService{appName: appName, storage: storage}
}

func (s *HealthService) Health() map[string]any {
	return map[string]any{
		"status":    "ok",
		"service":   s.appName,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
}

func (s *HealthService) Ready(ctx context.Context) (map[string]any, error) {
	if err := s.storage.Ready(ctx); err != nil {
		return nil, err
	}

	return map[string]any{
		"status": "ready",
		"dependencies": map[string]any{
			"minio": true,
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
