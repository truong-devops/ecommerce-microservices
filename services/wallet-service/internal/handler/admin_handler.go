package handler

import (
	"net/http"
	"strings"

	"wallet-service/internal/auth"
	"wallet-service/internal/domain"
	"wallet-service/internal/httpx"
	"wallet-service/internal/service"

	"github.com/go-chi/chi/v5"
)

type AdminHandler struct {
	admin *service.AdminService
}

func NewAdminHandler(admin *service.AdminService) *AdminHandler {
	return &AdminHandler{admin: admin}
}

type updateWalletStatusRequest struct {
	IsFrozen bool   `json:"isFrozen"`
	Reason   string `json:"reason"`
}

type updateBankAccountStatusRequest struct {
	Status string `json:"status"`
	Reason string `json:"reason"`
}

type completeManualPayoutRequest struct {
	Action            string `json:"action"`
	ProviderReference string `json:"providerReference"`
	Reason            string `json:"reason"`
}

func (h *AdminHandler) GetSummary(w http.ResponseWriter, r *http.Request) {
	user, ok := adminUser(w, r)
	if !ok {
		return
	}
	result, err := h.admin.GetSummary(r.Context(), user)
	writeAdminResult(w, r, result, err)
}

func (h *AdminHandler) ListWallets(w http.ResponseWriter, r *http.Request) {
	user, ok := adminUser(w, r)
	if !ok {
		return
	}
	page, pageSize, ok := adminPagination(w, r)
	if !ok {
		return
	}
	result, err := h.admin.ListWallets(
		r.Context(), user, r.URL.Query().Get("search"), r.URL.Query().Get("state"),
		r.URL.Query().Get("bankStatus"), page, pageSize,
	)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, paginated(result.Items, page, pageSize, result.TotalItems))
}

func (h *AdminHandler) GetWallet(w http.ResponseWriter, r *http.Request) {
	user, ok := adminUser(w, r)
	if !ok {
		return
	}
	result, err := h.admin.GetWallet(r.Context(), user, chi.URLParam(r, "walletID"))
	writeAdminResult(w, r, result, err)
}

func (h *AdminHandler) UpdateWalletStatus(w http.ResponseWriter, r *http.Request) {
	user, ok := adminUser(w, r)
	if !ok {
		return
	}
	var request updateWalletStatusRequest
	if err := decodeJSON(r, &request); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Invalid JSON body", nil)
		return
	}
	result, err := h.admin.SetWalletFrozen(r.Context(), user, chi.URLParam(r, "walletID"), request.IsFrozen, request.Reason)
	writeAdminResult(w, r, result, err)
}

func (h *AdminHandler) UpdateBankAccountStatus(w http.ResponseWriter, r *http.Request) {
	user, ok := adminUser(w, r)
	if !ok {
		return
	}
	var request updateBankAccountStatusRequest
	if err := decodeJSON(r, &request); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Invalid JSON body", nil)
		return
	}
	result, err := h.admin.SetBankAccountStatus(r.Context(), user, chi.URLParam(r, "walletID"), request.Status, request.Reason)
	writeAdminResult(w, r, result, err)
}

func (h *AdminHandler) ListTransactions(w http.ResponseWriter, r *http.Request) {
	user, ok := adminUser(w, r)
	if !ok {
		return
	}
	page, pageSize, ok := adminPagination(w, r)
	if !ok {
		return
	}
	result, err := h.admin.ListTransactions(r.Context(), user, chi.URLParam(r, "walletID"), page, pageSize)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, paginated(result.Items, page, pageSize, result.TotalItems))
}

func (h *AdminHandler) ListPayouts(w http.ResponseWriter, r *http.Request) {
	user, ok := adminUser(w, r)
	if !ok {
		return
	}
	page, pageSize, ok := adminPagination(w, r)
	if !ok {
		return
	}
	result, err := h.admin.ListPayouts(r.Context(), user, strings.TrimSpace(r.URL.Query().Get("walletId")), r.URL.Query().Get("status"), page, pageSize)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, paginated(result.Items, page, pageSize, result.TotalItems))
}

func (h *AdminHandler) PrepareManualPayout(w http.ResponseWriter, r *http.Request) {
	user, ok := adminUser(w, r)
	if !ok {
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	result, err := h.admin.PrepareManualPayout(r.Context(), user, chi.URLParam(r, "payoutID"))
	writeAdminResult(w, r, result, err)
}

func (h *AdminHandler) CompleteManualPayout(w http.ResponseWriter, r *http.Request) {
	user, ok := adminUser(w, r)
	if !ok {
		return
	}
	var request completeManualPayoutRequest
	if err := decodeJSON(r, &request); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Invalid JSON body", nil)
		return
	}
	result, err := h.admin.CompleteManualPayout(
		r.Context(), user, chi.URLParam(r, "payoutID"), request.Action,
		request.ProviderReference, request.Reason,
	)
	writeAdminResult(w, r, result, err)
}

func (h *AdminHandler) ListAuditLogs(w http.ResponseWriter, r *http.Request) {
	user, ok := adminUser(w, r)
	if !ok {
		return
	}
	page, pageSize, ok := adminPagination(w, r)
	if !ok {
		return
	}
	result, err := h.admin.ListAuditLogs(r.Context(), user, strings.TrimSpace(r.URL.Query().Get("walletId")), page, pageSize)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, paginated(result.Items, page, pageSize, result.TotalItems))
}

func adminUser(w http.ResponseWriter, r *http.Request) (domain.UserContext, bool) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
	}
	return user, ok
}

func adminPagination(w http.ResponseWriter, r *http.Request) (int, int, bool) {
	page, err := parsePositiveInt(r.URL.Query().Get("page"), 1, 1, 1_000_000)
	if err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "page must be a positive integer", nil)
		return 0, 0, false
	}
	pageSize, err := parsePositiveInt(r.URL.Query().Get("pageSize"), 20, 1, 100)
	if err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationFailed, "pageSize must be between 1 and 100", nil)
		return 0, 0, false
	}
	return page, pageSize, true
}

func paginated(items any, page, pageSize int, totalItems int64) map[string]any {
	totalPages := 0
	if totalItems > 0 {
		totalPages = int((totalItems + int64(pageSize) - 1) / int64(pageSize))
	}
	return map[string]any{"items": items, "pagination": map[string]any{"page": page, "pageSize": pageSize, "totalItems": totalItems, "totalPages": totalPages}}
}

func writeAdminResult(w http.ResponseWriter, r *http.Request, result any, err error) {
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}
