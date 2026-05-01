package auth

import (
	"context"

	"review-service-go/internal/domain"
)

type userContextKey struct{}

func WithUser(ctx context.Context, user domain.UserContext) context.Context {
	return context.WithValue(ctx, userContextKey{}, user)
}

func UserFromContext(ctx context.Context) (domain.UserContext, bool) {
	user, ok := ctx.Value(userContextKey{}).(domain.UserContext)
	return user, ok
}
