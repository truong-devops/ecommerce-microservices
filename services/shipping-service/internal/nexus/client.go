package nexus

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

const CreateOrderPath = "/merchant/integrations/orders"

type Client struct {
	baseURL     string
	partnerCode string
	apiKey      string
	apiSecret   string
	httpClient  *http.Client
}

type APIError struct {
	Status  int
	Code    string
	Message string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("nexus api returned %d %s: %s", e.Status, e.Code, e.Message)
}

func NewClient(baseURL, partnerCode, apiKey, apiSecret string, timeout time.Duration) *Client {
	return &Client{
		baseURL:     strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		partnerCode: strings.TrimSpace(partnerCode),
		apiKey:      strings.TrimSpace(apiKey),
		apiSecret:   strings.TrimSpace(apiSecret),
		httpClient:  &http.Client{Timeout: timeout},
	}
}

func (c *Client) PartnerCode() string {
	if c == nil {
		return ""
	}
	return c.partnerCode
}

func (c *Client) CreateOrder(ctx context.Context, idempotencyKey string, input CreateOrderRequest) (CreateOrderResponse, error) {
	var output CreateOrderResponse
	err := c.doSignedJSON(ctx, http.MethodPost, CreateOrderPath, strings.TrimSpace(idempotencyKey), input, &output)
	return output, err
}

func (c *Client) Health(ctx context.Context) (map[string]any, error) {
	var output map[string]any
	err := c.doSignedJSON(ctx, http.MethodGet, "/merchant/integrations/health", "", nil, &output)
	return output, err
}

func (c *Client) doSignedJSON(ctx context.Context, method, path, idempotencyKey string, input any, output any) error {
	var body []byte
	var err error
	if input != nil {
		body, err = json.Marshal(input)
		if err != nil {
			return err
		}
	}

	request, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return err
	}

	timestamp := time.Now().UTC().Format(time.RFC3339)
	nonce := uuid.NewString()
	request.Header.Set("X-Nexus-Partner-Code", c.partnerCode)
	request.Header.Set("X-Nexus-Api-Key", c.apiKey)
	request.Header.Set("X-Nexus-Timestamp", timestamp)
	request.Header.Set("X-Nexus-Nonce", nonce)
	request.Header.Set("X-Nexus-Signature", Sign(method, path, timestamp, nonce, body, c.apiSecret))
	request.Header.Set("Content-Type", "application/json")
	if idempotencyKey != "" {
		request.Header.Set("Idempotency-Key", idempotencyKey)
	}

	response, err := c.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	payload, err := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if err != nil {
		return err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		var failure struct {
			Error struct {
				Code    string `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(payload, &failure)
		return &APIError{Status: response.StatusCode, Code: failure.Error.Code, Message: failure.Error.Message}
	}
	if output == nil || len(payload) == 0 {
		return nil
	}
	return json.Unmarshal(payload, output)
}

func Sign(method, path, timestamp, nonce string, body []byte, secret string) string {
	bodyHash := sha256.Sum256(body)
	canonical := strings.ToUpper(method) + "\n" + path + "\n" + timestamp + "\n" + nonce + "\n" + hex.EncodeToString(bodyHash[:])
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(canonical))
	return hex.EncodeToString(mac.Sum(nil))
}

func VerifySignature(method, path, timestamp, nonce string, body []byte, secret, provided string) bool {
	expected := Sign(method, path, timestamp, nonce, body, secret)
	actual := strings.TrimSpace(strings.ToLower(strings.TrimPrefix(provided, "sha256=")))
	return subtle.ConstantTimeCompare([]byte(expected), []byte(actual)) == 1
}
