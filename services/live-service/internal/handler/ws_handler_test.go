package handler

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"live-service/internal/auth"
	"live-service/internal/domain"
	"live-service/internal/repository"
	"live-service/internal/service"
	livews "live-service/internal/websocket"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"
)

func TestWebSocketOriginAllowsNativeClientAndRejectsUnknownBrowser(t *testing.T) {
	handler := NewWSHandler(nil, nil, livews.NewHub(), []string{"https://buyer.dt-commerce.site", "http://localhost"})

	nativeRequest := httptest.NewRequest(http.MethodGet, "https://api.dt-commerce.site/api/v1/live/ws", nil)
	if !handler.isAllowedOrigin(nativeRequest) {
		t.Fatal("expected native websocket request without browser Origin to be accepted")
	}

	androidNativeRequest := httptest.NewRequest(http.MethodGet, "https://api.dt-commerce.site/api/v1/live/ws", nil)
	androidNativeRequest.Header.Set("Origin", "http://localhost")
	if !handler.isAllowedOrigin(androidNativeRequest) {
		t.Fatal("expected Android native WebSocket localhost Origin to be accepted")
	}

	browserRequest := httptest.NewRequest(http.MethodGet, "https://api.dt-commerce.site/api/v1/live/ws", nil)
	browserRequest.Header.Set("Origin", "https://attacker.example")
	if handler.isAllowedOrigin(browserRequest) {
		t.Fatal("expected unknown browser origin to be rejected")
	}
}

func TestWebSocketSendsLiveMessageAck(t *testing.T) {
	const secret = "dev-shared-jwt-access-secret-min-32-chars"

	repo := newHandlerMemoryRepo()
	session := domain.LiveSession{
		SessionID:       "live-1",
		SellerID:        "seller-1",
		Title:           "Live demo",
		PlaybackURL:     "https://example.com/live.m3u8",
		SourceType:      domain.LiveSourceTypeExternalURL,
		Status:          domain.LiveSessionStatusLive,
		DefaultLanguage: "en",
		CreatedAt:       time.Now().UTC(),
		UpdatedAt:       time.Now().UTC(),
	}
	repo.sessions[session.SessionID] = session

	hub := livews.NewHub()
	liveService := service.NewLiveService(repo, handlerFakeProductVerifier{}, &handlerFakePublisher{}, hub, nil)
	wsHandler := NewWSHandler(liveService, nil, hub, []string{"http://example.com"})

	server := httptest.NewServer(auth.RequireJWT(secret, nil, zap.NewNop())(http.HandlerFunc(wsHandler.WebSocket)))
	defer server.Close()

	token := signedTestToken(t, secret, "buyer-1", domain.RoleBuyer)
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "?sessionId=live-1"
	header := http.Header{}
	header.Set("Origin", "http://example.com")
	header.Set("Sec-WebSocket-Protocol", "live.v1, access-token."+token)

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatalf("Dial returned error: %v", err)
	}
	defer conn.Close()

	if err := conn.WriteJSON(map[string]any{
		"type":            "live:message:create",
		"text":            "hello",
		"clientMessageId": "client-1",
	}); err != nil {
		t.Fatalf("WriteJSON returned error: %v", err)
	}

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		var payload map[string]any
		if err := conn.ReadJSON(&payload); err != nil {
			t.Fatalf("ReadJSON returned error: %v", err)
		}
		if payload["type"] == "ack" && payload["action"] == "live:message:create" {
			return
		}
	}
	t.Fatal("expected live message ack")
}

func TestWebSocketRelaysWebRTCSignal(t *testing.T) {
	const secret = "dev-shared-jwt-access-secret-min-32-chars"

	repo := newHandlerMemoryRepo()
	session := domain.LiveSession{
		SessionID:       "live-1",
		SellerID:        "seller-1",
		Title:           "Live demo",
		PlaybackURL:     "https://example.com/live.m3u8",
		SourceType:      domain.LiveSourceTypeExternalURL,
		Status:          domain.LiveSessionStatusLive,
		DefaultLanguage: "en",
		CreatedAt:       time.Now().UTC(),
		UpdatedAt:       time.Now().UTC(),
	}
	repo.sessions[session.SessionID] = session

	hub := livews.NewHub()
	liveService := service.NewLiveService(repo, handlerFakeProductVerifier{}, &handlerFakePublisher{}, hub, nil)
	wsHandler := NewWSHandler(liveService, nil, hub, []string{"http://example.com"})

	server := httptest.NewServer(auth.RequireJWT(secret, nil, zap.NewNop())(http.HandlerFunc(wsHandler.WebSocket)))
	defer server.Close()

	sellerConn := dialTestLiveWS(t, server.URL, secret, "seller-1", domain.RoleSeller)
	defer sellerConn.Close()
	buyerConn := dialTestLiveWS(t, server.URL, secret, "buyer-1", domain.RoleBuyer)
	defer buyerConn.Close()

	if err := sellerConn.WriteJSON(map[string]any{
		"type":           "live:webrtc:offer",
		"clientId":       "seller-client",
		"targetClientId": "buyer-client",
		"negotiationId":  "negotiation-1",
		"sdp": map[string]any{
			"type": "offer",
			"sdp":  "v=0",
		},
	}); err != nil {
		t.Fatalf("WriteJSON returned error: %v", err)
	}

	waitForWSMessage(t, buyerConn, "live:webrtc:offer", "seller-client", "buyer-client", "negotiation-1")

	if err := buyerConn.WriteJSON(map[string]any{
		"type":           "live:webrtc:answer",
		"clientId":       "buyer-client",
		"targetClientId": "seller-client",
		"negotiationId":  "negotiation-1",
		"sdp": map[string]any{
			"type": "answer",
			"sdp":  "v=0",
		},
	}); err != nil {
		t.Fatalf("WriteJSON returned error: %v", err)
	}
	waitForWSMessage(t, sellerConn, "live:webrtc:answer", "buyer-client", "seller-client", "negotiation-1")

	if err := sellerConn.WriteJSON(map[string]any{
		"type":           "live:webrtc:ice-candidate",
		"clientId":       "seller-client",
		"targetClientId": "buyer-client",
		"negotiationId":  "negotiation-1",
		"candidate": map[string]any{
			"candidate":     "candidate:1 1 udp 1 127.0.0.1 9 typ host",
			"sdpMid":        "0",
			"sdpMLineIndex": 0,
		},
	}); err != nil {
		t.Fatalf("WriteJSON returned error: %v", err)
	}
	waitForWSMessage(t, buyerConn, "live:webrtc:ice-candidate", "seller-client", "buyer-client", "negotiation-1")
}

func TestWebSocketAllowsAnonymousViewerWebRTCSignal(t *testing.T) {
	const secret = "dev-shared-jwt-access-secret-min-32-chars"

	repo := newHandlerMemoryRepo()
	session := domain.LiveSession{
		SessionID:       "live-1",
		SellerID:        "seller-1",
		Title:           "Live demo",
		PlaybackURL:     "https://example.com/live.m3u8",
		SourceType:      domain.LiveSourceTypeExternalURL,
		Status:          domain.LiveSessionStatusLive,
		DefaultLanguage: "en",
		CreatedAt:       time.Now().UTC(),
		UpdatedAt:       time.Now().UTC(),
	}
	repo.sessions[session.SessionID] = session

	hub := livews.NewHub()
	liveService := service.NewLiveService(repo, handlerFakeProductVerifier{}, &handlerFakePublisher{}, hub, nil)
	wsHandler := NewWSHandler(liveService, nil, hub, []string{"http://example.com"})

	server := httptest.NewServer(auth.OptionalJWT(secret, nil, zap.NewNop())(http.HandlerFunc(wsHandler.WebSocket)))
	defer server.Close()

	sellerConn := dialTestLiveWS(t, server.URL, secret, "seller-1", domain.RoleSeller)
	defer sellerConn.Close()
	anonymousConn := dialTestLiveWSAnonymous(t, server.URL)
	defer anonymousConn.Close()

	if err := anonymousConn.WriteJSON(map[string]any{
		"type":     "live:webrtc:viewer-ready",
		"clientId": "guest-client",
	}); err != nil {
		t.Fatalf("WriteJSON returned error: %v", err)
	}
	waitForWSMessage(t, sellerConn, "live:webrtc:viewer-ready", "guest-client", "", "")

	if err := sellerConn.WriteJSON(map[string]any{
		"type":           "live:webrtc:offer",
		"clientId":       "seller-client",
		"targetClientId": "guest-client",
		"negotiationId":  "negotiation-guest",
		"sdp": map[string]any{
			"type": "offer",
			"sdp":  "v=0",
		},
	}); err != nil {
		t.Fatalf("WriteJSON returned error: %v", err)
	}
	waitForWSMessage(t, anonymousConn, "live:webrtc:offer", "seller-client", "guest-client", "negotiation-guest")
}

func waitForWSMessage(t *testing.T, conn *websocket.Conn, eventType, fromClientID, targetClientID, negotiationID string) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		var payload map[string]any
		if err := conn.ReadJSON(&payload); err != nil {
			t.Fatalf("ReadJSON returned error: %v", err)
		}
		if payload["type"] == eventType &&
			payload["fromClientId"] == fromClientID &&
			payload["targetClientId"] == targetClientID &&
			payload["negotiationId"] == negotiationID {
			return
		}
	}
	t.Fatalf("expected %s relay from %s", eventType, fromClientID)
}

func dialTestLiveWSAnonymous(t *testing.T, serverURL string) *websocket.Conn {
	t.Helper()
	wsURL := "ws" + strings.TrimPrefix(serverURL, "http") + "?sessionId=live-1"
	header := http.Header{}
	header.Set("Origin", "http://example.com")
	header.Set("Sec-WebSocket-Protocol", "live.v1")

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatalf("Dial returned error: %v", err)
	}
	return conn
}

func dialTestLiveWS(t *testing.T, serverURL, secret, userID string, role domain.Role) *websocket.Conn {
	t.Helper()
	token := signedTestToken(t, secret, userID, role)
	wsURL := "ws" + strings.TrimPrefix(serverURL, "http") + "?sessionId=live-1"
	header := http.Header{}
	header.Set("Origin", "http://example.com")
	header.Set("Sec-WebSocket-Protocol", "live.v1, access-token."+token)

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatalf("Dial returned error: %v", err)
	}
	return conn
}

func signedTestToken(t *testing.T, secret, userID string, role domain.Role) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":          userID,
		"email":        userID + "@example.com",
		"role":         string(role),
		"sessionId":    "session-1",
		"jti":          "jti-1",
		"tokenVersion": float64(1),
		"exp":          time.Now().Add(time.Hour).Unix(),
	})
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("SignedString returned error: %v", err)
	}
	return signed
}

type handlerMemoryRepo struct {
	mu       sync.Mutex
	sessions map[string]domain.LiveSession
	products map[string]domain.LiveProduct
	messages map[string]domain.LiveMessage
}

func newHandlerMemoryRepo() *handlerMemoryRepo {
	return &handlerMemoryRepo{
		sessions: map[string]domain.LiveSession{},
		products: map[string]domain.LiveProduct{},
		messages: map[string]domain.LiveMessage{},
	}
}

func (r *handlerMemoryRepo) Ping(context.Context) error          { return nil }
func (r *handlerMemoryRepo) EnsureIndexes(context.Context) error { return nil }
func (r *handlerMemoryRepo) CreateSession(_ context.Context, session domain.LiveSession) (domain.LiveSession, error) {
	r.sessions[session.SessionID] = session
	return session, nil
}
func (r *handlerMemoryRepo) FindSessionByID(_ context.Context, sessionID string) (*domain.LiveSession, error) {
	session, ok := r.sessions[sessionID]
	if !ok {
		return nil, nil
	}
	return &session, nil
}
func (r *handlerMemoryRepo) ListSessions(context.Context, repository.ListSessionsFilter) ([]domain.LiveSession, int64, error) {
	return nil, 0, nil
}
func (r *handlerMemoryRepo) UpdateSession(_ context.Context, session domain.LiveSession) error {
	r.sessions[session.SessionID] = session
	return nil
}
func (r *handlerMemoryRepo) UpsertPinnedProduct(_ context.Context, product domain.LiveProduct) (domain.LiveProduct, error) {
	return product, nil
}
func (r *handlerMemoryRepo) UnpinProduct(context.Context, string, string, time.Time) (*domain.LiveProduct, error) {
	return nil, nil
}
func (r *handlerMemoryRepo) ListPinnedProducts(context.Context, string) ([]domain.LiveProduct, error) {
	return nil, nil
}
func (r *handlerMemoryRepo) FindMessageByClientID(_ context.Context, sessionID, clientMessageID string) (*domain.LiveMessage, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, message := range r.messages {
		if message.SessionID == sessionID && message.ClientMessageID == clientMessageID {
			return &message, nil
		}
	}
	return nil, nil
}
func (r *handlerMemoryRepo) CreateMessage(_ context.Context, message domain.LiveMessage) (domain.LiveMessage, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	message.ID = "id-" + message.MessageID
	r.messages[message.MessageID] = message
	return message, nil
}
func (r *handlerMemoryRepo) ListMessages(_ context.Context, filter repository.ListMessagesFilter) ([]domain.LiveMessage, int64, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	items := make([]domain.LiveMessage, 0)
	for _, message := range r.messages {
		if message.SessionID == filter.SessionID && message.Status == domain.LiveMessageStatusVisible {
			items = append(items, message)
		}
	}
	return items, int64(len(items)), nil
}
func (r *handlerMemoryRepo) IncrementMessageCount(_ context.Context, sessionID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	session := r.sessions[sessionID]
	session.MetricsSnapshot.MessageCount++
	r.sessions[sessionID] = session
	return nil
}

type handlerFakeProductVerifier struct{}

func (handlerFakeProductVerifier) GetProductSnapshot(context.Context, string) (service.ProductSnapshot, error) {
	return service.ProductSnapshot{}, nil
}

type handlerFakePublisher struct{}

func (*handlerFakePublisher) Publish(context.Context, string, map[string]any) error {
	return nil
}
