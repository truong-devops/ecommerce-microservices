package middleware

import (
	"net/http"
	"sync"
	"time"

	apperrors "api-gateway/pkg/errors"
	"api-gateway/pkg/response"

	"golang.org/x/time/rate"
)

type visitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

type visitorStore struct {
	rate     rate.Limit
	burst    int
	mu       sync.Mutex
	visitors map[string]*visitor
}

func newVisitorStore(rps float64, burst int) *visitorStore {
	store := &visitorStore{
		rate:     rate.Limit(rps),
		burst:    burst,
		visitors: make(map[string]*visitor),
	}
	go store.cleanup()
	return store
}

func (s *visitorStore) get(ip string) *rate.Limiter {
	s.mu.Lock()
	defer s.mu.Unlock()

	if v, ok := s.visitors[ip]; ok {
		v.lastSeen = time.Now()
		return v.limiter
	}

	limiter := rate.NewLimiter(s.rate, s.burst)
	s.visitors[ip] = &visitor{limiter: limiter, lastSeen: time.Now()}
	return limiter
}

func (s *visitorStore) cleanup() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		s.mu.Lock()
		for ip, v := range s.visitors {
			if time.Since(v.lastSeen) > 3*time.Minute {
				delete(s.visitors, ip)
			}
		}
		s.mu.Unlock()
	}
}

func RateLimit(rps float64, burst int) func(http.Handler) http.Handler {
	store := newVisitorStore(rps, burst)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			requestID := RequestIDFromContext(r.Context())
			ip := ClientIP(r)
			if !store.get(ip).Allow() {
				response.Error(w, http.StatusTooManyRequests, apperrors.CodeTooManyRequests, "Rate limit exceeded", requestID)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
