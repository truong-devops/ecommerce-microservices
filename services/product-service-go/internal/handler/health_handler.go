package handler

import (
	"context"
	"net/http"
	"time"

	"product-service-go/internal/httpx"
	"product-service-go/internal/service"
)

type HealthHandler struct {
	service *service.HealthService
}

func NewHealthHandler(s *service.HealthService) *HealthHandler {
	return &HealthHandler{service: s}
}

func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	httpx.WriteSuccess(w, r, http.StatusOK, h.service.Health())
}

func (h *HealthHandler) Live(w http.ResponseWriter, r *http.Request) {
	httpx.WriteSuccess(w, r, http.StatusOK, h.service.Live())
}

func (h *HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	payload, err := h.service.Ready(ctx)
	if err != nil {
		httpx.WriteAppError(w, r, err)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, payload)
}
