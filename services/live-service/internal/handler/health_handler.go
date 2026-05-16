package handler

import (
	"net/http"

	"live-service/internal/domain"
	"live-service/internal/httpx"
	"live-service/internal/service"
)

type HealthHandler struct {
	healthService *service.HealthService
}

func NewHealthHandler(healthService *service.HealthService) *HealthHandler {
	return &HealthHandler{healthService: healthService}
}

func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	httpx.WriteSuccess(w, r, http.StatusOK, h.healthService.Health())
}

func (h *HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	result, err := h.healthService.Ready(r.Context())
	if err != nil {
		httpx.WriteError(w, r, http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Service not ready", nil)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *HealthHandler) Live(w http.ResponseWriter, r *http.Request) {
	httpx.WriteSuccess(w, r, http.StatusOK, h.healthService.Live())
}
