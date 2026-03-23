package auth

import (
	"fmt"
	"net/http"
	"strings"

	"api-gateway/internal/middleware"
	apperrors "api-gateway/pkg/errors"
	"api-gateway/pkg/response"

	"github.com/golang-jwt/jwt/v5"
	"go.uber.org/zap"
)

func Middleware(secret string, logger *zap.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			requestID := middleware.RequestIDFromContext(r.Context())

			authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
			if authHeader == "" || !strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
				response.Error(w, http.StatusUnauthorized, apperrors.CodeUnauthorized, "Missing or invalid Authorization header", requestID)
				return
			}

			tokenString := strings.TrimSpace(authHeader[7:])
			if tokenString == "" {
				response.Error(w, http.StatusUnauthorized, apperrors.CodeUnauthorized, "Invalid token", requestID)
				return
			}

			token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
				if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
				}
				return []byte(secret), nil
			})
			if err != nil || !token.Valid {
				response.Error(w, http.StatusUnauthorized, apperrors.CodeUnauthorized, "Invalid token", requestID)
				return
			}

			mapClaims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				response.Error(w, http.StatusUnauthorized, apperrors.CodeUnauthorized, "Invalid token claims", requestID)
				return
			}

			userID := claimAsString(mapClaims, "user_id")
			if userID == "" {
				userID = claimAsString(mapClaims, "sub")
			}

			user := User{
				UserID: userID,
				Email:  claimAsString(mapClaims, "email"),
				Role:   claimAsString(mapClaims, "role"),
			}
			if user.UserID == "" {
				response.Error(w, http.StatusUnauthorized, apperrors.CodeUnauthorized, "Invalid token claims", requestID)
				return
			}

			logger.Debug("authenticated request",
				zap.String("user_id", user.UserID),
				zap.String("role", user.Role),
			)

			next.ServeHTTP(w, r.WithContext(WithUser(r.Context(), user)))
		})
	}
}

func claimAsString(claims jwt.MapClaims, key string) string {
	value, ok := claims[key]
	if !ok || value == nil {
		return ""
	}
	if s, ok := value.(string); ok {
		return s
	}
	return ""
}
