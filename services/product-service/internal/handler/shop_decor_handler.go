package handler

import (
	"net/http"

	"product-service/internal/auth"
	"product-service/internal/domain"
	"product-service/internal/httpx"
	"product-service/internal/service"

	"github.com/go-chi/chi/v5"
)

type ShopDecorHandler struct {
	service *service.ShopDecorService
}

func NewShopDecorHandler(s *service.ShopDecorService) *ShopDecorHandler {
	return &ShopDecorHandler{service: s}
}

func (h *ShopDecorHandler) GetMyShopDecor(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	response, err := h.service.GetMyShopDecor(r.Context(), user)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, response)
}

func (h *ShopDecorHandler) UpdateMyShopDecor(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}
	var input service.UpdateShopDecorInput
	if err := httpx.DecodeJSONStrict(r, &input); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Invalid JSON body", nil)
		return
	}
	response, err := h.service.UpdateMyShopDecor(r.Context(), user, input)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, response)
}

func (h *ShopDecorHandler) GetPublicShopDecor(w http.ResponseWriter, r *http.Request) {
	response, err := h.service.GetPublicShopDecor(r.Context(), chi.URLParam(r, "sellerId"))
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, response)
}
