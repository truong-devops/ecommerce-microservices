package middleware

import (
	"net/http"
	"runtime/debug"

	apperrors "api-gateway/pkg/errors"
	"api-gateway/pkg/response"

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
					response.Error(w, http.StatusInternalServerError, apperrors.CodeInternalServer, "Internal server error", requestID)
				}
			}()

			next.ServeHTTP(w, r)
		})
	}
}
