package middleware

import (
	"net/http"
	"strings"

	"github.com/google/uuid"
)

func RequestID() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			requestID := strings.TrimSpace(r.Header.Get(HeaderRequestID))
			if requestID == "" {
				requestID = uuid.NewString()
			}

			w.Header().Set(HeaderRequestID, requestID)
			next.ServeHTTP(w, r.WithContext(WithRequestID(r.Context(), requestID)))
		})
	}
}
