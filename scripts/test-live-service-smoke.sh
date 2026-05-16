#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONGO_CONTAINER="${MONGO_CONTAINER:-ecommerce-microservices-mongo-1}"
PRODUCT_ID="${PRODUCT_ID:-64b000000000000000000001}"
SELLER_ID="${SELLER_ID:-seller-smoke-1}"
BUYER_ID="${BUYER_ID:-buyer-smoke-1}"
JWT_SECRET="${JWT_SECRET:-dev-shared-jwt-access-secret-min-32-chars}"
GATEWAY_URL="${GATEWAY_URL:-http://localhost:12000}"
GATEWAY_WS_URL="${GATEWAY_WS_URL:-ws://localhost:12000}"

echo "[live-smoke] checking compose config"
docker compose -f "$ROOT_DIR/docker-compose.yml" config --quiet

echo "[live-smoke] seeding active product $PRODUCT_ID"
SLUG="live-smoke-$(date +%s)"
docker exec "$MONGO_CONTAINER" mongosh --quiet --eval "
const id = ObjectId('$PRODUCT_ID');
db = db.getSiblingDB('ecommerce_product');
db.products.updateOne(
  { _id: id },
  {
    \$set: {
      sellerId: '$SELLER_ID',
      name: 'Live Smoke Product',
      slug: '$SLUG',
      description: 'Smoke product for live-service E2E',
      categoryId: 'smoke',
      brand: 'Smoke',
      status: 'ACTIVE',
      attributes: {},
      images: ['https://example.com/smoke.jpg'],
      variants: [{ sku: 'LIVE-SMOKE-1', name: 'Default', price: 99000, currency: 'VND', isDefault: true, metadata: {} }],
      minPrice: 99000,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  },
  { upsert: true }
);
"

TMP_GO="$(mktemp /tmp/live_smoke_XXXXXX.go)"
trap 'rm -f "$TMP_GO"' EXIT

cat > "$TMP_GO" <<'GOEOF'
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
)

type envelope struct {
	Success bool            `json:"success"`
	Data    json.RawMessage `json:"data"`
}

type session struct {
	SessionID string `json:"sessionId"`
	Status    string `json:"status"`
}

type liveProduct struct {
	ProductID string `json:"productId"`
	PinStatus string `json:"pinStatus"`
}

func main() {
	gateway := mustEnv("GATEWAY_URL")
	wsGateway := mustEnv("GATEWAY_WS_URL")
	secret := mustEnv("JWT_SECRET")
	sellerID := mustEnv("SELLER_ID")
	buyerID := mustEnv("BUYER_ID")
	productID := mustEnv("PRODUCT_ID")

	sellerToken := sign(secret, sellerID, "SELLER")
	buyerToken := sign(secret, buyerID, "BUYER")

	created := postJSON[session](gateway, "POST", "/api/v1/live/sessions", sellerToken, map[string]any{
		"title":       "Smoke Live Session",
		"description": "E2E smoke test",
		"playbackUrl": "https://example.com/live-smoke.mp4",
	})
	if created.SessionID == "" || created.Status != "DRAFT" {
		fail("unexpected create response: %+v", created)
	}
	fmt.Println("[live-smoke] created session", created.SessionID)

	started := postJSON[session](gateway, "PATCH", "/api/v1/live/sessions/"+created.SessionID+"/start", sellerToken, map[string]any{})
	if started.Status != "LIVE" {
		fail("expected LIVE after start, got %+v", started)
	}
	fmt.Println("[live-smoke] started session", started.Status)

	pinned := postJSON[liveProduct](gateway, "POST", "/api/v1/live/sessions/"+created.SessionID+"/products", sellerToken, map[string]any{"productId": productID})
	if pinned.ProductID != productID || pinned.PinStatus != "PINNED" {
		fail("unexpected pinned product response: %+v", pinned)
	}
	fmt.Println("[live-smoke] pinned product", pinned.ProductID)

	detail := getJSON[map[string]any](gateway, "/api/v1/live/sessions/"+created.SessionID, "")
	if detail["session"] == nil {
		fail("public session detail missing session: %+v", detail)
	}
	fmt.Println("[live-smoke] loaded public session detail")

	testWebSocket(wsGateway, created.SessionID, buyerToken)

	ended := postJSON[session](gateway, "PATCH", "/api/v1/live/sessions/"+created.SessionID+"/end", sellerToken, map[string]any{})
	if ended.Status != "ENDED" {
		fail("expected ENDED after end, got %+v", ended)
	}
	fmt.Println("[live-smoke] ended session", ended.Status)
}

func sign(secret, userID, role string) string {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":          userID,
		"email":        userID + "@example.com",
		"role":         role,
		"sessionId":    "smoke-session",
		"jti":          userID + "-jti",
		"tokenVersion": float64(1),
		"exp":          time.Now().Add(time.Hour).Unix(),
	})
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		fail("sign token: %v", err)
	}
	return signed
}

func postJSON[T any](gateway, method, path, token string, payload any) T {
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest(method, gateway+path, bytes.NewReader(body))
	if err != nil {
		fail("new request %s %s: %v", method, path, err)
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return doJSON[T](req)
}

func getJSON[T any](gateway, path, token string) T {
	req, err := http.NewRequest(http.MethodGet, gateway+path, nil)
	if err != nil {
		fail("new get %s: %v", path, err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return doJSON[T](req)
}

func doJSON[T any](req *http.Request) T {
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		fail("http %s %s: %v", req.Method, req.URL.Path, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		fail("http %s %s status=%d body=%s", req.Method, req.URL.Path, resp.StatusCode, string(raw))
	}
	var env envelope
	if err := json.Unmarshal(raw, &env); err != nil {
		fail("decode envelope: %v body=%s", err, string(raw))
	}
	if !env.Success {
		fail("unsuccessful envelope: %s", string(raw))
	}
	var out T
	if err := json.Unmarshal(env.Data, &out); err != nil {
		fail("decode data: %v data=%s", err, string(env.Data))
	}
	return out
}

func testWebSocket(wsGateway, sessionID, token string) {
	dialer := websocket.Dialer{Subprotocols: []string{"live.v1", "access-token." + token}}
	headers := http.Header{}
	headers.Set("Origin", "http://localhost:3000")
	conn, _, err := dialer.Dial(wsGateway+"/api/v1/live/ws?sessionId="+sessionID, headers)
	if err != nil {
		fail("websocket dial: %v", err)
	}
	defer conn.Close()

	clientMessageID := fmt.Sprintf("smoke-%d", time.Now().UnixNano())
	if err := conn.WriteJSON(map[string]any{"type": "live:message:create", "text": "hello from smoke", "clientMessageId": clientMessageID}); err != nil {
		fail("websocket write: %v", err)
	}

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		_ = conn.SetReadDeadline(time.Now().Add(time.Second))
		var msg map[string]any
		if err := conn.ReadJSON(&msg); err != nil {
			continue
		}
		if msg["type"] == "ack" && msg["action"] == "live:message:create" {
			fmt.Println("[live-smoke] websocket message ack received")
			return
		}
	}
	fail("websocket ack not received")
}

func mustEnv(key string) string {
	value := os.Getenv(key)
	if value == "" {
		fail("missing env %s", key)
	}
	return value
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "SMOKE FAILED: "+format+"\n", args...)
	os.Exit(1)
}
GOEOF

echo "[live-smoke] running gateway REST + WebSocket flow"
(
  cd "$ROOT_DIR/services/live-service"
  GATEWAY_URL="$GATEWAY_URL" \
  GATEWAY_WS_URL="$GATEWAY_WS_URL" \
  JWT_SECRET="$JWT_SECRET" \
  SELLER_ID="$SELLER_ID" \
  BUYER_ID="$BUYER_ID" \
  PRODUCT_ID="$PRODUCT_ID" \
    go run "$TMP_GO"
)

echo "[live-smoke] passed"
