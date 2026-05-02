package service

import (
	"context"
	"encoding/json"
	"net/http"

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

func (s *RedisService) PublishJSON(ctx context.Context, channel string, payload any) error {
	if !s.enabled || s.client == nil {
		return nil
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return s.client.Publish(ctx, channel, body).Err()
}

func (s *RedisService) Subscribe(ctx context.Context, channel string) (*redis.PubSub, error) {
	if !s.enabled || s.client == nil {
		return nil, nil
	}
	pubsub := s.client.Subscribe(ctx, channel)
	if _, err := pubsub.Receive(ctx); err != nil {
		_ = pubsub.Close()
		return nil, err
	}
	return pubsub, nil
}

func (s *RedisService) Close(_ context.Context) error {
	if !s.enabled || s.client == nil {
		return nil
	}
	return s.client.Close()
}
