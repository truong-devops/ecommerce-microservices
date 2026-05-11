package handler

import (
	"context"
	"net/http"
	"time"

	"shipping-service/internal/domain"
	"shipping-service/internal/httpx"
	"shipping-service/internal/service"
)

type HealthHandler struct {
	health *service.HealthService
}

func NewHealthHandler(health *service.HealthService) *HealthHandler {
	return &HealthHandler{health: health}
}

func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	httpx.WriteSuccess(w, r, http.StatusOK, h.health.Health())
}

func (h *HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	data, err := h.health.Ready(ctx)
	if err != nil {
		httpx.WriteError(w, r, http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Dependency check failed", map[string]any{"error": err.Error()})
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, data)
}

func (h *HealthHandler) Live(w http.ResponseWriter, r *http.Request) {
	httpx.WriteSuccess(w, r, http.StatusOK, h.health.Live())
}
