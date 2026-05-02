package auth

import (
	"fmt"
	"net/http"
	"strings"

	"user-service-go/internal/domain"
	"user-service-go/internal/httpx"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"go.uber.org/zap"
)

const (
	RoleCustomer   = "CUSTOMER"
	RoleAdmin      = "ADMIN"
	RoleSupport    = "SUPPORT"
	RoleSeller     = "SELLER"
	RoleSuperAdmin = "SUPER_ADMIN"
)

type RevokedTokenChecker interface {
	IsAccessTokenRevoked(r *http.Request, jti string) (bool, error)
}

func RequireJWT(secret string, checker RevokedTokenChecker, logger *zap.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractBearerToken(r.Header.Get("Authorization"))
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

func RequireRoles(roles ...string) func(http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(roles))
	for _, role := range roles {
		allowed[strings.ToUpper(strings.TrimSpace(role))] = struct{}{}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, ok := UserFromContext(r.Context())
			if !ok || user.UserID == "" {
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

func RequireSelfOrRoles(param string, roles ...string) func(http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(roles))
	for _, role := range roles {
		allowed[strings.ToUpper(strings.TrimSpace(role))] = struct{}{}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, ok := UserFromContext(r.Context())
			if !ok || user.UserID == "" {
				httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
				return
			}

			resourceID := strings.TrimSpace(chi.URLParam(r, param))
			if resourceID != "" && resourceID == user.UserID {
				next.ServeHTTP(w, r)
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

func parseUserFromToken(tokenString, secret string) (User, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil || !token.Valid {
		return User{}, fmt.Errorf("invalid token")
	}

	mapClaims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return User{}, fmt.Errorf("invalid token claims")
	}

	userID := claimAsString(mapClaims, "sub")
	role := strings.ToUpper(claimAsString(mapClaims, "role"))
	sessionID := claimAsString(mapClaims, "sessionId")
	jti := claimAsString(mapClaims, "jti")
	if userID == "" || role == "" || sessionID == "" || jti == "" {
		return User{}, fmt.Errorf("missing required token claims")
	}

	return User{
		UserID:       userID,
		Email:        claimAsString(mapClaims, "email"),
		Role:         role,
		SessionID:    sessionID,
		JTI:          jti,
		TokenVersion: claimAsInt(mapClaims, "tokenVersion"),
	}, nil
}

func extractBearerToken(header string) string {
	value := strings.TrimSpace(header)
	if value == "" || !strings.HasPrefix(strings.ToLower(value), "bearer ") {
		return ""
	}
	return strings.TrimSpace(value[7:])
}

func claimAsString(claims jwt.MapClaims, key string) string {
	value, ok := claims[key]
	if !ok || value == nil {
		return ""
	}
	if v, ok := value.(string); ok {
		return strings.TrimSpace(v)
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
