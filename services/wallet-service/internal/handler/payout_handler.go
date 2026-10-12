package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"wallet-service/internal/auth"
	"wallet-service/internal/domain"
	"wallet-service/internal/httpx"
	"wallet-service/internal/service"

	"github.com/go-chi/chi/v5"
)

type PayoutHandler struct{ payout *service.PayoutService }

func NewPayoutHandler(payout *service.PayoutService) *PayoutHandler {
	return &PayoutHandler{payout: payout}
}

type upsertBankAccountRequest struct {
	BankCode          string `json:"bankCode"`
	AccountNumber     string `json:"accountNumber"`
	AccountHolderName string `json:"accountHolderName"`
}

type createPayoutRequest struct {
	Amount   int64  `json:"amount"`
	Currency string `json:"currency"`
}

func (h *PayoutHandler) GetBankAccount(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	account, err := h.payout.GetMyBankAccount(r.Context(), user)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, account)
}

func (h *PayoutHandler) UpsertBankAccount(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	var request upsertBankAccountRequest
	if err := decodeJSON(r, &request); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Invalid JSON body", nil)
		return
	}
	account, err := h.payout.UpsertMyBankAccount(r.Context(), user, request.BankCode, request.AccountNumber, request.AccountHolderName)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, account)
}

func (h *PayoutHandler) CreatePayout(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	var request createPayoutRequest
	if err := decodeJSON(r, &request); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Invalid JSON body", nil)
		return
	}
	payout, replay, err := h.payout.CreateMyPayout(r.Context(), user, r.Header.Get("Idempotency-Key"), request.Amount, request.Currency)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	if replay {
		w.Header().Set("Idempotent-Replayed", "true")
	}
	status := http.StatusCreated
	if replay {
		status = http.StatusOK
	}
	httpx.WriteSuccess(w, r, status, payout)
}

func (h *PayoutHandler) ListPayouts(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	page, err := parsePositiveInt(r.URL.Query().Get("page"), 1, 1, 1_000_000)
	if err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "page must be a positive integer", nil)
		return
	}
	pageSize, err := parsePositiveInt(r.URL.Query().Get("pageSize"), 20, 1, 100)
	if err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "pageSize must be between 1 and 100", nil)
		return
	}
	result, err := h.payout.ListMyPayouts(r.Context(), user, r.URL.Query().Get("status"), page, pageSize)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	totalPages := 0
	if result.TotalItems > 0 {
		totalPages = int((result.TotalItems + int64(pageSize) - 1) / int64(pageSize))
	}
	httpx.WriteSuccess(w, r, http.StatusOK, map[string]any{"items": result.Items, "pagination": map[string]any{"page": page, "pageSize": pageSize, "totalItems": result.TotalItems, "totalPages": totalPages}})
}

func (h *PayoutHandler) GetPayoutSummary(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	weekStart, err := time.Parse(time.RFC3339, strings.TrimSpace(r.URL.Query().Get("weekStart")))
	if err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "weekStart must be RFC3339", nil)
		return
	}
	monthStart, err := time.Parse(time.RFC3339, strings.TrimSpace(r.URL.Query().Get("monthStart")))
	if err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "monthStart must be RFC3339", nil)
		return
	}
	summary, err := h.payout.GetMyPayoutSummary(r.Context(), user, weekStart, monthStart)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, summary)
}

func (h *PayoutHandler) GetPayout(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	payout, err := h.payout.GetMyPayout(r.Context(), user, chi.URLParam(r, "payoutID"))
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, payout)
}

func decodeJSON(r *http.Request, target any) error {
	decoder := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return &json.SyntaxError{}
	}
	return nil
}
