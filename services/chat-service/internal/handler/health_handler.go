package handler

import (
	"net/http"

	"chat-service/internal/domain"
	"chat-service/internal/httpx"
	"chat-service/internal/service"
)

type HealthHandler struct {
	healthService *service.HealthService
}

func NewHealthHandler(healthService *service.HealthService) *HealthHandler {
	return &HealthHandler{healthService: healthService}
}

func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	httpx.WriteSuccess(w, r, http.StatusOK, h.healthService.Health(r.Context()))
}

func (h *HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	result, err := h.healthService.Ready(r.Context())
	if err != nil {
		httpx.WriteError(w, r, http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Dependency check failed", map[string]any{"error": err.Error()})
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *HealthHandler) Live(w http.ResponseWriter, r *http.Request) {
	httpx.WriteSuccess(w, r, http.StatusOK, h.healthService.Live(r.Context()))
}
