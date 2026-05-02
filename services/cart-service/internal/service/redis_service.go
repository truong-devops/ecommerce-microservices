package service

import (
	"context"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisService struct {
	enabled bool
	client  *redis.Client
}

func NewRedisService(enabled bool, redisURL string) (*RedisService, error) {
	if !enabled {
		return &RedisService{enabled: false}, nil
	}

	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}

	client := redis.NewClient(opt)
	return &RedisService{enabled: true, client: client}, nil
}

func (s *RedisService) Enabled() bool {
	return s.enabled
}

func (s *RedisService) Ping(ctx context.Context) error {
	if !s.enabled || s.client == nil {
		return nil
	}
	return s.client.Ping(ctx).Err()
}

func (s *RedisService) SetNXWithTTL(ctx context.Context, key, value string, ttl time.Duration) (bool, error) {
	if !s.enabled || s.client == nil {
		return true, nil
	}
	return s.client.SetNX(ctx, key, value, ttl).Result()
}

func (s *RedisService) Set(ctx context.Context, key, value string, ttl time.Duration) error {
	if !s.enabled || s.client == nil {
		return nil
	}
	return s.client.Set(ctx, key, value, ttl).Err()
}

func (s *RedisService) Get(ctx context.Context, key string) (string, error) {
	if !s.enabled || s.client == nil {
		return "", nil
	}
	value, err := s.client.Get(ctx, key).Result()
	if err == redis.Nil {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return value, nil
}

func (s *RedisService) Del(ctx context.Context, key string) error {
	if !s.enabled || s.client == nil {
		return nil
	}
	return s.client.Del(ctx, key).Err()
}

func (s *RedisService) IsAccessTokenRevoked(_ *http.Request, jti string) (bool, error) {
	if !s.enabled || s.client == nil || jti == "" {
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

func (s *RedisService) Close(ctx context.Context) error {
	if !s.enabled || s.client == nil {
		return nil
	}
	return s.client.Close()
}
