package service

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"notification-service/internal/domain"
	"notification-service/internal/httpx"
	"notification-service/internal/repository"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type CreateNotificationRequest struct {
	RecipientIDs []string                     `json:"recipientIds"`
	Channel      *domain.NotificationChannel  `json:"channel,omitempty"`
	Category     *domain.NotificationCategory `json:"category,omitempty"`
	EventType    *string                      `json:"eventType,omitempty"`
	Subject      *string                      `json:"subject,omitempty"`
	Content      string                       `json:"content"`
	Payload      map[string]any               `json:"payload,omitempty"`
}

type ListNotificationRequest struct {
	Page        int
	PageSize    int
	Status      *domain.NotificationStatus
	Channel     *domain.NotificationChannel
	Category    *domain.NotificationCategory
	RecipientID *string
	EventType   *string
	Search      *string
	SortBy      string
	SortOrder   string
}

type NotificationService struct {
	repo *repository.NotificationRepository
}

func NewNotificationService(repo *repository.NotificationRepository) *NotificationService {
	return &NotificationService{repo: repo}
}

func (s *NotificationService) CreateManualNotifications(
	ctx context.Context,
	user domain.UserContext,
	requestID string,
	req CreateNotificationRequest,
) (map[string]any, error) {
	if _, ok := domain.ManageNotificationRoles[user.Role]; !ok {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Only staff roles can create manual notifications", nil)
	}

	if err := validateCreateRequest(req); err != nil {
		return nil, err
	}

	seen := make(map[string]struct{}, len(req.RecipientIDs))
	for _, recipientID := range req.RecipientIDs {
		if _, exists := seen[recipientID]; exists {
			return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeConflict, "Duplicate recipient ids are not allowed", nil)
		}
		seen[recipientID] = struct{}{}
	}

	channel := domain.NotificationChannelInApp
	if req.Channel != nil {
		channel = *req.Channel
	}
	category := domain.NotificationCategoryCampaign
	if req.Category != nil {
		category = *req.Category
	}
	eventType := "notification.manual.campaign"
	if req.EventType != nil {
		eventType = strings.TrimSpace(*req.EventType)
	}

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackTx(ctx, tx)

	inputs := make([]repository.CreateNotificationInput, 0, len(req.RecipientIDs))
	for _, recipientID := range req.RecipientIDs {
		payload := copyMap(req.Payload)
		payload["metadata"] = map[string]any{
			"requestId": requestID,
			"actorId":   user.UserID,
			"actorRole": user.Role,
		}
		evt := eventType
		inputs = append(inputs, repository.CreateNotificationInput{
			RecipientID: recipientID,
			Channel:     channel,
			Category:    category,
			EventType:   &evt,
			Subject:     trimToPtr(req.Subject),
			Content:     req.Content,
			Payload:     payload,
		})
	}

	items, err := s.repo.SaveNotifications(ctx, tx, inputs)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	respItems := make([]map[string]any, 0, len(items))
	for _, item := range items {
		respItems = append(respItems, toNotificationResponse(item))
	}

	return map[string]any{
		"totalCreated": len(items),
		"items":        respItems,
	}, nil
}

func (s *NotificationService) ListNotifications(ctx context.Context, user domain.UserContext, query ListNotificationRequest) (map[string]any, error) {
	if !domain.IsReadableRole(user.Role) {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}

	forcedRecipientID := (*string)(nil)
	if user.Role == domain.RoleCustomer {
		forcedRecipientID = &user.UserID
	}

	items, totalItems, err := s.repo.List(ctx, domain.NotificationListQuery{
		Page:        query.Page,
		PageSize:    query.PageSize,
		Status:      query.Status,
		Channel:     query.Channel,
		Category:    query.Category,
		RecipientID: query.RecipientID,
		EventType:   query.EventType,
		Search:      query.Search,
		SortBy:      query.SortBy,
		SortOrder:   query.SortOrder,
	}, forcedRecipientID)
	if err != nil {
		return nil, err
	}

	respItems := make([]map[string]any, 0, len(items))
	for _, item := range items {
		respItems = append(respItems, toNotificationResponse(item))
	}

	return map[string]any{
		"items": respItems,
		"pagination": map[string]any{
			"page":       query.Page,
			"pageSize":   query.PageSize,
			"totalItems": totalItems,
			"totalPages": totalPages(totalItems, query.PageSize),
		},
	}, nil
}

func (s *NotificationService) GetNotificationByID(ctx context.Context, user domain.UserContext, notificationID string) (map[string]any, error) {
	if !domain.IsReadableRole(user.Role) {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}

	notification, err := s.repo.FindByID(ctx, notificationID)
	if err != nil {
		return nil, err
	}
	if notification == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotificationNotFound, "Notification not found", nil)
	}

	if user.Role == domain.RoleCustomer && notification.RecipientID != user.UserID {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Access denied for this notification", nil)
	}

	return toNotificationResponse(*notification), nil
}

func (s *NotificationService) MarkAsRead(ctx context.Context, user domain.UserContext, notificationID string) (map[string]any, error) {
	if !domain.IsReadableRole(user.Role) {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackTx(ctx, tx)

	notification, err := s.repo.FindByIDForUpdate(ctx, tx, notificationID)
	if err != nil {
		return nil, err
	}
	if notification == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotificationNotFound, "Notification not found", nil)
	}

	if user.Role == domain.RoleCustomer && notification.RecipientID != user.UserID {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Access denied for this notification", nil)
	}

	if notification.ReadAt != nil {
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return toNotificationResponse(*notification), nil
	}

	updated, err := s.repo.UpdateReadAt(ctx, tx, notificationID, time.Now().UTC())
	if err != nil {
		return nil, err
	}
	if updated == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotificationNotFound, "Notification not found", nil)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return toNotificationResponse(*updated), nil
}

func (s *NotificationService) HandleIncomingEvent(ctx context.Context, eventType string, payload map[string]any, eventKey string) (map[string]any, error) {
	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackTx(ctx, tx)

	if err := s.repo.SaveInboxEvent(ctx, tx, eventKey, eventType, payload); err != nil {
		if isUniqueViolation(err) {
			return map[string]any{
				"processed":    false,
				"duplicate":    true,
				"createdCount": 0,
			}, nil
		}
		return nil, err
	}

	mapped := mapEventToNotifications(eventType, payload)
	if len(mapped) > 0 {
		if _, err := s.repo.SaveNotifications(ctx, tx, mapped); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return map[string]any{
		"processed":    true,
		"duplicate":    false,
		"createdCount": len(mapped),
	}, nil
}

func toNotificationResponse(notification domain.Notification) map[string]any {
	resp := map[string]any{
		"id":          notification.ID,
		"recipientId": notification.RecipientID,
		"channel":     notification.Channel,
		"category":    notification.Category,
		"eventType":   nil,
		"subject":     nil,
		"content":     notification.Content,
		"payload":     notification.Payload,
		"status":      notification.Status,
		"retryCount":  notification.RetryCount,
		"sentAt":      nil,
		"readAt":      nil,
		"createdAt":   notification.CreatedAt.UTC().Format(time.RFC3339Nano),
		"updatedAt":   notification.UpdatedAt.UTC().Format(time.RFC3339Nano),
	}
	if notification.EventType != nil {
		resp["eventType"] = *notification.EventType
	}
	if notification.Subject != nil {
		resp["subject"] = *notification.Subject
	}
	if notification.SentAt != nil {
		resp["sentAt"] = notification.SentAt.UTC().Format(time.RFC3339Nano)
	}
	if notification.ReadAt != nil {
		resp["readAt"] = notification.ReadAt.UTC().Format(time.RFC3339Nano)
	}
	return resp
}

func validateCreateRequest(req CreateNotificationRequest) error {
	if len(req.RecipientIDs) < 1 {
		return validationError("recipientIds", "must contain at least 1 recipient")
	}
	for _, recipientID := range req.RecipientIDs {
		if !isUUID(recipientID) {
			return validationError("recipientIds", "must be UUID")
		}
	}

	if req.Channel != nil && !domain.IsValidChannel(*req.Channel) {
		return validationError("channel", "invalid channel")
	}
	if req.Category != nil && !domain.IsValidCategory(*req.Category) {
		return validationError("category", "invalid category")
	}
	if req.EventType != nil {
		value := strings.TrimSpace(*req.EventType)
		if len(value) > 128 {
			return validationError("eventType", "max length is 128")
		}
	}
	if req.Subject != nil {
		value := strings.TrimSpace(*req.Subject)
		if len(value) > 255 {
			return validationError("subject", "max length is 255")
		}
	}
	if l := len(strings.TrimSpace(req.Content)); l < 1 || l > 2000 {
		return validationError("content", "length must be between 1 and 2000")
	}

	return nil
}

func validationError(field, msg string) error {
	return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", map[string]any{field: msg})
}

func totalPages(totalItems, pageSize int) int {
	if totalItems == 0 {
		return 0
	}
	return (totalItems + pageSize - 1) / pageSize
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return false
}

func rollbackTx(ctx context.Context, tx pgx.Tx) {
	_ = tx.Rollback(ctx)
}

func trimToPtr(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	return &trimmed
}

func copyMap(input map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range input {
		out[k] = v
	}
	return out
}

func mapEventToNotifications(eventType string, payload map[string]any) []repository.CreateNotificationInput {
	recipientID := resolveRecipientID(eventType, payload)
	if recipientID == "" {
		return nil
	}

	orderNumber := getString(payload, "orderNumber")
	shipmentID := getString(payload, "shipmentId")
	status := getString(payload, "status")

	one := func(channel domain.NotificationChannel, category domain.NotificationCategory, subject, content string) []repository.CreateNotificationInput {
		e := eventType
		s := subject
		return []repository.CreateNotificationInput{{
			RecipientID: recipientID,
			Channel:     channel,
			Category:    category,
			EventType:   &e,
			Subject:     &s,
			Content:     content,
			Payload:     payload,
		}}
	}

	switch eventType {
	case "auth.email.verification.requested":
		return one(domain.NotificationChannelEmail, domain.NotificationCategoryAuth, "Verify your email", "Please verify your email using token "+fallback(getString(payload, "token"), "N/A")+".")
	case "auth.password.reset.requested":
		return one(domain.NotificationChannelEmail, domain.NotificationCategoryAuth, "Reset your password", "Use token "+fallback(getString(payload, "token"), "N/A")+" to reset your password.")
	case "auth.email.verified":
		return one(domain.NotificationChannelInApp, domain.NotificationCategoryAuth, "Email verified", "Your email address has been verified successfully.")
	case "auth.password.reset.completed":
		return one(domain.NotificationChannelInApp, domain.NotificationCategoryAuth, "Password reset completed", "Your password has been changed successfully.")
	case "order.created":
		return one(domain.NotificationChannelInApp, domain.NotificationCategoryOrder, "Order created", "Your order "+orderNumber+" was created successfully.")
	case "order.cancelled":
		return one(domain.NotificationChannelInApp, domain.NotificationCategoryOrder, "Order cancelled", "Your order "+orderNumber+" has been cancelled.")
	case "order.status-updated":
		return one(domain.NotificationChannelInApp, domain.NotificationCategoryOrder, "Order status updated", "Your order "+orderNumber+" status is now "+fallback(status, "UPDATED")+".")
	case "order.delivered":
		return one(domain.NotificationChannelInApp, domain.NotificationCategoryOrder, "Order delivered", "Your order "+orderNumber+" has been delivered.")
	case "shipment.created":
		return one(domain.NotificationChannelInApp, domain.NotificationCategoryShipping, "Shipment created", "Shipment "+shipmentID+" has been created.")
	case "shipment.status-updated":
		return one(domain.NotificationChannelInApp, domain.NotificationCategoryShipping, "Shipment status updated", "Shipment "+shipmentID+" status is now "+fallback(status, "UPDATED")+".")
	case "shipment.delivered":
		return one(domain.NotificationChannelInApp, domain.NotificationCategoryShipping, "Shipment delivered", "Shipment "+shipmentID+" was delivered.")
	case "shipment.failed":
		return one(domain.NotificationChannelInApp, domain.NotificationCategoryShipping, "Shipment failed", "Shipment "+shipmentID+" failed to deliver.")
	case "shipment.cancelled":
		return one(domain.NotificationChannelInApp, domain.NotificationCategoryShipping, "Shipment cancelled", "Shipment "+shipmentID+" has been cancelled.")
	case "chat.message.created":
		text := strings.TrimSpace(getNestedString(payload, "message", "text"))
		if text == "" {
			text = "You have a new message."
		}
		if len(text) > 120 {
			text = text[:120] + "..."
		}
		return one(domain.NotificationChannelInApp, domain.NotificationCategorySystem, "New message", text)
	default:
		return nil
	}
}

func resolveRecipientID(eventType string, payload map[string]any) string {
	switch {
	case strings.HasPrefix(eventType, "auth."):
		return getString(payload, "userId")
	case strings.HasPrefix(eventType, "order."):
		return getString(payload, "userId")
	case strings.HasPrefix(eventType, "shipment."):
		return getString(payload, "buyerId")
	case strings.HasPrefix(eventType, "chat."):
		recipientID := getString(payload, "recipientId")
		if recipientID != "" {
			return recipientID
		}
		buyerID := getString(payload, "buyerId")
		sellerID := getString(payload, "sellerId")
		senderID := getString(payload, "senderId")
		switch senderID {
		case buyerID:
			return sellerID
		case sellerID:
			return buyerID
		default:
			return ""
		}
	default:
		return ""
	}
}

func getString(payload map[string]any, key string) string {
	value, ok := payload[key]
	if !ok || value == nil {
		return ""
	}
	s, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(s)
}

func getNestedString(payload map[string]any, parentKey, childKey string) string {
	parent, ok := payload[parentKey]
	if !ok || parent == nil {
		return ""
	}
	obj, ok := parent.(map[string]any)
	if !ok {
		return ""
	}
	value, ok := obj[childKey]
	if !ok || value == nil {
		return ""
	}
	text, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(text)
}

func fallback(value, defaultValue string) string {
	if strings.TrimSpace(value) == "" {
		return defaultValue
	}
	return value
}

func isUUID(value string) bool {
	_, err := uuid.Parse(strings.TrimSpace(value))
	return err == nil
}
