package service

import (
	"context"
	"net/http"

	"github.com/redis/go-redis/v9"
)

type RedisService struct {
	enabled bool
	client  *redis.Client
}

func NewRedisService(enabled bool, redisURL string) (*RedisService, error) {
	if !enabled {
		return &RedisService{}, nil
	}
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}
	return &RedisService{enabled: true, client: redis.NewClient(opt)}, nil
}

func (s *RedisService) Client() *redis.Client {
	if s == nil || !s.enabled {
		return nil
	}
	return s.client
}

func (s *RedisService) Ping(ctx context.Context) bool {
	if s == nil || !s.enabled || s.client == nil {
		return true
	}
	return s.client.Ping(ctx).Err() == nil
}

func (s *RedisService) IsAccessTokenRevoked(_ *http.Request, jti string) (bool, error) {
	if s == nil || !s.enabled || s.client == nil || jti == "" {
		return false, nil
	}
	value, err := s.client.Get(context.Background(), "revoked:access:"+jti).Result()
	if err == redis.Nil {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return value != "", nil
}

func (s *RedisService) Close() error {
	if s == nil || !s.enabled || s.client == nil {
		return nil
	}
	return s.client.Close()
}
