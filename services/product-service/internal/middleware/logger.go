package middleware

import (
	"net/http"
	"time"

	"go.uber.org/zap"
)

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func Logger(logger *zap.Logger, service string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rec, r)
			logger.Info("http request",
				zap.String("requestId", RequestIDFromContext(r.Context())),
				zap.String("service", service),
				zap.String("method", r.Method),
				zap.String("path", r.URL.Path),
				zap.Int("statusCode", rec.status),
				zap.Int64("durationMs", time.Since(start).Milliseconds()),
			)
		})
	}
}
