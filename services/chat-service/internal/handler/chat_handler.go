package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"chat-service/internal/auth"
	"chat-service/internal/domain"
	"chat-service/internal/httpx"
	"chat-service/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

type ChatHandler struct {
	chatService    *service.ChatService
	redis          *service.RedisService
	allowedOrigins map[string]struct{}
}

func NewChatHandler(chatService *service.ChatService, redis *service.RedisService, wsAllowedOrigins []string) *ChatHandler {
	allowed := make(map[string]struct{}, len(wsAllowedOrigins))
	for _, origin := range wsAllowedOrigins {
		normalized := strings.TrimSpace(origin)
		if normalized == "" {
			continue
		}
		allowed[strings.ToLower(normalized)] = struct{}{}
	}

	return &ChatHandler{chatService: chatService, redis: redis, allowedOrigins: allowed}
}

func (h *ChatHandler) CreateConversation(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	var req service.CreateConversationRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{"body": err.Error()})
		return
	}

	result, err := h.chatService.CreateConversation(r.Context(), user, req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusCreated, result)
}

func (h *ChatHandler) ListConversations(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	query, err := parseListConversationQuery(r)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeValidationFailed)
		return
	}

	result, err := h.chatService.ListConversations(r.Context(), user, query)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *ChatHandler) ListMessages(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	query, err := parseListMessagesQuery(r)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeValidationFailed)
		return
	}

	result, err := h.chatService.ListMessages(r.Context(), user, chi.URLParam(r, "id"), query)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *ChatHandler) SendMessage(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	var req service.SendMessageRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{"body": err.Error()})
		return
	}

	result, err := h.chatService.SendMessage(r.Context(), user, chi.URLParam(r, "id"), req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusCreated, result)
}

func (h *ChatHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	var req service.MarkReadRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{"body": err.Error()})
		return
	}

	result, err := h.chatService.MarkRead(r.Context(), user, chi.URLParam(r, "id"), req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *ChatHandler) WebSocket(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	conversationID := strings.TrimSpace(r.URL.Query().Get("conversationId"))
	if conversationID == "" {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{"conversationId": "is required"})
		return
	}

	if _, err := h.chatService.AssertConversationAccess(r.Context(), user, conversationID); err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		Subprotocols:    []string{"chat.v1"},
		CheckOrigin: func(req *http.Request) bool {
			return h.isAllowedOrigin(req)
		},
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	var writeMu sync.Mutex
	writeJSON := func(payload any) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		conn.SetWriteDeadline(time.Now().Add(15 * time.Second))
		return conn.WriteJSON(payload)
	}

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	var pubsub *redis.PubSub
	if h.redis.Enabled() {
		pubsub, err = h.redis.Subscribe(ctx, "chat:conversation:"+conversationID)
		if err != nil {
			_ = writeJSON(map[string]any{"type": "error", "message": "subscribe failed"})
			return
		}
		defer pubsub.Close()

		go func() {
			ch := pubsub.Channel()
			for {
				select {
				case <-ctx.Done():
					return
				case msg, ok := <-ch:
					if !ok {
						return
					}
					var payload map[string]any
					if err := json.Unmarshal([]byte(msg.Payload), &payload); err != nil {
						continue
					}
					if err := writeJSON(payload); err != nil {
						cancel()
						return
					}
				}
			}
		}()
	}

	conn.SetReadLimit(1 << 20)
	_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				writeMu.Lock()
				conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				err := conn.WriteMessage(websocket.PingMessage, []byte("ping"))
				writeMu.Unlock()
				if err != nil {
					cancel()
					return
				}
			}
		}
	}()

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		var incoming wsInboundMessage
		if err := conn.ReadJSON(&incoming); err != nil {
			cancel()
			return
		}

		switch strings.ToLower(strings.TrimSpace(incoming.Type)) {
		case "send_message":
			result, err := h.chatService.SendMessage(ctx, user, conversationID, service.SendMessageRequest{
				Text:            incoming.Text,
				ClientMessageID: strings.TrimSpace(incoming.ClientMessageID),
			})
			if err != nil {
				_ = writeJSON(map[string]any{"type": "error", "message": err.Error()})
				continue
			}
			_ = writeJSON(map[string]any{"type": "ack", "action": "send_message", "message": result})
		case "mark_read":
			result, err := h.chatService.MarkRead(ctx, user, conversationID, service.MarkReadRequest{})
			if err != nil {
				_ = writeJSON(map[string]any{"type": "error", "message": err.Error()})
				continue
			}
			_ = writeJSON(map[string]any{"type": "ack", "action": "mark_read", "result": result})
		default:
			_ = writeJSON(map[string]any{"type": "error", "message": "unsupported event type"})
		}
	}
}

func (h *ChatHandler) isAllowedOrigin(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return false
	}

	parsed, err := url.Parse(origin)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return false
	}

	normalized := strings.ToLower(parsed.Scheme + "://" + parsed.Host)
	_, ok := h.allowedOrigins[normalized]
	return ok
}

type wsInboundMessage struct {
	Type            string `json:"type"`
	Text            string `json:"text"`
	ClientMessageID string `json:"clientMessageId"`
}

func parseListConversationQuery(r *http.Request) (service.ListConversationsRequest, error) {
	q := r.URL.Query()

	page := 1
	if raw := strings.TrimSpace(q.Get("page")); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 1 {
			return service.ListConversationsRequest{}, validationError("page", "must be an integer >= 1")
		}
		page = v
	}

	pageSize := 20
	if raw := strings.TrimSpace(q.Get("pageSize")); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 1 || v > 100 {
			return service.ListConversationsRequest{}, validationError("pageSize", "must be an integer between 1 and 100")
		}
		pageSize = v
	}

	return service.ListConversationsRequest{Page: page, PageSize: pageSize}, nil
}

func parseListMessagesQuery(r *http.Request) (service.ListMessagesRequest, error) {
	q := r.URL.Query()

	limit := 30
	if raw := strings.TrimSpace(q.Get("limit")); raw != "" {
		v, err := strconv.Atoi(raw)
		if err != nil || v < 1 || v > 200 {
			return service.ListMessagesRequest{}, validationError("limit", "must be an integer between 1 and 200")
		}
		limit = v
	}

	beforeSeq := int64(0)
	if raw := strings.TrimSpace(q.Get("beforeSeq")); raw != "" {
		v, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || v < 1 {
			return service.ListMessagesRequest{}, validationError("beforeSeq", "must be an integer >= 1")
		}
		beforeSeq = v
	}

	return service.ListMessagesRequest{Limit: limit, BeforeSeq: beforeSeq}, nil
}

func validationError(field, msg string) error {
	return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{field: msg})
}
