package service

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"payment-service-go/internal/config"
	"payment-service-go/internal/domain"
)

const (
	sepayProviderName = "sepay"
	sepayQRBaseURL    = "https://qr.sepay.vn/img"
)

var sepayCodePattern = regexp.MustCompile(`[A-Z]{2,10}[A-Z0-9]{6,32}`)

type SePayGateway struct {
	cfg config.SePayConfig
}

type SePayWebhookPayload struct {
	ID              any    `json:"id"`
	Gateway         string `json:"gateway"`
	TransactionDate string `json:"transactionDate"`
	AccountNumber   string `json:"accountNumber"`
	SubAccount      string `json:"subAccount"`
	Code            string `json:"code"`
	Content         string `json:"content"`
	TransferType    string `json:"transferType"`
	Description     string `json:"description"`
	TransferAmount  int64  `json:"transferAmount"`
	Accumulated     int64  `json:"accumulated"`
	ReferenceCode   string `json:"referenceCode"`
}

func NewSePayGateway(cfg config.SePayConfig) *SePayGateway {
	if strings.TrimSpace(cfg.PaymentCodePrefix) == "" {
		cfg.PaymentCodePrefix = "EMX"
	}
	if strings.TrimSpace(cfg.TransferDescriptionTemplate) == "" {
		cfg.TransferDescriptionTemplate = "{paymentCode} thanh toan don {orderCode}"
	}
	if cfg.PaymentExpiresMinutes < 1 {
		cfg.PaymentExpiresMinutes = 15
	}
	if cfg.TimestampToleranceSeconds < 1 {
		cfg.TimestampToleranceSeconds = 300
	}
	return &SePayGateway{cfg: cfg}
}

func (g *SePayGateway) CreatePaymentIntent(input CreatePaymentIntentGatewayInput) (CreatePaymentIntentGatewayOutput, error) {
	if !strings.EqualFold(strings.TrimSpace(input.Currency), "VND") {
		return CreatePaymentIntentGatewayOutput{}, fmt.Errorf("sepay only supports VND QR transfer payments")
	}
	if !isWholeVND(input.Amount) {
		return CreatePaymentIntentGatewayOutput{}, fmt.Errorf("sepay QR amount must be a whole VND amount")
	}

	paymentCode := buildSePayPaymentCode(g.cfg.PaymentCodePrefix, input.OrderID)
	orderCode := strings.TrimSpace(input.OrderID)
	if input.OrderNumber != nil && strings.TrimSpace(*input.OrderNumber) != "" {
		orderCode = strings.TrimSpace(*input.OrderNumber)
	}

	description := renderSePayDescription(g.cfg.TransferDescriptionTemplate, paymentCode, orderCode)
	qrURL := buildSePayQRURL(g.cfg, int64(math.Round(input.Amount)), description)
	expiresAt := time.Now().UTC().Add(time.Duration(g.cfg.PaymentExpiresMinutes) * time.Minute)

	instructions := &PaymentInstructions{
		Type:                "VIETQR",
		PaymentCode:         paymentCode,
		QRImageURL:          qrURL,
		BankCode:            strings.TrimSpace(g.cfg.BankCode),
		AccountNumber:       strings.TrimSpace(g.cfg.BankAccountNumber),
		AccountName:         strings.TrimSpace(g.cfg.BankAccountName),
		Amount:              math.Round(input.Amount),
		Currency:            "VND",
		TransferDescription: description,
		ExpiresAt:           expiresAt,
	}

	return CreatePaymentIntentGatewayOutput{
		ProviderPaymentID:    paymentCode,
		GatewayTransactionID: "sepay_intent_" + paymentCode,
		Status:               domain.PaymentStatusPending,
		Instructions:         instructions,
		RawPayload: map[string]any{
			"source":              "sepay-qr",
			"paymentCode":         paymentCode,
			"qrImageUrl":          qrURL,
			"bankCode":            instructions.BankCode,
			"accountNumber":       instructions.AccountNumber,
			"accountName":         instructions.AccountName,
			"transferDescription": description,
			"expiresAt":           expiresAt.Format(time.RFC3339Nano),
		},
	}, nil
}

func (g *SePayGateway) ParseWebhook(input ParseWebhookGatewayInput) (ParseWebhookGatewayOutput, error) {
	payload, err := sepayPayloadFromRawMap(input.RawPayload)
	if err != nil {
		return ParseWebhookGatewayOutput{}, err
	}
	status := domain.PaymentStatusCaptured
	if !strings.EqualFold(strings.TrimSpace(payload.TransferType), "in") {
		status = domain.PaymentStatusPending
	}
	amount := float64(payload.TransferAmount)
	currency := "VND"
	gatewayTxnID := strings.TrimSpace(payload.ReferenceCode)
	return ParseWebhookGatewayOutput{
		IsValid:              true,
		Status:               status,
		GatewayTransactionID: strPtr(gatewayTxnID),
		Amount:               &amount,
		Currency:             &currency,
		RawPayload:           input.RawPayload,
	}, nil
}

func (g *SePayGateway) CreateRefund(input CreateRefundGatewayInput) (CreateRefundGatewayOutput, error) {
	return CreateRefundGatewayOutput{}, fmt.Errorf("sepay automatic refunds are not implemented")
}

func (g *SePayGateway) VerifyWebhook(headers http.Header, rawBody []byte, now time.Time) error {
	switch strings.ToLower(strings.TrimSpace(g.cfg.WebhookAuthMode)) {
	case "", "hmac":
		secrets := g.webhookSecrets()
		if len(secrets) == 0 {
			return nil
		}
		return verifySePayHMACWithSecrets(headers, rawBody, secrets, g.cfg.TimestampToleranceSeconds, now)
	case "apikey":
		return g.verifyAPIKey(headers)
	case "auto":
		secrets := g.webhookSecrets()
		hasHMACHeaders := strings.TrimSpace(headers.Get("X-SePay-Signature")) != "" || strings.TrimSpace(headers.Get("X-SePay-Timestamp")) != ""
		hasAPIKey := strings.TrimSpace(g.cfg.WebhookAPIKey) != ""

		if hasHMACHeaders && len(secrets) > 0 {
			if err := verifySePayHMACWithSecrets(headers, rawBody, secrets, g.cfg.TimestampToleranceSeconds, now); err != nil {
				if !hasAPIKey || !hasSePayAPIKey(headers) {
					return err
				}
			} else {
				return nil
			}
		}
		if hasAPIKey {
			return g.verifyAPIKey(headers)
		}
		if hasHMACHeaders && len(secrets) == 0 {
			return errors.New("missing sepay webhook secret")
		}
		return nil
	case "none":
		return nil
	default:
		return errors.New("unsupported sepay webhook auth mode")
	}
}

func (g *SePayGateway) webhookSecrets() []string {
	secrets := make([]string, 0, len(g.cfg.WebhookSecrets)+1)
	seen := make(map[string]struct{}, len(g.cfg.WebhookSecrets)+1)
	for _, secret := range append([]string{g.cfg.WebhookSecret}, g.cfg.WebhookSecrets...) {
		secret = strings.TrimSpace(secret)
		if secret == "" {
			continue
		}
		if _, ok := seen[secret]; ok {
			continue
		}
		seen[secret] = struct{}{}
		secrets = append(secrets, secret)
	}
	return secrets
}

func (g *SePayGateway) verifyAPIKey(headers http.Header) error {
	if strings.TrimSpace(g.cfg.WebhookAPIKey) == "" {
		return nil
	}
	got := extractSePayAPIKey(headers)
	if got == "" {
		return errors.New("missing sepay api key authorization")
	}
	if subtle.ConstantTimeCompare([]byte(got), []byte(g.cfg.WebhookAPIKey)) != 1 {
		return errors.New("invalid sepay api key")
	}
	return nil
}

func hasSePayAPIKey(headers http.Header) bool {
	return extractSePayAPIKey(headers) != ""
}

func extractSePayAPIKey(headers http.Header) string {
	got := strings.TrimSpace(headers.Get("X-SePay-Api-Key"))
	auth := strings.TrimSpace(headers.Get("Authorization"))
	switch {
	case strings.HasPrefix(auth, "Apikey "):
		got = strings.TrimSpace(strings.TrimPrefix(auth, "Apikey "))
	case strings.HasPrefix(auth, "Bearer "):
		got = strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
	case got == "" && auth != "":
		got = auth
	}
	return got
}

func verifySePayHMACWithSecrets(headers http.Header, rawBody []byte, secrets []string, toleranceSeconds int, now time.Time) error {
	if len(secrets) == 0 {
		return nil
	}

	var lastErr error
	for _, secret := range secrets {
		secret = strings.TrimSpace(secret)
		if secret == "" {
			continue
		}
		if err := verifySePayHMAC(headers, rawBody, secret, toleranceSeconds, now); err != nil {
			lastErr = err
			continue
		}
		return nil
	}
	if lastErr != nil {
		return lastErr
	}
	return errors.New("missing sepay webhook secret")
}

func (g *SePayGateway) ParseWebhookPayload(rawBody []byte) (SePayWebhookPayload, map[string]any, error) {
	var payload SePayWebhookPayload
	if err := json.Unmarshal(rawBody, &payload); err != nil {
		return SePayWebhookPayload{}, nil, err
	}
	var raw map[string]any
	if err := json.Unmarshal(rawBody, &raw); err != nil {
		return SePayWebhookPayload{}, nil, err
	}
	payload.Code = normalizeSePayPaymentCode(payload.Code, payload.Content, g.cfg.PaymentCodePrefix)
	return payload, raw, nil
}

func (g *SePayGateway) AllowsAccount(accountNumber string) bool {
	accountNumber = strings.TrimSpace(accountNumber)
	if accountNumber == "" {
		return false
	}
	if len(g.cfg.AllowedAccountNumbers) == 0 {
		return accountNumber == strings.TrimSpace(g.cfg.BankAccountNumber)
	}
	for _, allowed := range g.cfg.AllowedAccountNumbers {
		if accountNumber == strings.TrimSpace(allowed) {
			return true
		}
	}
	return false
}

func (p SePayWebhookPayload) ProviderEventID() string {
	switch v := p.ID.(type) {
	case string:
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	case float64:
		return strconv.FormatInt(int64(v), 10)
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	}
	if strings.TrimSpace(p.ReferenceCode) != "" {
		return strings.TrimSpace(p.ReferenceCode)
	}
	return strings.TrimSpace(p.Code) + ":" + strings.TrimSpace(p.TransactionDate)
}

func verifySePayHMAC(headers http.Header, rawBody []byte, secret string, toleranceSeconds int, now time.Time) error {
	signature := strings.TrimSpace(headers.Get("X-SePay-Signature"))
	timestampRaw := strings.TrimSpace(headers.Get("X-SePay-Timestamp"))
	if signature == "" || timestampRaw == "" {
		return errors.New("missing sepay hmac headers")
	}
	timestamp, err := strconv.ParseInt(timestampRaw, 10, 64)
	if err != nil {
		return errors.New("invalid sepay timestamp")
	}
	if toleranceSeconds < 1 {
		toleranceSeconds = 300
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	if math.Abs(float64(now.Unix()-timestamp)) > float64(toleranceSeconds) {
		return errors.New("sepay webhook timestamp outside tolerance")
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestampRaw))
	mac.Write([]byte("."))
	mac.Write(rawBody)
	expectedHex := hex.EncodeToString(mac.Sum(nil))
	expected := "sha256=" + expectedHex
	got := strings.ToLower(signature)
	if !strings.HasPrefix(got, "sha256=") {
		expected = expectedHex
	}
	if subtle.ConstantTimeCompare([]byte(expected), []byte(got)) != 1 {
		return errors.New("invalid sepay signature")
	}
	return nil
}

func buildSePayPaymentCode(prefix string, orderID string) string {
	prefix = strings.ToUpper(strings.TrimSpace(prefix))
	if prefix == "" {
		prefix = "EMX"
	}
	normalized := strings.ToUpper(strings.Map(func(r rune) rune {
		if r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' {
			return r
		}
		if r >= 'a' && r <= 'z' {
			return r - 32
		}
		return -1
	}, orderID))
	if len(normalized) < 12 {
		sum := sha256.Sum256([]byte(orderID))
		normalized = strings.ToUpper(hex.EncodeToString(sum[:]))
	}
	return prefix + normalized[:12]
}

func renderSePayDescription(template string, paymentCode string, orderCode string) string {
	if strings.TrimSpace(template) == "" {
		template = "{paymentCode} thanh toan don {orderCode}"
	}
	out := strings.ReplaceAll(template, "{paymentCode}", paymentCode)
	out = strings.ReplaceAll(out, "{orderCode}", orderCode)
	return strings.TrimSpace(out)
}

func buildSePayQRURL(cfg config.SePayConfig, amount int64, description string) string {
	values := url.Values{}
	values.Set("acc", strings.TrimSpace(cfg.BankAccountNumber))
	values.Set("bank", strings.TrimSpace(cfg.BankCode))
	values.Set("amount", strconv.FormatInt(amount, 10))
	values.Set("des", description)
	if strings.TrimSpace(cfg.QRTemplate) != "" {
		values.Set("template", strings.TrimSpace(cfg.QRTemplate))
	}
	return sepayQRBaseURL + "?" + values.Encode()
}

func isWholeVND(amount float64) bool {
	return amount >= 1 && math.Abs(amount-math.Round(amount)) < 1e-9
}

func normalizeSePayPaymentCode(code string, content string, prefix string) string {
	code = strings.ToUpper(strings.TrimSpace(code))
	if code != "" {
		return code
	}
	prefix = strings.ToUpper(strings.TrimSpace(prefix))
	upperContent := strings.ToUpper(content)
	for _, candidate := range sepayCodePattern.FindAllString(upperContent, -1) {
		if prefix == "" || strings.HasPrefix(candidate, prefix) {
			return candidate
		}
	}
	return ""
}

func sepayPayloadFromRawMap(raw map[string]any) (SePayWebhookPayload, error) {
	b, err := json.Marshal(raw)
	if err != nil {
		return SePayWebhookPayload{}, err
	}
	var payload SePayWebhookPayload
	if err := json.Unmarshal(b, &payload); err != nil {
		return SePayWebhookPayload{}, err
	}
	return payload, nil
}
