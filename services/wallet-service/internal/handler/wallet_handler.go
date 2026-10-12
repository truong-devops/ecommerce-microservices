package handler

import (
	"net/http"
	"strconv"
	"strings"

	"wallet-service/internal/auth"
	"wallet-service/internal/domain"
	"wallet-service/internal/httpx"
	"wallet-service/internal/service"
)

type WalletHandler struct {
	wallet *service.WalletService
}

func NewWalletHandler(wallet *service.WalletService) *WalletHandler {
	return &WalletHandler{wallet: wallet}
}

func (h *WalletHandler) GetMyWallet(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	result, err := h.wallet.GetMyWallet(r.Context(), user, queryCurrency(r))
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *WalletHandler) ListMyTransactions(w http.ResponseWriter, r *http.Request) {
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
	result, err := h.wallet.ListMyTransactions(r.Context(), user, queryCurrency(r), page, pageSize)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func queryCurrency(r *http.Request) string {
	value := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("currency")))
	if value == "" {
		return "VND"
	}
	return value
}

func parsePositiveInt(raw string, fallback, minValue, maxValue int) (int, error) {
	if strings.TrimSpace(raw) == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < minValue || value > maxValue {
		return 0, strconv.ErrSyntax
	}
	return value, nil
}
