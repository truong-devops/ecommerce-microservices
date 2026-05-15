package service

import (
	"context"
	"net/http"
	"time"

	"product-service/internal/domain"
	"product-service/internal/httpx"
	"product-service/internal/timefmt"

	"go.mongodb.org/mongo-driver/mongo"
)

type HealthService struct {
	appName string
	mongo   *mongo.Client
	redis   *RedisService
}

func NewHealthService(appName string, mongoClient *mongo.Client, redisService *RedisService) *HealthService {
	return &HealthService{appName: appName, mongo: mongoClient, redis: redisService}
}

func (s *HealthService) Health() map[string]any {
	return map[string]any{"status": "ok", "service": s.appName, "timestamp": timefmt.ISO(time.Now())}
}

func (s *HealthService) Live() map[string]any {
	return map[string]any{"status": "alive", "service": s.appName, "timestamp": timefmt.ISO(time.Now())}
}

func (s *HealthService) Ready(ctx context.Context) (map[string]any, error) {
	mongoReady := s.mongo != nil && s.mongo.Ping(ctx, nil) == nil
	if !mongoReady {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "MongoDB is not ready", nil)
	}
	redisReady := true
	if s.redis != nil {
		redisReady = s.redis.Ping(ctx)
	}
	if !redisReady {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Redis is not ready", nil)
	}
	return map[string]any{
		"status":       "ready",
		"dependencies": map[string]bool{"mongo": mongoReady, "redis": redisReady},
		"timestamp":    timefmt.ISO(time.Now()),
	}, nil
}
