package service

import "testing"

func TestSendRateLimiterAllow(t *testing.T) {
	limiter := NewSendRateLimiter(1, 1)

	if !limiter.Allow("user-1") {
		t.Fatalf("expected first request to pass")
	}

	if limiter.Allow("user-1") {
		t.Fatalf("expected second immediate request to be limited")
	}
}

func TestSendRateLimiterIsolatedKeys(t *testing.T) {
	limiter := NewSendRateLimiter(1, 1)

	if !limiter.Allow("user-a") {
		t.Fatalf("expected user-a to pass")
	}

	if !limiter.Allow("user-b") {
		t.Fatalf("expected user-b to pass")
	}
}
