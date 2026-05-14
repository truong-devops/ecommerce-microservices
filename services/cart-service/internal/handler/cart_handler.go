package handler

import (
	"net/http"
	"net/url"
	"strings"

	"cart-service/internal/auth"
	"cart-service/internal/domain"
	"cart-service/internal/httpx"
	"cart-service/internal/middleware"
	"cart-service/internal/service"

	"github.com/go-chi/chi/v5"
)

type CartHandler struct {
	svc *service.CartService
}

func NewCartHandler(svc *service.CartService) *CartHandler {
	return &CartHandler{svc: svc}
}

func (h *CartHandler) GetCart(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	cart, err := h.svc.GetCart(r.Context(), user)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, cart)
}

func (h *CartHandler) AddItem(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	type payload struct {
		ProductID       string         `json:"productId"`
		VariantID       *string        `json:"variantId"`
		SKU             string         `json:"sku"`
		Name            string         `json:"name"`
		Image           *string        `json:"image"`
		UnitPrice       *float64       `json:"unitPrice"`
		Quantity        *int           `json:"quantity"`
		SellerID        string         `json:"sellerId"`
		Metadata        map[string]any `json:"metadata"`
		Currency        *string        `json:"currency"`
		ExpectedVersion *int           `json:"expectedVersion"`
	}

	var req payload
	if err := httpx.DecodeJSONStrict(r, &req); err != nil || req.Quantity == nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", nil)
		return
	}
	if !isValidAddPayload(
		req.ProductID,
		req.VariantID,
		req.SKU,
		req.Name,
		req.Image,
		req.UnitPrice,
		*req.Quantity,
		req.SellerID,
		req.Currency,
		req.ExpectedVersion,
	) {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", nil)
		return
	}

	cart, err := h.svc.AddItem(r.Context(), user, requestID(r), service.AddCartItemRequest{
		ProductID:       strings.TrimSpace(req.ProductID),
		VariantID:       trimStringPtr(req.VariantID),
		SKU:             strings.TrimSpace(req.SKU),
		Name:            strings.TrimSpace(req.Name),
		Image:           trimStringPtr(req.Image),
		UnitPrice:       derefFloat(req.UnitPrice),
		Quantity:        *req.Quantity,
		SellerID:        strings.TrimSpace(req.SellerID),
		Metadata:        req.Metadata,
		Currency:        trimStringPtr(req.Currency),
		ExpectedVersion: req.ExpectedVersion,
	})
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusCreated, cart)
}

func (h *CartHandler) UpdateItem(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	type payload struct {
		Quantity        *int `json:"quantity"`
		ExpectedVersion *int `json:"expectedVersion"`
	}

	var req payload
	if err := httpx.DecodeJSONStrict(r, &req); err != nil || req.Quantity == nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", nil)
		return
	}
	if *req.Quantity < 0 || *req.Quantity > 10000 {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", nil)
		return
	}
	if req.ExpectedVersion != nil && *req.ExpectedVersion < 1 {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", nil)
		return
	}

	cart, err := h.svc.UpdateItem(r.Context(), user, requestID(r), chi.URLParam(r, "itemId"), service.UpdateCartItemRequest{
		Quantity:        *req.Quantity,
		ExpectedVersion: req.ExpectedVersion,
	})
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, cart)
}

func (h *CartHandler) RemoveItem(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	cart, err := h.svc.RemoveItem(r.Context(), user, requestID(r), chi.URLParam(r, "itemId"))
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, cart)
}

func (h *CartHandler) ClearCart(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	cart, err := h.svc.ClearCart(r.Context(), user, requestID(r))
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, cart)
}

func (h *CartHandler) ValidateCart(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	type payload struct {
		IncludeExternalChecks *bool `json:"includeExternalChecks"`
	}
	var req payload
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", nil)
		return
	}
	includeExternal := true
	if req.IncludeExternalChecks != nil {
		includeExternal = *req.IncludeExternalChecks
	}

	result, err := h.svc.ValidateCart(r.Context(), user, includeExternal)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusCreated, result)
}

func requestID(r *http.Request) string {
	return middleware.RequestIDFromContext(r.Context())
}

func trimStringPtr(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func isValidAddPayload(
	productID string,
	variantID *string,
	sku string,
	name string,
	image *string,
	unitPrice *float64,
	quantity int,
	sellerID string,
	currency *string,
	expectedVersion *int,
) bool {
	if len(strings.TrimSpace(productID)) < 1 || len(strings.TrimSpace(productID)) > 64 {
		return false
	}
	if variantID != nil {
		v := strings.TrimSpace(*variantID)
		if len(v) < 1 || len(v) > 64 {
			return false
		}
	}
	if len(strings.TrimSpace(sku)) < 1 || len(strings.TrimSpace(sku)) > 64 {
		return false
	}
	if len(strings.TrimSpace(name)) < 1 || len(strings.TrimSpace(name)) > 255 {
		return false
	}
	if image != nil {
		if _, err := url.ParseRequestURI(strings.TrimSpace(*image)); err != nil {
			return false
		}
	}
	if unitPrice != nil && *unitPrice < 0 {
		return false
	}
	if quantity < 1 || quantity > 10000 {
		return false
	}
	if len(strings.TrimSpace(sellerID)) < 1 || len(strings.TrimSpace(sellerID)) > 64 {
		return false
	}
	if currency != nil {
		c := strings.ToUpper(strings.TrimSpace(*currency))
		if len(c) != 3 {
			return false
		}
	}
	if expectedVersion != nil && *expectedVersion < 1 {
		return false
	}
	return true
}

func derefFloat(value *float64) float64 {
	if value == nil {
		return 0
	}
	return *value
}
