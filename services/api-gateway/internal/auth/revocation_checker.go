package auth

import (
	"context"
	"net/http"

	"github.com/redis/go-redis/v9"
)

type RevokedTokenChecker interface {
	IsAccessTokenRevoked(r *http.Request, jti string) (bool, error)
}

type RedisRevocationChecker struct {
	enabled bool
	client  *redis.Client
}

func NewRedisRevocationChecker(enabled bool, redisURL string) (*RedisRevocationChecker, error) {
	if !enabled {
		return &RedisRevocationChecker{enabled: false}, nil
	}

	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}

	client := redis.NewClient(opt)
	return &RedisRevocationChecker{enabled: true, client: client}, nil
}

func (c *RedisRevocationChecker) IsAccessTokenRevoked(_ *http.Request, jti string) (bool, error) {
	if !c.enabled || c.client == nil || jti == "" {
		return false, nil
	}

	value, err := c.client.Get(context.Background(), "revoked:access:"+jti).Result()
	if err == redis.Nil {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return value != "", nil
}

func (c *RedisRevocationChecker) Close(ctx context.Context) error {
	if !c.enabled || c.client == nil {
		return nil
	}
	return c.client.Close()
}
