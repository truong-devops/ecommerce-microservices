package service

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"chat-service/internal/domain"
	"chat-service/internal/httpx"
	"chat-service/internal/middleware"
	"chat-service/internal/repository"
)

type CreateConversationRequest struct {
	SellerID        *string `json:"sellerId,omitempty"`
	BuyerID         *string `json:"buyerId,omitempty"`
	OrderID         *string `json:"orderId,omitempty"`
	ProductID       *string `json:"productId,omitempty"`
	ShopID          *string `json:"shopId,omitempty"`
	BuyerName       *string `json:"buyerName,omitempty"`
	SellerName      *string `json:"sellerName,omitempty"`
	FirstMessage    *string `json:"firstMessage,omitempty"`
	ClientMessageID *string `json:"clientMessageId,omitempty"`
}

type ListConversationsRequest struct {
	Page     int
	PageSize int
}

type ListMessagesRequest struct {
	BeforeSeq int64
	Limit     int
}

type ListChatViolationsRequest struct {
	Page           int
	PageSize       int
	SenderID       string
	RuleID         string
	ConversationID string
	CreatedFrom    time.Time
	CreatedTo      time.Time
}

type SendMessageRequest struct {
	Text            string `json:"text"`
	ClientMessageID string `json:"clientMessageId,omitempty"`
}

type MarkReadRequest struct {
	LastReadSeq *int64 `json:"lastReadSeq,omitempty"`
}

type ChatService struct {
	repo        *repository.ChatRepository
	redis       *RedisService
	sendLimiter *SendRateLimiter
}

func NewChatService(repo *repository.ChatRepository, redis *RedisService, sendLimiter *SendRateLimiter) *ChatService {
	return &ChatService{repo: repo, redis: redis, sendLimiter: sendLimiter}
}

func (s *ChatService) CreateConversation(ctx context.Context, user domain.UserContext, req CreateConversationRequest) (map[string]any, error) {
	buyerID, sellerID, err := resolveParticipantIDs(user, req)
	if err != nil {
		return nil, err
	}

	contextData := domain.ConversationContext{
		OrderID:    normalizeOptional(req.OrderID),
		ProductID:  normalizeOptional(req.ProductID),
		ShopID:     normalizeOptional(req.ShopID),
		BuyerName:  normalizeOptional(req.BuyerName),
		SellerName: normalizeOptional(req.SellerName),
	}
	key := buildConversationKey(buyerID, sellerID)

	conversation, created, err := s.repo.CreateConversation(ctx, repository.CreateConversationInput{
		Key:      key,
		BuyerID:  buyerID,
		SellerID: sellerID,
		Context:  contextData,
	})
	if err != nil {
		return nil, err
	}

	if req.FirstMessage != nil && strings.TrimSpace(*req.FirstMessage) != "" {
		_, err := s.SendMessage(ctx, user, conversation.ID, SendMessageRequest{
			Text:            strings.TrimSpace(*req.FirstMessage),
			ClientMessageID: valueOrEmpty(req.ClientMessageID),
		})
		if err != nil {
			return nil, err
		}
		updated, findErr := s.repo.FindConversationByID(ctx, conversation.ID)
		if findErr == nil && updated != nil {
			conversation = *updated
		}
	}

	if created {
		if err := s.repo.InsertOutboxEvent(ctx, conversation.ID, domain.EventConversationCreated, map[string]any{
			"conversationId": conversation.ID,
			"buyerId":        conversation.BuyerID,
			"buyerCode":      formatUserCode(conversation.BuyerID, domain.RoleCustomer),
			"sellerId":       conversation.SellerID,
			"sellerCode":     formatUserCode(conversation.SellerID, domain.RoleSeller),
			"context": map[string]any{
				"productId":  conversation.Context.ProductID,
				"orderId":    conversation.Context.OrderID,
				"shopId":     conversation.Context.ShopID,
				"buyerName":  conversation.Context.BuyerName,
				"sellerName": conversation.Context.SellerName,
			},
			"metadata": buildEventMetadata(ctx, user, time.Now().UTC()),
		}); err != nil {
			return nil, err
		}
	}

	return conversationToResponse(conversation), nil
}

func (s *ChatService) ListConversations(ctx context.Context, user domain.UserContext, req ListConversationsRequest) (map[string]any, error) {
	items, totalItems, err := s.repo.ListConversations(ctx, repository.ListConversationFilter{
		Role:     user.Role,
		UserID:   user.UserID,
		Page:     req.Page,
		PageSize: req.PageSize,
	})
	if err != nil {
		return nil, err
	}

	respItems := make([]map[string]any, 0, len(items))
	for _, item := range items {
		respItems = append(respItems, conversationToResponse(item))
	}

	return map[string]any{
		"items": respItems,
		"pagination": map[string]any{
			"page":       req.Page,
			"pageSize":   req.PageSize,
			"totalItems": totalItems,
			"totalPages": totalPages(totalItems, req.PageSize),
		},
	}, nil
}

func (s *ChatService) ListMessages(ctx context.Context, user domain.UserContext, conversationID string, req ListMessagesRequest) (map[string]any, error) {
	conversation, err := s.repo.FindConversationByID(ctx, conversationID)
	if err != nil {
		return nil, err
	}
	if conversation == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Conversation not found", nil)
	}
	if !hasConversationAccess(user, *conversation) {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}

	messages, err := s.repo.ListMessages(ctx, conversationID, req.BeforeSeq, req.Limit)
	if err != nil {
		return nil, err
	}

	resp := make([]map[string]any, 0, len(messages))
	for _, message := range messages {
		resp = append(resp, messageToResponse(message))
	}
	return map[string]any{"items": resp}, nil
}

func (s *ChatService) ListChatViolations(ctx context.Context, user domain.UserContext, req ListChatViolationsRequest) (map[string]any, error) {
	if !canReviewChatViolations(user.Role) {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}

	items, totalItems, err := s.repo.ListChatViolations(ctx, repository.ListChatViolationsFilter{
		ConversationID: req.ConversationID,
		SenderID:       req.SenderID,
		RuleID:         req.RuleID,
		CreatedFrom:    req.CreatedFrom,
		CreatedTo:      req.CreatedTo,
		Page:           req.Page,
		PageSize:       req.PageSize,
	})
	if err != nil {
		return nil, err
	}

	return map[string]any{
		"items": items,
		"pagination": map[string]any{
			"page":       req.Page,
			"pageSize":   req.PageSize,
			"totalItems": totalItems,
			"totalPages": totalPages(totalItems, req.PageSize),
		},
	}, nil
}

func (s *ChatService) SendMessage(ctx context.Context, user domain.UserContext, conversationID string, req SendMessageRequest) (map[string]any, error) {
	text := strings.TrimSpace(req.Text)
	if len(text) < 1 || len(text) > 2000 {
		return nil, validationError("text", "length must be between 1 and 2000")
	}
	clientMessageID := strings.TrimSpace(req.ClientMessageID)
	if len(clientMessageID) > 128 {
		return nil, validationError("clientMessageId", "max length is 128")
	}

	conversation, err := s.repo.FindConversationByID(ctx, conversationID)
	if err != nil {
		return nil, err
	}
	if conversation == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Conversation not found", nil)
	}
	if !hasConversationAccess(user, *conversation) {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}
	if conversation.Status != domain.ConversationStatusActive {
		return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeConflict, "Conversation is not active", nil)
	}
	if s.sendLimiter != nil && !s.sendLimiter.Allow(user.UserID) {
		return nil, httpx.NewAppError(http.StatusTooManyRequests, domain.ErrorCodeRateLimited, "Message rate limit exceeded", nil)
	}

	safetyDecision := ValidateChatMessage(text)
	if !safetyDecision.Allowed {
		_ = s.repo.CreateChatViolation(ctx, repository.CreateChatViolationInput{
			ConversationID: conversationID,
			SenderID:       user.UserID,
			SenderRole:     user.Role,
			RuleID:         safetyDecision.RuleID,
			Score:          safetyDecision.Score,
			Signals:        toViolationSignals(safetyDecision.Signals),
			TextPreview:    safetyDecision.MaskedText,
			CreatedAt:      time.Now().UTC(),
		})
		return nil, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeChatMessageBlocked, safetyDecision.Reason, map[string]any{
			"ruleId": safetyDecision.RuleID,
			"score":  safetyDecision.Score,
		})
	}

	recipientID := ""
	switch user.UserID {
	case conversation.BuyerID:
		recipientID = conversation.SellerID
	case conversation.SellerID:
		recipientID = conversation.BuyerID
	}

	if clientMessageID != "" {
		existing, err := s.repo.FindMessageByClientID(ctx, conversationID, clientMessageID)
		if err != nil {
			return nil, err
		}
		if existing != nil {
			return messageToResponse(*existing), nil
		}
	}

	now := time.Now().UTC()
	payload := map[string]any{
		"conversationId": conversationID,
		"buyerId":        conversation.BuyerID,
		"buyerCode":      formatUserCode(conversation.BuyerID, domain.RoleCustomer),
		"sellerId":       conversation.SellerID,
		"sellerCode":     formatUserCode(conversation.SellerID, domain.RoleSeller),
		"senderId":       user.UserID,
		"senderCode":     formatUserCode(user.UserID, user.Role),
		"senderRole":     user.Role,
		"recipientId":    recipientID,
		"recipientCode":  formatUserCode(recipientID, oppositeRole(user.Role)),
		"metadata":       buildEventMetadata(ctx, user, now),
		"message": map[string]any{
			"id":              "",
			"conversationId":  conversationID,
			"seq":             0,
			"clientMessageId": clientMessageID,
			"senderId":        user.UserID,
			"senderCode":      formatUserCode(user.UserID, user.Role),
			"senderRole":      user.Role,
			"kind":            domain.MessageKindText,
			"text":            text,
			"sentAt":          now.Format(time.RFC3339Nano),
		},
	}
	txResult, err := s.repo.CreateMessageAndOutbox(ctx, repository.SendMessageTxInput{
		ConversationID:  conversationID,
		SenderID:        user.UserID,
		SenderRole:      user.Role,
		ClientMessageID: clientMessageID,
		Text:            text,
		SentAt:          now,
		EventType:       domain.EventMessageCreated,
		EventPayload:    payload,
	})
	if err != nil {
		if err.Error() == "conversation_not_active" {
			return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeConflict, "Conversation is not active", nil)
		}
		return nil, err
	}
	message := txResult.Message

	if txResult.Created {
		_ = s.redis.PublishJSON(ctx, redisConversationChannel(conversationID), map[string]any{
			"type":           domain.EventMessageCreated,
			"conversationId": conversationID,
			"message":        messageToResponse(message),
		})
	}

	return messageToResponse(message), nil
}

func (s *ChatService) MarkRead(ctx context.Context, user domain.UserContext, conversationID string, _ MarkReadRequest) (map[string]any, error) {
	conversation, err := s.repo.FindConversationByID(ctx, conversationID)
	if err != nil {
		return nil, err
	}
	if conversation == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Conversation not found", nil)
	}
	if !hasConversationAccess(user, *conversation) {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}

	now := time.Now().UTC()
	modifiedCount, err := s.repo.MarkMessagesRead(ctx, conversationID, user.Role, now)
	if err != nil {
		return nil, err
	}
	if err := s.repo.MarkConversationRead(ctx, conversationID, user.Role, now); err != nil {
		return nil, err
	}

	payload := map[string]any{
		"conversationId": conversationID,
		"buyerId":        conversation.BuyerID,
		"buyerCode":      formatUserCode(conversation.BuyerID, domain.RoleCustomer),
		"sellerId":       conversation.SellerID,
		"sellerCode":     formatUserCode(conversation.SellerID, domain.RoleSeller),
		"readerId":       user.UserID,
		"readerCode":     formatUserCode(user.UserID, user.Role),
		"readerRole":     user.Role,
		"readAt":         now.Format(time.RFC3339Nano),
		"modifiedCount":  modifiedCount,
		"metadata":       buildEventMetadata(ctx, user, now),
	}
	if err := s.repo.InsertOutboxEvent(ctx, conversationID, domain.EventMessageRead, payload); err != nil {
		return nil, err
	}

	_ = s.redis.PublishJSON(ctx, redisConversationChannel(conversationID), map[string]any{
		"type":           domain.EventMessageRead,
		"conversationId": conversationID,
		"readerId":       user.UserID,
		"readerCode":     formatUserCode(user.UserID, user.Role),
		"readerRole":     user.Role,
		"readAt":         now.Format(time.RFC3339Nano),
	})

	return map[string]any{
		"conversationId": conversationID,
		"readerId":       user.UserID,
		"readerCode":     formatUserCode(user.UserID, user.Role),
		"readerRole":     user.Role,
		"readAt":         now.Format(time.RFC3339Nano),
		"modifiedCount":  modifiedCount,
	}, nil
}

func (s *ChatService) AssertConversationAccess(ctx context.Context, user domain.UserContext, conversationID string) (*domain.Conversation, error) {
	conversation, err := s.repo.FindConversationByID(ctx, conversationID)
	if err != nil {
		return nil, err
	}
	if conversation == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Conversation not found", nil)
	}
	if !hasConversationAccess(user, *conversation) {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}
	return conversation, nil
}

func redisConversationChannel(conversationID string) string {
	return "chat:conversation:" + strings.TrimSpace(conversationID)
}

func resolveParticipantIDs(user domain.UserContext, req CreateConversationRequest) (string, string, error) {
	buyerFromReq := valueOrEmpty(req.BuyerID)
	sellerFromReq := valueOrEmpty(req.SellerID)

	switch user.Role {
	case domain.RoleCustomer, domain.RoleBuyer:
		if sellerFromReq == "" {
			return "", "", validationError("sellerId", "is required")
		}
		return user.UserID, sellerFromReq, nil
	case domain.RoleSeller:
		if buyerFromReq == "" {
			return "", "", validationError("buyerId", "is required")
		}
		return buyerFromReq, user.UserID, nil
	case domain.RoleAdmin, domain.RoleSupport, domain.RoleSuperAdmin:
		if buyerFromReq == "" || sellerFromReq == "" {
			return "", "", validationError("participants", "buyerId and sellerId are required")
		}
		return buyerFromReq, sellerFromReq, nil
	default:
		return "", "", httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Role is not allowed to create conversation", nil)
	}
}

func hasConversationAccess(user domain.UserContext, conversation domain.Conversation) bool {
	switch user.Role {
	case domain.RoleCustomer, domain.RoleBuyer:
		return conversation.BuyerID == user.UserID
	case domain.RoleSeller:
		return conversation.SellerID == user.UserID
	case domain.RoleAdmin, domain.RoleSupport, domain.RoleSuperAdmin:
		return true
	default:
		return false
	}
}

func canReviewChatViolations(role domain.Role) bool {
	switch role {
	case domain.RoleModerator, domain.RoleAdmin, domain.RoleSupport, domain.RoleSuperAdmin:
		return true
	default:
		return false
	}
}

func conversationToResponse(conversation domain.Conversation) map[string]any {
	resp := map[string]any{
		"id":         conversation.ID,
		"type":       conversation.Type,
		"buyerId":    conversation.BuyerID,
		"buyerCode":  formatUserCode(conversation.BuyerID, domain.RoleCustomer),
		"sellerId":   conversation.SellerID,
		"sellerCode": formatUserCode(conversation.SellerID, domain.RoleSeller),
		"context": map[string]any{
			"productId":  conversation.Context.ProductID,
			"orderId":    conversation.Context.OrderID,
			"shopId":     conversation.Context.ShopID,
			"buyerName":  conversation.Context.BuyerName,
			"sellerName": conversation.Context.SellerName,
		},
		"unread": map[string]any{
			"buyer":  conversation.Unread.Buyer,
			"seller": conversation.Unread.Seller,
		},
		"status":    conversation.Status,
		"createdAt": conversation.CreatedAt.UTC().Format(time.RFC3339Nano),
		"updatedAt": conversation.UpdatedAt.UTC().Format(time.RFC3339Nano),
	}

	if conversation.LastMessage != nil {
		resp["lastMessage"] = map[string]any{
			"messageId":   conversation.LastMessage.MessageID,
			"senderId":    conversation.LastMessage.SenderID,
			"textPreview": conversation.LastMessage.TextPreview,
			"sentAt":      conversation.LastMessage.SentAt.UTC().Format(time.RFC3339Nano),
		}
	}
	return resp
}

func messageToResponse(message domain.Message) map[string]any {
	resp := map[string]any{
		"id":              message.ID,
		"conversationId":  message.ConversationID,
		"seq":             message.Seq,
		"clientMessageId": message.ClientMessageID,
		"senderId":        message.SenderID,
		"senderCode":      formatUserCode(message.SenderID, message.SenderRole),
		"senderRole":      message.SenderRole,
		"kind":            message.Kind,
		"text":            message.Text,
		"sentAt":          message.SentAt.UTC().Format(time.RFC3339Nano),
		"editedAt":        nil,
		"deletedAt":       nil,
		"readByBuyerAt":   nil,
		"readBySellerAt":  nil,
	}
	if message.EditedAt != nil {
		resp["editedAt"] = message.EditedAt.UTC().Format(time.RFC3339Nano)
	}
	if message.DeletedAt != nil {
		resp["deletedAt"] = message.DeletedAt.UTC().Format(time.RFC3339Nano)
	}
	if message.ReadByBuyerAt != nil {
		resp["readByBuyerAt"] = message.ReadByBuyerAt.UTC().Format(time.RFC3339Nano)
	}
	if message.ReadBySellerAt != nil {
		resp["readBySellerAt"] = message.ReadBySellerAt.UTC().Format(time.RFC3339Nano)
	}
	return resp
}

func toViolationSignals(signals []ChatSafetySignal) []repository.ChatViolationSignalInput {
	items := make([]repository.ChatViolationSignalInput, 0, len(signals))
	for _, signal := range signals {
		items = append(items, repository.ChatViolationSignalInput{
			RuleID:       signal.RuleID,
			Score:        signal.Score,
			EvidenceType: signal.EvidenceType,
		})
	}
	return items
}

func buildConversationKey(buyerID, sellerID string) string {
	return strings.Join([]string{strings.TrimSpace(buyerID), strings.TrimSpace(sellerID)}, "|")
}

func normalizeOptional(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func valueOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func totalPages(totalItems int64, pageSize int) int64 {
	if totalItems <= 0 || pageSize <= 0 {
		return 0
	}
	pages := totalItems / int64(pageSize)
	if totalItems%int64(pageSize) != 0 {
		pages++
	}
	return pages
}

func validationError(field, message string) error {
	return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{field: message})
}

func buildEventMetadata(ctx context.Context, user domain.UserContext, occurredAt time.Time) map[string]any {
	return map[string]any{
		"requestId":  middleware.RequestIDFromContext(ctx),
		"occurredAt": occurredAt.UTC().Format(time.RFC3339Nano),
		"actorId":    user.UserID,
		"actorCode":  formatUserCode(user.UserID, user.Role),
		"actorRole":  user.Role,
	}
}

func oppositeRole(role domain.Role) domain.Role {
	switch role {
	case domain.RoleSeller:
		return domain.RoleCustomer
	default:
		return domain.RoleSeller
	}
}

func formatUserCode(userID string, role domain.Role) string {
	switch role {
	case domain.RoleSeller:
		return formatCode(userID, "SEL")
	default:
		return formatCode(userID, "CUS")
	}
}

func formatCode(raw, prefix string) string {
	source := strings.TrimSpace(raw)
	if source == "" {
		return prefix + "0000000"
	}

	normalized := strings.ToUpper(source)
	normalized = strings.Map(func(r rune) rune {
		switch {
		case r >= 'A' && r <= 'Z':
			return r
		case r >= '0' && r <= '9':
			return r
		default:
			return -1
		}
	}, normalized)

	digits := make([]rune, 0, len(normalized))
	for _, r := range normalized {
		if r >= '0' && r <= '9' {
			digits = append(digits, r)
		}
	}
	if len(digits) >= 7 {
		return prefix + string(digits[len(digits)-7:])
	}
	return prefix + leftPadInt(stableHash(source), 7)
}

func stableHash(value string) int {
	const modulo = 10_000_000
	hash := 0
	for _, r := range value {
		hash = (hash*31 + int(r)) % modulo
	}
	return hash
}

func leftPadInt(value int, width int) string {
	raw := strconv.Itoa(value)
	if len(raw) >= width {
		return raw
	}
	return strings.Repeat("0", width-len(raw)) + raw
}
