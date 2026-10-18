package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"

	"wallet-service/internal/config"
	"wallet-service/internal/repository"

	"go.uber.org/zap"
)

var (
	ErrSePayPayoutWebhookDisabled     = errors.New("sepay payout webhook is disabled")
	ErrSePayPayoutWebhookUnauthorized = errors.New("sepay payout webhook authentication failed")
	ErrSePayPayoutWebhookInvalid      = errors.New("invalid sepay payout webhook")
)

type SePayPayoutWebhookStore interface {
	ProcessSePayPayoutWebhook(context.Context, repository.SePayPayoutWebhookInput) (repository.SePayPayoutWebhookResult, error)
}

type SePayPayoutWebhookService struct {
	store  SePayPayoutWebhookStore
	cfg    config.SePayPayoutWebhookConfig
	logger *zap.Logger
	now    func() time.Time
}

type sePayPayoutWebhookPayload struct {
	ID              json.RawMessage `json:"id"`
	Gateway         string          `json:"gateway"`
	TransactionDate string          `json:"transactionDate"`
	AccountNumber   string          `json:"accountNumber"`
	Code            string          `json:"code"`
	Content         string          `json:"content"`
	TransferType    string          `json:"transferType"`
	Description     string          `json:"description"`
	TransferAmount  int64           `json:"transferAmount"`
	ReferenceCode   string          `json:"referenceCode"`
}

func NewSePayPayoutWebhookService(store SePayPayoutWebhookStore, cfg config.SePayPayoutWebhookConfig, logger *zap.Logger) *SePayPayoutWebhookService {
	if logger == nil {
		logger = zap.NewNop()
	}
	return &SePayPayoutWebhookService{store: store, cfg: cfg, logger: logger, now: func() time.Time { return time.Now().UTC() }}
}

func (s *SePayPayoutWebhookService) Handle(ctx context.Context, headers http.Header, rawBody []byte) (repository.SePayPayoutWebhookResult, error) {
	if !s.cfg.Enabled {
		return repository.SePayPayoutWebhookResult{}, ErrSePayPayoutWebhookDisabled
	}
	if err := verifySePayPayoutWebhook(headers, rawBody, s.cfg, s.now()); err != nil {
		s.logger.Warn("rejected SePay payout webhook authentication", zap.Error(err))
		return repository.SePayPayoutWebhookResult{}, fmt.Errorf("%w: %v", ErrSePayPayoutWebhookUnauthorized, err)
	}

	var payload sePayPayoutWebhookPayload
	if err := json.Unmarshal(rawBody, &payload); err != nil {
		return repository.SePayPayoutWebhookResult{}, fmt.Errorf("%w: malformed JSON", ErrSePayPayoutWebhookInvalid)
	}
	if !strings.EqualFold(strings.TrimSpace(payload.TransferType), "out") {
		return repository.SePayPayoutWebhookResult{Outcome: "IGNORED_NOT_OUTGOING"}, nil
	}
	if normalizeBankAccount(payload.AccountNumber) != normalizeBankAccount(s.cfg.SourceAccountNumber) {
		s.logger.Warn("ignored SePay outgoing transaction from an unexpected source account")
		return repository.SePayPayoutWebhookResult{Outcome: "IGNORED_SOURCE_ACCOUNT"}, nil
	}
	if payload.TransferAmount < 1 {
		return repository.SePayPayoutWebhookResult{}, fmt.Errorf("%w: transferAmount must be positive", ErrSePayPayoutWebhookInvalid)
	}

	eventID := sePayEventID(payload.ID, payload.ReferenceCode)
	if eventID == "" || len(eventID) > 128 {
		return repository.SePayPayoutWebhookResult{}, fmt.Errorf("%w: id must contain 1-128 characters", ErrSePayPayoutWebhookInvalid)
	}
	content := strings.TrimSpace(strings.Join([]string{payload.Content, payload.Description, payload.Code}, " "))
	transferCode := extractPayoutTransferCode(content)
	transactionAt := parseSePayPayoutTime(payload.TransactionDate, s.now())
	referenceCode := strings.TrimSpace(payload.ReferenceCode)
	if len(referenceCode) > 128 {
		referenceCode = referenceCode[:128]
	}

	result, err := s.store.ProcessSePayPayoutWebhook(ctx, repository.SePayPayoutWebhookInput{
		TransactionID: eventID, TransferCode: transferCode, Gateway: strings.TrimSpace(payload.Gateway),
		SourceAccountNumber: normalizeBankAccount(payload.AccountNumber), AmountMinor: payload.TransferAmount,
		Content: content, ReferenceCode: referenceCode, TransactionAt: transactionAt, RawPayload: append([]byte(nil), rawBody...),
	})
	if err != nil {
		return repository.SePayPayoutWebhookResult{}, err
	}
	fields := []zap.Field{zap.String("transaction_id", eventID), zap.String("outcome", result.Outcome)}
	if result.PayoutID != "" {
		fields = append(fields, zap.String("payout_id", result.PayoutID))
	}
	if result.Outcome == "REVIEW_REQUIRED" || result.Outcome == "UNMATCHED" {
		s.logger.Warn("SePay payout webhook needs attention", fields...)
	} else {
		s.logger.Info("SePay payout webhook processed", fields...)
	}
	return result, nil
}

func extractPayoutTransferCode(value string) string {
	normalized := strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			return unicode.ToUpper(r)
		}
		return -1
	}, value)
	const prefix = "EMALL"
	for offset := 0; ; {
		index := strings.Index(normalized[offset:], prefix)
		if index < 0 {
			return ""
		}
		start := offset + index
		end := start + len(prefix) + 12
		if end <= len(normalized) {
			candidate := normalized[start:end]
			valid := true
			for _, r := range candidate[len(prefix):] {
				if !strings.ContainsRune("0123456789ABCDEF", r) {
					valid = false
					break
				}
			}
			if valid {
				return candidate
			}
		}
		offset = start + len(prefix)
		if offset >= len(normalized) {
			return ""
		}
	}
}

func sePayEventID(raw json.RawMessage, referenceCode string) string {
	value := strings.TrimSpace(string(raw))
	if len(value) >= 2 && value[0] == '"' {
		var decoded string
		if json.Unmarshal(raw, &decoded) == nil {
			value = strings.TrimSpace(decoded)
		}
	}
	if value == "" || value == "null" {
		value = strings.TrimSpace(referenceCode)
	}
	return value
}

func normalizeBankAccount(value string) string {
	return strings.ToUpper(strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			return r
		}
		return -1
	}, strings.TrimSpace(value)))
}

func parseSePayPayoutTime(value string, fallback time.Time) time.Time {
	value = strings.TrimSpace(value)
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed.UTC()
		}
	}
	location, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	if err != nil {
		location = time.FixedZone("ICT", 7*60*60)
	}
	for _, layout := range []string{"2006-01-02 15:04:05", "2006-01-02 15:04:05.999999"} {
		if parsed, parseErr := time.ParseInLocation(layout, value, location); parseErr == nil {
			return parsed.UTC()
		}
	}
	return fallback.UTC()
}

func verifySePayPayoutWebhook(headers http.Header, rawBody []byte, cfg config.SePayPayoutWebhookConfig, now time.Time) error {
	mode := strings.ToLower(strings.TrimSpace(cfg.AuthMode))
	switch mode {
	case "none":
		return nil
	case "apikey":
		return verifySePayPayoutAPIKey(headers, cfg.APIKey)
	case "hmac":
		return verifySePayPayoutHMAC(headers, rawBody, sePayPayoutSecrets(cfg), cfg.TimestampToleranceSeconds, now)
	case "auto":
		hasHMAC := strings.TrimSpace(headers.Get("X-SePay-Signature")) != "" || strings.TrimSpace(headers.Get("X-SePay-Timestamp")) != ""
		if hasHMAC && len(sePayPayoutSecrets(cfg)) > 0 {
			if err := verifySePayPayoutHMAC(headers, rawBody, sePayPayoutSecrets(cfg), cfg.TimestampToleranceSeconds, now); err == nil {
				return nil
			}
		}
		return verifySePayPayoutAPIKey(headers, cfg.APIKey)
	default:
		return errors.New("unsupported authentication mode")
	}
}

func verifySePayPayoutAPIKey(headers http.Header, expected string) error {
	actual := strings.TrimSpace(headers.Get("X-SePay-Api-Key"))
	authorization := strings.TrimSpace(headers.Get("Authorization"))
	if authorization != "" {
		parts := strings.SplitN(authorization, " ", 2)
		if len(parts) == 2 && (strings.EqualFold(parts[0], "Apikey") || strings.EqualFold(parts[0], "Bearer")) {
			actual = strings.TrimSpace(parts[1])
		} else if actual == "" {
			actual = authorization
		}
	}
	if expected == "" || actual == "" || subtle.ConstantTimeCompare([]byte(actual), []byte(expected)) != 1 {
		return errors.New("invalid API key")
	}
	return nil
}

func sePayPayoutSecrets(cfg config.SePayPayoutWebhookConfig) []string {
	seen := make(map[string]struct{}, len(cfg.Secrets)+1)
	result := make([]string, 0, len(cfg.Secrets)+1)
	for _, value := range append([]string{cfg.Secret}, cfg.Secrets...) {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func verifySePayPayoutHMAC(headers http.Header, rawBody []byte, secrets []string, toleranceSeconds int, now time.Time) error {
	timestampRaw := strings.TrimSpace(headers.Get("X-SePay-Timestamp"))
	signature := strings.ToLower(strings.TrimSpace(headers.Get("X-SePay-Signature")))
	timestamp, err := strconv.ParseInt(timestampRaw, 10, 64)
	if err != nil || signature == "" {
		return errors.New("missing or invalid HMAC headers")
	}
	if toleranceSeconds < 1 {
		toleranceSeconds = 300
	}
	if math.Abs(float64(now.Unix()-timestamp)) > float64(toleranceSeconds) {
		return errors.New("timestamp outside tolerance")
	}
	for _, secret := range secrets {
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write([]byte(timestampRaw))
		mac.Write([]byte("."))
		mac.Write(rawBody)
		expectedHex := hex.EncodeToString(mac.Sum(nil))
		expected := "sha256=" + expectedHex
		if !strings.HasPrefix(signature, "sha256=") {
			expected = expectedHex
		}
		if subtle.ConstantTimeCompare([]byte(expected), []byte(signature)) == 1 {
			return nil
		}
	}
	return errors.New("invalid HMAC signature")
}
