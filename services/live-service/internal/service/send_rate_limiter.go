package service

import (
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

type rateVisitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

type SendRateLimiter struct {
	mu       sync.Mutex
	rate     rate.Limit
	burst    int
	visitors map[string]*rateVisitor
}

func NewSendRateLimiter(rps float64, burst int) *SendRateLimiter {
	l := &SendRateLimiter{
		rate:     rate.Limit(rps),
		burst:    burst,
		visitors: make(map[string]*rateVisitor),
	}
	go l.cleanup()
	return l
}

func (l *SendRateLimiter) Allow(key string) bool {
	trimmed := strings.TrimSpace(key)
	if trimmed == "" {
		trimmed = "__anonymous__"
	}
	return l.get(trimmed).Allow()
}

func (l *SendRateLimiter) get(key string) *rate.Limiter {
	l.mu.Lock()
	defer l.mu.Unlock()

	if visitor, ok := l.visitors[key]; ok {
		visitor.lastSeen = time.Now().UTC()
		return visitor.limiter
	}

	limiter := rate.NewLimiter(l.rate, l.burst)
	l.visitors[key] = &rateVisitor{
		limiter:  limiter,
		lastSeen: time.Now().UTC(),
	}
	return limiter
}

func (l *SendRateLimiter) cleanup() {
	ticker := time.NewTicker(2 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		l.mu.Lock()
		for key, visitor := range l.visitors {
			if time.Since(visitor.lastSeen) > 5*time.Minute {
				delete(l.visitors, key)
			}
		}
		l.mu.Unlock()
	}
}
