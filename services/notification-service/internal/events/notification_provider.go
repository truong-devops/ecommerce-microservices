package events

import (
	"context"
	"fmt"
	"os"
	"strings"

	"notification-service/internal/domain"

	"go.uber.org/zap"
)

type SendNotificationInput struct {
	NotificationID string
	RecipientID    string
	Channel        domain.NotificationChannel
	Subject        *string
	Content        string
	EventType      *string
	Payload        map[string]any
}

type SendNotificationResult struct {
	Provider        string
	ResponseMessage *string
}

type NotificationProvider interface {
	Send(ctx context.Context, input SendNotificationInput) (SendNotificationResult, error)
}

type MockNotificationProvider struct {
	logger    *zap.Logger
	forceFail bool
}

func NewMockNotificationProvider(logger *zap.Logger) *MockNotificationProvider {
	return &MockNotificationProvider{
		logger:    logger,
		forceFail: strings.EqualFold(strings.TrimSpace(os.Getenv("MOCK_NOTIFICATION_FORCE_FAIL")), "true"),
	}
}

func (p *MockNotificationProvider) Send(_ context.Context, input SendNotificationInput) (SendNotificationResult, error) {
	if p.forceFail {
		return SendNotificationResult{}, fmt.Errorf("mock provider forced failure")
	}

	p.logger.Info("mock notification dispatched",
		zap.String("provider", "mock-provider"),
		zap.String("notification_id", input.NotificationID),
		zap.String("recipient_id", input.RecipientID),
		zap.String("channel", string(input.Channel)),
	)

	msg := "accepted"
	return SendNotificationResult{
		Provider:        "mock-provider",
		ResponseMessage: &msg,
	}, nil
}
