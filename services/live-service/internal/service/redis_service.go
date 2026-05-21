package service

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
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

func (s *RedisService) TrackViewerPresence(ctx context.Context, sessionID, viewerID string, ttl time.Duration) (int64, error) {
	if !s.enabled || s.client == nil {
		return 0, nil
	}
	sessionID = strings.TrimSpace(sessionID)
	viewerID = strings.TrimSpace(viewerID)
	if sessionID == "" || viewerID == "" {
		return 0, nil
	}
	viewerKey := liveViewerPresenceKey(sessionID, viewerID)
	presenceKey := livePresenceKey(sessionID)
	if err := s.client.Set(ctx, viewerKey, "1", ttl).Err(); err != nil {
		return 0, err
	}
	if err := s.client.SAdd(ctx, presenceKey, viewerID).Err(); err != nil {
		return 0, err
	}
	if ttl > 0 {
		_ = s.client.Expire(ctx, presenceKey, ttl).Err()
	}
	return s.CountViewerPresence(ctx, sessionID)
}

func (s *RedisService) RefreshViewerPresence(ctx context.Context, sessionID, viewerID string, ttl time.Duration) error {
	if !s.enabled || s.client == nil {
		return nil
	}
	sessionID = strings.TrimSpace(sessionID)
	viewerID = strings.TrimSpace(viewerID)
	if sessionID == "" || viewerID == "" {
		return nil
	}
	viewerKey := liveViewerPresenceKey(sessionID, viewerID)
	exists, err := s.client.Exists(ctx, viewerKey).Result()
	if err != nil {
		return err
	}
	if exists == 0 {
		_, err = s.TrackViewerPresence(ctx, sessionID, viewerID, ttl)
		return err
	}
	if ttl > 0 {
		return s.client.Expire(ctx, viewerKey, ttl).Err()
	}
	return nil
}

func (s *RedisService) RemoveViewerPresence(ctx context.Context, sessionID, viewerID string) (int64, error) {
	if !s.enabled || s.client == nil {
		return 0, nil
	}
	sessionID = strings.TrimSpace(sessionID)
	viewerID = strings.TrimSpace(viewerID)
	if sessionID == "" || viewerID == "" {
		return 0, nil
	}
	if err := s.client.Del(ctx, liveViewerPresenceKey(sessionID, viewerID)).Err(); err != nil {
		return 0, err
	}
	if err := s.client.SRem(ctx, livePresenceKey(sessionID), viewerID).Err(); err != nil {
		return 0, err
	}
	return s.CountViewerPresence(ctx, sessionID)
}

func (s *RedisService) CountViewerPresence(ctx context.Context, sessionID string) (int64, error) {
	if !s.enabled || s.client == nil {
		return 0, nil
	}
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return 0, nil
	}
	presenceKey := livePresenceKey(sessionID)
	viewerIDs, err := s.client.SMembers(ctx, presenceKey).Result()
	if err != nil {
		return 0, err
	}
	var count int64
	stale := make([]any, 0)
	for _, viewerID := range viewerIDs {
		exists, err := s.client.Exists(ctx, liveViewerPresenceKey(sessionID, viewerID)).Result()
		if err != nil {
			return 0, err
		}
		if exists > 0 {
			count++
			continue
		}
		stale = append(stale, viewerID)
	}
	if len(stale) > 0 {
		_ = s.client.SRem(ctx, presenceKey, stale...).Err()
	}
	if count == 0 {
		_ = s.client.Del(ctx, presenceKey).Err()
	}
	return count, nil
}

func (s *RedisService) Close(_ context.Context) error {
	if !s.enabled || s.client == nil {
		return nil
	}
	return s.client.Close()
}

func liveViewerPresenceKey(sessionID, viewerID string) string {
	return "live:viewer:v1:" + strings.TrimSpace(sessionID) + ":" + strings.TrimSpace(viewerID)
}

func livePresenceKey(sessionID string) string {
	return "live:presence:v1:" + strings.TrimSpace(sessionID)
}
