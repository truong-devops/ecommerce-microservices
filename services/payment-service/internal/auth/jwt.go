package auth

import (
	"fmt"
	"net/http"
	"strings"

	"payment-service-go/internal/domain"
	"payment-service-go/internal/httpx"

	"github.com/golang-jwt/jwt/v5"
	"go.uber.org/zap"
)

type RevokedTokenChecker interface {
	IsAccessTokenRevoked(r *http.Request, jti string) (bool, error)
}

func RequireJWT(secret string, checker RevokedTokenChecker, logger *zap.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := httpx.ExtractBearerToken(r.Header.Get("Authorization"))
			if token == "" {
				httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
				return
			}

			user, err := parseUserFromToken(token, secret)
			if err != nil {
				logger.Warn("auth failed", zap.Error(err))
				httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
				return
			}

			if user.JTI != "" && checker != nil {
				revoked, checkErr := checker.IsAccessTokenRevoked(r, user.JTI)
				if checkErr != nil {
					logger.Error("token revocation check failed", zap.Error(checkErr))
					httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
					return
				}
				if revoked {
					httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Access token revoked", nil)
					return
				}
			}

			next.ServeHTTP(w, r.WithContext(WithUser(r.Context(), user)))
		})
	}
}

func RequireRoles(roles ...domain.Role) func(http.Handler) http.Handler {
	allowed := make(map[domain.Role]struct{}, len(roles))
	for _, role := range roles {
		allowed[role] = struct{}{}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, ok := UserFromContext(r.Context())
			if !ok {
				httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
				return
			}

			if _, exists := allowed[user.Role]; !exists {
				httpx.WriteError(w, r, http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func parseUserFromToken(tokenString, secret string) (domain.UserContext, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil || !token.Valid {
		return domain.UserContext{}, fmt.Errorf("invalid token")
	}

	mapClaims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return domain.UserContext{}, fmt.Errorf("invalid token claims")
	}

	userID := claimAsString(mapClaims, "sub")
	email := claimAsString(mapClaims, "email")
	role := domain.Role(strings.ToUpper(claimAsString(mapClaims, "role")))

	if userID == "" || role == "" || !domain.IsValidRole(role) {
		return domain.UserContext{}, fmt.Errorf("missing required token claims")
	}

	return domain.UserContext{
		UserID:       userID,
		Email:        email,
		Role:         role,
		SessionID:    claimAsString(mapClaims, "sessionId"),
		JTI:          claimAsString(mapClaims, "jti"),
		TokenVersion: claimAsInt(mapClaims, "tokenVersion"),
	}, nil
}

func claimAsString(claims jwt.MapClaims, key string) string {
	value, ok := claims[key]
	if !ok || value == nil {
		return ""
	}
	if s, ok := value.(string); ok {
		return strings.TrimSpace(s)
	}
	return ""
}

func claimAsInt(claims jwt.MapClaims, key string) int {
	value, ok := claims[key]
	if !ok || value == nil {
		return 0
	}
	switch v := value.(type) {
	case float64:
		return int(v)
	case int:
		return v
	default:
		return 0
	}
}
