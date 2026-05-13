package e2e

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"chat-service/internal/config"
	"chat-service/internal/domain"
	"chat-service/internal/handler"
	"chat-service/internal/repository"
	"chat-service/internal/router"
	"chat-service/internal/service"

	"github.com/alicebob/miniredis/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.uber.org/zap"
)

func TestBuyerSellerChatFlowE2E(t *testing.T) {
	mongoURI := strings.TrimSpace(os.Getenv("MONGO_TEST_URI"))
	if mongoURI == "" {
		t.Skip("MONGO_TEST_URI is not set")
	}

	jwtSecret := strings.TrimSpace(os.Getenv("JWT_TEST_SECRET"))
	if len(jwtSecret) < 32 {
		jwtSecret = "dev-shared-jwt-access-secret-min-32-chars"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	mongoClient, err := mongo.Connect(ctx, options.Client().ApplyURI(mongoURI))
	if err != nil {
		t.Skipf("skip e2e, mongo unavailable: %v", err)
	}
	defer func() {
		_ = mongoClient.Disconnect(context.Background())
	}()
	if err := mongoClient.Ping(ctx, nil); err != nil {
		t.Skipf("skip e2e, mongo ping failed: %v", err)
	}

	miniRedis := miniredis.RunT(t)
	redisURL := "redis://" + miniRedis.Addr()

	testDBName := "ecommerce_chat_e2e_" + strings.ToLower(uuid.NewString())
	db := mongoClient.Database(testDBName)
	defer func() {
		_ = db.Drop(context.Background())
	}()

	chatRepo := repository.NewChatRepository(db)
	if err := chatRepo.EnsureIndexes(ctx); err != nil {
		t.Fatalf("ensure indexes: %v", err)
	}

	redisService, err := service.NewRedisService(true, redisURL)
	if err != nil {
		t.Fatalf("init redis service: %v", err)
	}
	defer func() {
		_ = redisService.Close(context.Background())
	}()

	chatService := service.NewChatService(chatRepo, redisService, service.NewSendRateLimiter(1000, 1000))
	healthService := service.NewHealthService("chat-service", chatRepo, redisService)
	chatHandler := handler.NewChatHandler(chatService, redisService, []string{"http://example.com"})
	healthHandler := handler.NewHealthHandler(healthService)

	cfg := config.Config{
		AppName:              "chat-service",
		AppEnv:               "test",
		APIPrefix:            "api/v1",
		JWTAccessSecret:      jwtSecret,
		SendMessageRateRPS:   1000,
		SendMessageRateBurst: 1000,
	}

	logger := zap.NewNop()
	httpHandler := router.New(cfg, logger, redisService, chatHandler, healthHandler)
	testServer := httptest.NewServer(httpHandler)
	defer testServer.Close()

	buyerID := "buyer-1"
	sellerID := "seller-1"
	buyerToken := signedToken(t, jwtSecret, buyerID, domain.RoleCustomer)
	sellerToken := signedToken(t, jwtSecret, sellerID, domain.RoleSeller)

	conversationID := createConversation(t, testServer.URL, buyerToken, sellerID)

	sellerWS := openConversationWS(t, testServer.URL, conversationID, sellerToken)
	defer sellerWS.Close()

	sendMessage(t, testServer.URL, buyerToken, conversationID, "xin chao seller", "buyer-msg-1")

	messageCreated := readWSEventByType(t, sellerWS, "chat.message.created", 15*time.Second)
	if got := asString(messageCreated["conversationId"]); got != conversationID {
		t.Fatalf("expected conversationId %q, got %q", conversationID, got)
	}
	messagePayload, ok := messageCreated["message"].(map[string]any)
	if !ok {
		t.Fatalf("chat.message.created payload missing message object")
	}
	if text := asString(messagePayload["text"]); text != "xin chao seller" {
		t.Fatalf("expected message text %q, got %q", "xin chao seller", text)
	}

	assertSellerUnread(t, testServer.URL, sellerToken, 1)

	markRead(t, testServer.URL, sellerToken, conversationID)

	messageRead := readWSEventByType(t, sellerWS, "chat.message.read", 15*time.Second)
	if got := asString(messageRead["conversationId"]); got != conversationID {
		t.Fatalf("expected read event conversationId %q, got %q", conversationID, got)
	}
	if got := asString(messageRead["readerId"]); got != sellerID {
		t.Fatalf("expected readerId %q, got %q", sellerID, got)
	}

	assertSellerUnread(t, testServer.URL, sellerToken, 0)
}

func createConversation(t *testing.T, baseURL, accessToken, sellerID string) string {
	t.Helper()

	payload := map[string]any{"sellerId": sellerID}
	respBody := callJSON(t, http.MethodPost, baseURL+"/api/v1/chat/conversations", accessToken, payload)
	data := envelopeDataAsMap(t, respBody)
	id := asString(data["id"])
	if id == "" {
		t.Fatalf("conversation id is empty")
	}
	return id
}

func sendMessage(t *testing.T, baseURL, accessToken, conversationID, text, clientMessageID string) {
	t.Helper()

	payload := map[string]any{
		"text":            text,
		"clientMessageId": clientMessageID,
	}
	_ = callJSON(t, http.MethodPost, baseURL+"/api/v1/chat/conversations/"+conversationID+"/messages", accessToken, payload)
}

func markRead(t *testing.T, baseURL, accessToken, conversationID string) {
	t.Helper()

	_ = callJSON(t, http.MethodPost, baseURL+"/api/v1/chat/conversations/"+conversationID+"/read", accessToken, map[string]any{})
}

func assertSellerUnread(t *testing.T, baseURL, accessToken string, expected int64) {
	t.Helper()

	respBody := callJSON(t, http.MethodGet, baseURL+"/api/v1/chat/conversations?page=1&pageSize=20", accessToken, nil)
	data := envelopeDataAsList(t, respBody)
	if len(data) == 0 {
		t.Fatalf("expected at least one conversation")
	}
	unread, ok := data[0]["unread"].(map[string]any)
	if !ok {
		t.Fatalf("conversation unread payload missing")
	}
	got := asInt64(unread["seller"])
	if got != expected {
		t.Fatalf("expected unread.seller %d, got %d", expected, got)
	}
}

func openConversationWS(t *testing.T, baseURL, conversationID, accessToken string) *websocket.Conn {
	t.Helper()

	wsURL := strings.Replace(baseURL, "http://", "ws://", 1) + "/api/v1/chat/ws?conversationId=" + url.QueryEscape(conversationID) + "&accessToken=" + url.QueryEscape(accessToken)
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("open ws: %v", err)
	}
	return conn
}

func readWSEventByType(t *testing.T, conn *websocket.Conn, eventType string, timeout time.Duration) map[string]any {
	t.Helper()

	if err := conn.SetReadDeadline(time.Now().Add(timeout)); err != nil {
		t.Fatalf("set read deadline: %v", err)
	}
	for {
		var payload map[string]any
		if err := conn.ReadJSON(&payload); err != nil {
			t.Fatalf("read ws message: %v", err)
		}
		if strings.TrimSpace(asString(payload["type"])) == eventType {
			return payload
		}
	}
}

func callJSON(t *testing.T, method, endpoint, accessToken string, payload any) map[string]any {
	t.Helper()

	var body *bytes.Reader
	if payload == nil {
		body = bytes.NewReader(nil)
	} else {
		raw, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal payload: %v", err)
		}
		body = bytes.NewReader(raw)
	}

	req, err := http.NewRequest(method, endpoint, body)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+accessToken)

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("call %s %s: %v", method, endpoint, err)
	}
	defer res.Body.Close()

	var parsed map[string]any
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		t.Fatalf("unexpected status %d for %s %s, response=%v", res.StatusCode, method, endpoint, parsed)
	}

	success, _ := parsed["success"].(bool)
	if !success {
		t.Fatalf("expected success response for %s %s, got %v", method, endpoint, parsed)
	}
	return parsed
}

func envelopeDataAsMap(t *testing.T, envelope map[string]any) map[string]any {
	t.Helper()
	data, ok := envelope["data"].(map[string]any)
	if !ok {
		t.Fatalf("envelope data is not object: %v", envelope)
	}
	return data
}

func envelopeDataAsList(t *testing.T, envelope map[string]any) []map[string]any {
	t.Helper()

	rawList, ok := envelope["data"].([]any)
	if !ok {
		t.Fatalf("envelope data is not list: %v", envelope)
	}

	out := make([]map[string]any, 0, len(rawList))
	for _, item := range rawList {
		obj, ok := item.(map[string]any)
		if !ok {
			t.Fatalf("envelope list item is not object: %#v", item)
		}
		out = append(out, obj)
	}
	return out
}

func signedToken(t *testing.T, secret, userID string, role domain.Role) string {
	t.Helper()

	now := time.Now().UTC()
	claims := jwt.MapClaims{
		"sub":          userID,
		"email":        userID + "@example.com",
		"role":         string(role),
		"sessionId":    "session-" + userID,
		"jti":          "jti-" + userID + "-" + uuid.NewString(),
		"tokenVersion": 1,
		"iat":          now.Unix(),
		"nbf":          now.Unix(),
		"exp":          now.Add(1 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return signed
}

func asString(value any) string {
	s, _ := value.(string)
	return strings.TrimSpace(s)
}

func asInt64(value any) int64 {
	switch typed := value.(type) {
	case int:
		return int64(typed)
	case int32:
		return int64(typed)
	case int64:
		return typed
	case float64:
		return int64(typed)
	default:
		return 0
	}
}
