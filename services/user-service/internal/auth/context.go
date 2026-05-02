package auth

import "context"

type User struct {
	UserID       string
	Email        string
	Role         string
	SessionID    string
	JTI          string
	TokenVersion int
}

type userContextKey struct{}

func WithUser(ctx context.Context, user User) context.Context {
	return context.WithValue(ctx, userContextKey{}, user)
}

func UserFromContext(ctx context.Context) (User, bool) {
	user, ok := ctx.Value(userContextKey{}).(User)
	return user, ok
}
