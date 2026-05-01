package events

import "context"

type UserRegisteredEventPayload struct {
	UserID string `json:"userId"`
	Email  string `json:"email"`
	Role   string `json:"role"`
}

type UserEventsPublisher interface {
	PublishUserRegistered(ctx context.Context, event UserRegisteredEventPayload) error
	Close(ctx context.Context) error
}

type NoopUserEventsPublisher struct{}

func (n *NoopUserEventsPublisher) PublishUserRegistered(context.Context, UserRegisteredEventPayload) error {
	return nil
}

func (n *NoopUserEventsPublisher) Close(context.Context) error {
	return nil
}
