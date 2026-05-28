package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"live-service/internal/auth"
	"live-service/internal/domain"
	"live-service/internal/httpx"
	"live-service/internal/service"
	livews "live-service/internal/websocket"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const liveViewerPresenceTTL = 90 * time.Second

type WSHandler struct {
	liveService    *service.LiveService
	redis          *service.RedisService
	hub            *livews.Hub
	allowedOrigins map[string]struct{}
}

func NewWSHandler(liveService *service.LiveService, redis *service.RedisService, hub *livews.Hub, wsAllowedOrigins []string) *WSHandler {
	allowed := make(map[string]struct{}, len(wsAllowedOrigins))
	for _, origin := range wsAllowedOrigins {
		normalized := strings.TrimSpace(origin)
		if normalized == "" {
			continue
		}
		allowed[strings.ToLower(normalized)] = struct{}{}
	}
	return &WSHandler{liveService: liveService, redis: redis, hub: hub, allowedOrigins: allowed}
}

func (h *WSHandler) WebSocket(w http.ResponseWriter, r *http.Request) {
	user, authenticated := auth.UserFromContext(r.Context())
	if !authenticated {
		user = domain.UserContext{
			UserID: "guest-" + uuid.NewString(),
			Role:   domain.RoleBuyer,
		}
	}

	sessionID := strings.TrimSpace(r.URL.Query().Get("sessionId"))
	if sessionID == "" {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{"sessionId": "is required"})
		return
	}
	if _, err := h.liveService.GetSession(r.Context(), &user, sessionID); err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		Subprotocols:    []string{"live.v1"},
		CheckOrigin: func(req *http.Request) bool {
			return h.isAllowedOrigin(req)
		},
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	client := &livews.Client{SessionID: sessionID, Send: make(chan any, 32)}
	localCount := h.hub.Register(client)
	viewerPresenceID := uuid.NewString()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	viewerCount := int64(localCount)
	if h.redis != nil && h.redis.Enabled() {
		if count, err := h.redis.TrackViewerPresence(ctx, sessionID, viewerPresenceID, liveViewerPresenceTTL); err == nil && count > 0 {
			viewerCount = count
		}
	}
	h.liveService.TrackViewerJoined(ctx, user, sessionID, viewerCount)
	_ = h.broadcastRealtime(ctx, sessionID, map[string]any{"type": "live:viewer:count", "count": viewerCount})
	defer func() {
		count := int64(h.hub.Unregister(client))
		if h.redis != nil && h.redis.Enabled() {
			if redisCount, err := h.redis.RemoveViewerPresence(context.Background(), sessionID, viewerPresenceID); err == nil {
				count = redisCount
			}
		}
		h.liveService.TrackViewerLeft(context.Background(), user, sessionID, count)
		_ = h.broadcastRealtime(context.Background(), sessionID, map[string]any{"type": "live:viewer:count", "count": count})
	}()

	var writeMu sync.Mutex
	writeJSON := func(payload any) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		conn.SetWriteDeadline(time.Now().Add(15 * time.Second))
		return conn.WriteJSON(payload)
	}

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case payload, ok := <-client.Send:
				if !ok {
					cancel()
					return
				}
				if err := writeJSON(payload); err != nil {
					cancel()
					return
				}
			}
		}
	}()

	if h.redis != nil && h.redis.Enabled() {
		pubsub, err := h.redis.Subscribe(ctx, service.LiveSessionChannel(sessionID))
		if err == nil && pubsub != nil {
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
	}

	conn.SetReadLimit(1 << 20)
	_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		if h.redis != nil && h.redis.Enabled() {
			_ = h.redis.RefreshViewerPresence(context.Background(), sessionID, viewerPresenceID, liveViewerPresenceTTL)
		}
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
				if h.redis != nil && h.redis.Enabled() {
					_ = h.redis.RefreshViewerPresence(context.Background(), sessionID, viewerPresenceID, liveViewerPresenceTTL)
				}
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
		case "live:message:create":
			if !authenticated {
				_ = writeJSON(map[string]any{"type": "error", "code": domain.ErrorCodeUnauthorized, "message": "Login is required to chat"})
				continue
			}
			result, err := h.liveService.SendMessage(ctx, user, sessionID, service.SendMessageRequest{
				Text:            incoming.Text,
				ClientMessageID: strings.TrimSpace(incoming.ClientMessageID),
				Language:        strings.TrimSpace(incoming.Language),
			})
			if err != nil {
				_ = writeJSON(webSocketErrorPayload(err))
				continue
			}
			_ = writeJSON(map[string]any{"type": "ack", "action": "live:message:create", "message": result})
		case "live:webrtc:broadcaster-ready", "live:webrtc:viewer-ready", "live:webrtc:offer", "live:webrtc:answer", "live:webrtc:ice-candidate":
			_ = h.broadcastRealtime(ctx, sessionID, map[string]any{
				"type":           strings.ToLower(strings.TrimSpace(incoming.Type)),
				"fromClientId":   strings.TrimSpace(incoming.ClientID),
				"targetClientId": strings.TrimSpace(incoming.TargetClientID),
				"senderId":       user.UserID,
				"senderRole":     user.Role,
				"negotiationId":  strings.TrimSpace(incoming.NegotiationID),
				"sdp":            incoming.SDP,
				"candidate":      incoming.Candidate,
			})
		case "live:join":
			_ = writeJSON(map[string]any{"type": "ack", "action": "live:join", "sessionId": sessionID})
		case "live:leave":
			return
		default:
			_ = writeJSON(map[string]any{"type": "error", "message": "unsupported event type"})
		}
	}
}

func (h *WSHandler) broadcastRealtime(ctx context.Context, sessionID string, payload map[string]any) error {
	if h.redis != nil && h.redis.Enabled() {
		if eventType, ok := payload["type"].(string); ok && strings.TrimSpace(eventType) != "" {
			if err := h.redis.PublishJSON(ctx, service.LiveSessionChannel(sessionID), service.LivePubSubEnvelope(eventType, sessionID, payload)); err == nil {
				return nil
			}
		}
	}
	return h.hub.Broadcast(ctx, sessionID, payload)
}

func webSocketErrorPayload(err error) map[string]any {
	payload := map[string]any{
		"type":    "error",
		"message": err.Error(),
	}

	var appErr *httpx.AppError
	if errors.As(err, &appErr) {
		payload["code"] = appErr.Code
		payload["message"] = appErr.Message
		if appErr.Details != nil {
			payload["details"] = appErr.Details
		}
	}

	return payload
}

func (h *WSHandler) isAllowedOrigin(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" || strings.EqualFold(origin, "null") {
		// Native WebSocket clients may omit Origin or send the literal null origin.
		return true
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
	ClientID        string `json:"clientId"`
	TargetClientID  string `json:"targetClientId"`
	NegotiationID   string `json:"negotiationId"`
	Text            string `json:"text"`
	ClientMessageID string `json:"clientMessageId"`
	Language        string `json:"language"`
	SDP             any    `json:"sdp"`
	Candidate       any    `json:"candidate"`
}
