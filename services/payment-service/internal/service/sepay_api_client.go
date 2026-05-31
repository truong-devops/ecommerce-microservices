package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"payment-service-go/internal/config"
)

type sePayHTTPClient interface {
	Do(req *http.Request) (*http.Response, error)
}

type SePayAPIClient struct {
	baseURL       string
	apiToken      string
	accountNumber string
	httpClient    sePayHTTPClient
}

type ListSePayTransactionsInput struct {
	AccountNumber string
	SinceID       string
	Limit         int
}

type SePayTransaction struct {
	ID                 string `json:"id"`
	BankBrandName      string `json:"bank_brand_name"`
	AccountNumber      string `json:"account_number"`
	SubAccount         string `json:"sub_account"`
	TransactionDate    string `json:"transaction_date"`
	AmountIn           string `json:"amount_in"`
	AmountOut          string `json:"amount_out"`
	Accumulated        string `json:"accumulated"`
	TransactionContent string `json:"transaction_content"`
	ReferenceNumber    string `json:"reference_number"`
	Code               string `json:"code"`
	BankAccountID      string `json:"bank_account_id"`
}

func NewSePayAPIClient(cfg config.SePayConfig, httpClient sePayHTTPClient) *SePayAPIClient {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	return &SePayAPIClient{
		baseURL:       strings.TrimRight(strings.TrimSpace(cfg.APIBaseURL), "/"),
		apiToken:      strings.TrimSpace(cfg.APIToken),
		accountNumber: strings.TrimSpace(cfg.BankAccountNumber),
		httpClient:    httpClient,
	}
}

func (c *SePayAPIClient) ListTransactions(ctx context.Context, input ListSePayTransactionsInput) ([]SePayTransaction, error) {
	if strings.TrimSpace(c.baseURL) == "" {
		return nil, fmt.Errorf("sepay api base url is required")
	}
	if strings.TrimSpace(c.apiToken) == "" {
		return nil, fmt.Errorf("sepay api token is required")
	}

	endpoint, err := url.Parse(c.baseURL + "/transactions/list")
	if err != nil {
		return nil, fmt.Errorf("parse sepay transactions endpoint: %w", err)
	}
	query := endpoint.Query()
	accountNumber := strings.TrimSpace(input.AccountNumber)
	if accountNumber == "" {
		accountNumber = c.accountNumber
	}
	if accountNumber != "" {
		query.Set("account_number", accountNumber)
	}
	if strings.TrimSpace(input.SinceID) != "" {
		query.Set("since_id", strings.TrimSpace(input.SinceID))
	}
	limit := input.Limit
	if limit < 1 {
		limit = 100
	}
	if limit > 5000 {
		limit = 5000
	}
	query.Set("limit", strconv.Itoa(limit))
	endpoint.RawQuery = query.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("create sepay transactions request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call sepay transactions api: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("sepay transactions api returned status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var envelope struct {
		Status       any                `json:"status"`
		Error        any                `json:"error"`
		Messages     map[string]any     `json:"messages"`
		Transactions []SePayTransaction `json:"transactions"`
		Data         json.RawMessage    `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil {
		return nil, fmt.Errorf("decode sepay transactions response: %w", err)
	}

	transactions := envelope.Transactions
	if len(transactions) == 0 && len(envelope.Data) > 0 {
		transactions = decodeSePayTransactionsData(envelope.Data)
	}
	sort.SliceStable(transactions, func(i, j int) bool {
		return compareSePayIDs(transactions[i].ID, transactions[j].ID) < 0
	})
	return transactions, nil
}

func decodeSePayTransactionsData(raw json.RawMessage) []SePayTransaction {
	var direct []SePayTransaction
	if err := json.Unmarshal(raw, &direct); err == nil {
		return direct
	}
	var wrapped struct {
		Transactions []SePayTransaction `json:"transactions"`
	}
	if err := json.Unmarshal(raw, &wrapped); err == nil {
		return wrapped.Transactions
	}
	return nil
}

func sePayTransactionToWebhookPayload(txn SePayTransaction, paymentCodePrefix string) (SePayWebhookPayload, map[string]any, []byte, error) {
	amountIn, err := parseSePayDecimal(txn.AmountIn)
	if err != nil {
		return SePayWebhookPayload{}, nil, nil, fmt.Errorf("parse sepay amount_in: %w", err)
	}
	amountOut, err := parseSePayDecimal(txn.AmountOut)
	if err != nil {
		return SePayWebhookPayload{}, nil, nil, fmt.Errorf("parse sepay amount_out: %w", err)
	}
	accumulated, err := parseSePayDecimal(txn.Accumulated)
	if err != nil {
		return SePayWebhookPayload{}, nil, nil, fmt.Errorf("parse sepay accumulated: %w", err)
	}

	transferType := "in"
	transferAmount := amountIn
	if amountIn <= 0 && amountOut > 0 {
		transferType = "out"
		transferAmount = amountOut
	}

	payload := SePayWebhookPayload{
		ID:              strings.TrimSpace(txn.ID),
		Gateway:         strings.TrimSpace(txn.BankBrandName),
		TransactionDate: strings.TrimSpace(txn.TransactionDate),
		AccountNumber:   strings.TrimSpace(txn.AccountNumber),
		SubAccount:      strings.TrimSpace(txn.SubAccount),
		Code:            normalizeSePayPaymentCode(txn.Code, txn.TransactionContent, paymentCodePrefix),
		Content:         strings.TrimSpace(txn.TransactionContent),
		TransferType:    transferType,
		Description:     strings.TrimSpace(txn.TransactionContent),
		TransferAmount:  int64(math.Round(transferAmount)),
		Accumulated:     int64(math.Round(accumulated)),
		ReferenceCode:   strings.TrimSpace(txn.ReferenceNumber),
	}

	rawBody, err := json.Marshal(payload)
	if err != nil {
		return SePayWebhookPayload{}, nil, nil, err
	}
	var rawPayload map[string]any
	if err := json.Unmarshal(rawBody, &rawPayload); err != nil {
		return SePayWebhookPayload{}, nil, nil, err
	}
	rawPayload["source"] = "sepay-reconciliation"
	rawPayload["bankAccountId"] = strings.TrimSpace(txn.BankAccountID)
	return payload, rawPayload, rawBody, nil
}

func parseSePayDecimal(raw string) (float64, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return 0, nil
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0, err
	}
	return parsed, nil
}

func compareSePayIDs(a, b string) int {
	a = strings.TrimSpace(a)
	b = strings.TrimSpace(b)
	ai, aErr := strconv.ParseInt(a, 10, 64)
	bi, bErr := strconv.ParseInt(b, 10, 64)
	if aErr == nil && bErr == nil {
		switch {
		case ai < bi:
			return -1
		case ai > bi:
			return 1
		default:
			return 0
		}
	}
	return strings.Compare(a, b)
}

func sePayIDAfter(id string, sinceID string) bool {
	if strings.TrimSpace(sinceID) == "" {
		return strings.TrimSpace(id) != ""
	}
	return compareSePayIDs(id, sinceID) > 0
}
