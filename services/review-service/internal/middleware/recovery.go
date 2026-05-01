package middleware

import (
	"encoding/json"
	"net/http"
	"runtime/debug"
	"time"

	"go.uber.org/zap"
)

func Recovery(logger *zap.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					requestID := RequestIDFromContext(r.Context())
					logger.Error("panic recovered",
						zap.Any("panic", rec),
						zap.ByteString("stack", debug.Stack()),
						zap.String("request_id", requestID),
					)
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusInternalServerError)
					_ = json.NewEncoder(w).Encode(map[string]any{
						"success": false,
						"error": map[string]any{
							"code":    "INTERNAL_SERVER_ERROR",
							"message": "Internal server error",
						},
						"meta": map[string]any{
							"requestId": requestID,
							"timestamp": time.Now().UTC().Format(time.RFC3339),
						},
					})
				}
			}()

			next.ServeHTTP(w, r)
		})
	}
}
