package auth

import (
	"fmt"
	"net/http"
	"strings"

	"wallet-service/internal/domain"
	"wallet-service/internal/httpx"

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
			if checker != nil {
				revoked, checkErr := checker.IsAccessTokenRevoked(r, user.JTI)
				if checkErr != nil || revoked {
					httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
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
			if _, ok := allowed[user.Role]; !ok {
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
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil || !token.Valid {
		return domain.UserContext{}, fmt.Errorf("invalid token")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return domain.UserContext{}, fmt.Errorf("invalid claims")
	}
	user := domain.UserContext{
		UserID:       claimString(claims, "sub"),
		Email:        claimString(claims, "email"),
		Role:         domain.Role(strings.ToUpper(claimString(claims, "role"))),
		SessionID:    claimString(claims, "sessionId"),
		JTI:          claimString(claims, "jti"),
		TokenVersion: claimInt(claims, "tokenVersion"),
	}
	if user.UserID == "" || !domain.IsValidRole(user.Role) || user.SessionID == "" || user.JTI == "" {
		return domain.UserContext{}, fmt.Errorf("missing required token claims")
	}
	return user, nil
}

func claimString(claims jwt.MapClaims, key string) string {
	value, _ := claims[key].(string)
	return strings.TrimSpace(value)
}

func claimInt(claims jwt.MapClaims, key string) int {
	switch value := claims[key].(type) {
	case float64:
		return int(value)
	case int:
		return value
	default:
		return 0
	}
}
