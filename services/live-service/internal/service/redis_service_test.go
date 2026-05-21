package service

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
)

func TestRedisViewerPresenceTracksRefreshesAndRemovesViewer(t *testing.T) {
	miniRedis := miniredis.RunT(t)
	redisService, err := NewRedisService(true, "redis://"+miniRedis.Addr())
	if err != nil {
		t.Fatalf("NewRedisService returned error: %v", err)
	}
	defer redisService.Close(context.Background())

	ctx := context.Background()
	count, err := redisService.TrackViewerPresence(ctx, "session-1", "viewer-1", 30*time.Second)
	if err != nil {
		t.Fatalf("TrackViewerPresence returned error: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected one viewer, got %d", count)
	}
	if !miniRedis.Exists(liveViewerPresenceKey("session-1", "viewer-1")) {
		t.Fatal("expected per-viewer presence key")
	}
	if !miniRedis.Exists(livePresenceKey("session-1")) {
		t.Fatal("expected aggregate presence key")
	}

	if err := redisService.RefreshViewerPresence(ctx, "session-1", "viewer-1", 30*time.Second); err != nil {
		t.Fatalf("RefreshViewerPresence returned error: %v", err)
	}
	count, err = redisService.RemoveViewerPresence(ctx, "session-1", "viewer-1")
	if err != nil {
		t.Fatalf("RemoveViewerPresence returned error: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected zero viewers after remove, got %d", count)
	}
	if miniRedis.Exists(liveViewerPresenceKey("session-1", "viewer-1")) {
		t.Fatal("expected per-viewer presence key to be deleted")
	}
}

func TestRedisViewerPresencePrunesExpiredViewerKeys(t *testing.T) {
	miniRedis := miniredis.RunT(t)
	redisService, err := NewRedisService(true, "redis://"+miniRedis.Addr())
	if err != nil {
		t.Fatalf("NewRedisService returned error: %v", err)
	}
	defer redisService.Close(context.Background())

	ctx := context.Background()
	if _, err := redisService.TrackViewerPresence(ctx, "session-1", "viewer-1", time.Second); err != nil {
		t.Fatalf("TrackViewerPresence returned error: %v", err)
	}
	miniRedis.FastForward(2 * time.Second)

	count, err := redisService.CountViewerPresence(ctx, "session-1")
	if err != nil {
		t.Fatalf("CountViewerPresence returned error: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected expired viewer to be pruned, got %d", count)
	}
	if miniRedis.Exists(livePresenceKey("session-1")) {
		isMember, err := miniRedis.SIsMember(livePresenceKey("session-1"), "viewer-1")
		if err != nil {
			t.Fatalf("SIsMember returned error: %v", err)
		}
		if isMember {
			t.Fatal("expected expired viewer to be removed from aggregate set")
		}
	}
}

func TestLivePubSubEnvelopeAddsVersionAndTimestamp(t *testing.T) {
	envelope := LivePubSubEnvelope("live:message:new", "session-1", map[string]any{
		"type":    "live:message:new",
		"message": map[string]any{"id": "msg-1"},
	})

	if envelope["type"] != "live:message:new" {
		t.Fatalf("unexpected type: %v", envelope["type"])
	}
	if envelope["version"] != 1 {
		t.Fatalf("unexpected version: %v", envelope["version"])
	}
	if envelope["sessionId"] != "session-1" {
		t.Fatalf("unexpected sessionId: %v", envelope["sessionId"])
	}
	if _, ok := envelope["occurredAt"].(string); !ok {
		t.Fatalf("expected occurredAt timestamp, got %#v", envelope["occurredAt"])
	}
}
