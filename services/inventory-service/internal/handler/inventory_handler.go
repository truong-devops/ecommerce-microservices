package handler

import (
	"net/http"
	"strconv"
	"strings"

	"inventory-service/internal/auth"
	"inventory-service/internal/domain"
	"inventory-service/internal/httpx"
	"inventory-service/internal/middleware"
	"inventory-service/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type InventoryHandler struct {
	svc *service.InventoryService
}

func NewInventoryHandler(svc *service.InventoryService) *InventoryHandler {
	return &InventoryHandler{svc: svc}
}

func (h *InventoryHandler) ValidateStock(w http.ResponseWriter, r *http.Request) {
	sku := strings.TrimSpace(r.URL.Query().Get("sku"))
	qtyRaw := strings.TrimSpace(r.URL.Query().Get("quantity"))

	quantity, err := strconv.Atoi(qtyRaw)
	if sku == "" || err != nil || quantity < 1 {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", nil)
		return
	}

	result, svcErr := h.svc.ValidateStock(r.Context(), service.ValidateInventoryQuery{SKU: sku, Quantity: quantity})
	if svcErr != nil {
		httpx.WriteAppError(w, r, svcErr, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *InventoryHandler) GetStockBySKU(w http.ResponseWriter, r *http.Request) {
	result, err := h.svc.GetStockBySKU(r.Context(), chi.URLParam(r, "sku"))
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *InventoryHandler) AdjustStock(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	type payload struct {
		ProductID       *string `json:"productId"`
		SellerID        *string `json:"sellerId"`
		DeltaOnHand     *int    `json:"deltaOnHand"`
		Reason          *string `json:"reason"`
		ExpectedVersion *int    `json:"expectedVersion"`
	}
	var req payload
	if err := httpx.DecodeJSONStrict(r, &req); err != nil || req.DeltaOnHand == nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", nil)
		return
	}
	if req.Reason != nil && len(strings.TrimSpace(*req.Reason)) > 500 {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", nil)
		return
	}

	result, svcErr := h.svc.AdjustStock(r.Context(), user, requestID(r), chi.URLParam(r, "sku"), service.AdjustStockRequest{
		ProductID:       req.ProductID,
		SellerID:        req.SellerID,
		DeltaOnHand:     *req.DeltaOnHand,
		Reason:          req.Reason,
		ExpectedVersion: req.ExpectedVersion,
	})
	if svcErr != nil {
		httpx.WriteAppError(w, r, svcErr, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *InventoryHandler) ReserveInventory(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	type payload struct {
		OrderID string `json:"orderId"`
		Items   []struct {
			SKU      string `json:"sku"`
			Quantity int    `json:"quantity"`
		} `json:"items"`
		TTLMinutes *int    `json:"ttlMinutes"`
		Reason     *string `json:"reason"`
	}
	var req payload
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", nil)
		return
	}
	if _, err := uuid.Parse(strings.TrimSpace(req.OrderID)); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", nil)
		return
	}
	if len(req.Items) < 1 || len(req.Items) > 100 {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", nil)
		return
	}
	if req.TTLMinutes != nil && (*req.TTLMinutes < 1 || *req.TTLMinutes > 1440) {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", nil)
		return
	}
	if req.Reason != nil && len(strings.TrimSpace(*req.Reason)) > 500 {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", nil)
		return
	}

	items := make([]service.ReserveInventoryItem, 0, len(req.Items))
	for _, item := range req.Items {
		sku := strings.TrimSpace(item.SKU)
		if sku == "" || item.Quantity < 1 {
			httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", nil)
			return
		}
		items = append(items, service.ReserveInventoryItem{SKU: sku, Quantity: item.Quantity})
	}

	result, svcErr := h.svc.ReserveInventory(r.Context(), user, requestID(r), service.ReserveInventoryRequest{
		OrderID:    req.OrderID,
		Items:      items,
		TTLMinutes: req.TTLMinutes,
		Reason:     req.Reason,
	})
	if svcErr != nil {
		httpx.WriteAppError(w, r, svcErr, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusCreated, result)
}

func (h *InventoryHandler) ReleaseReservations(w http.ResponseWriter, r *http.Request) {
	h.reservationAction(w, r, true)
}

func (h *InventoryHandler) ConfirmReservations(w http.ResponseWriter, r *http.Request) {
	h.reservationAction(w, r, false)
}

func (h *InventoryHandler) reservationAction(w http.ResponseWriter, r *http.Request, release bool) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	orderID := strings.TrimSpace(chi.URLParam(r, "orderId"))
	if _, err := uuid.Parse(orderID); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", nil)
		return
	}

	type payload struct {
		Reason *string `json:"reason"`
	}
	var req payload
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", nil)
		return
	}
	if req.Reason != nil && len(strings.TrimSpace(*req.Reason)) > 500 {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", nil)
		return
	}

	var (
		result map[string]any
		err    error
	)
	if release {
		result, err = h.svc.ReleaseReservations(r.Context(), user, requestID(r), orderID, req.Reason)
	} else {
		result, err = h.svc.ConfirmReservations(r.Context(), user, requestID(r), orderID, req.Reason)
	}
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func requestID(r *http.Request) string {
	return middleware.RequestIDFromContext(r.Context())
}
