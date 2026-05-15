package middleware

import (
	"encoding/json"
	"net/http"
	"time"

	"product-service-go/internal/domain"

	"go.uber.org/zap"
)

func Recovery(logger *zap.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if recovered := recover(); recovered != nil {
					logger.Error("panic recovered", zap.Any("panic", recovered), zap.String("requestId", RequestIDFromContext(r.Context())))
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusInternalServerError)
					_ = json.NewEncoder(w).Encode(map[string]any{
						"success": false,
						"error": map[string]any{
							"code":    domain.ErrorCodeInternalServerError,
							"message": "Internal server error",
						},
						"meta": map[string]any{
							"requestId": RequestIDFromContext(r.Context()),
							"timestamp": time.Now().UTC().Format(time.RFC3339),
						},
					})
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}
