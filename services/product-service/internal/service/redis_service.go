package service

import (
	"context"
	"encoding/json"
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

func (s *RedisService) GetJSON(ctx context.Context, key string, dest any) error {
	if s == nil || !s.enabled || s.client == nil {
		return redis.Nil
	}
	value, err := s.client.Get(ctx, key).Bytes()
	if err != nil {
		return err
	}
	return json.Unmarshal(value, dest)
}

func (s *RedisService) SetJSON(ctx context.Context, key string, value any, ttl time.Duration) error {
	if s == nil || !s.enabled || s.client == nil {
		return nil
	}
	payload, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return s.client.Set(ctx, key, payload, ttl).Err()
}

func (s *RedisService) AddToSet(ctx context.Context, setKey string, ttl time.Duration, members ...string) error {
	if s == nil || !s.enabled || s.client == nil || len(members) == 0 {
		return nil
	}
	args := make([]any, 0, len(members))
	for _, member := range members {
		args = append(args, member)
	}
	if err := s.client.SAdd(ctx, setKey, args...).Err(); err != nil {
		return err
	}
	return s.client.Expire(ctx, setKey, ttl).Err()
}

func (s *RedisService) SetMembers(ctx context.Context, setKey string) ([]string, error) {
	if s == nil || !s.enabled || s.client == nil {
		return nil, nil
	}
	return s.client.SMembers(ctx, setKey).Result()
}

func (s *RedisService) Delete(ctx context.Context, keys ...string) error {
	if s == nil || !s.enabled || s.client == nil || len(keys) == 0 {
		return nil
	}
	return s.client.Del(ctx, keys...).Err()
}

func (s *RedisService) Close() error {
	if s == nil || !s.enabled || s.client == nil {
		return nil
	}
	return s.client.Close()
}
