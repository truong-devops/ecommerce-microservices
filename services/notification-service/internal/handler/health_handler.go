package handler

import (
	"net/http"

	"notification-service/internal/domain"
	"notification-service/internal/httpx"
	"notification-service/internal/service"
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
	resp, err := h.healthService.Ready(r.Context())
	if err != nil {
		httpx.WriteError(w, r, http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Service unavailable", nil)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, resp)
}

func (h *HealthHandler) Live(w http.ResponseWriter, r *http.Request) {
	httpx.WriteSuccess(w, r, http.StatusOK, h.healthService.Live())
}
