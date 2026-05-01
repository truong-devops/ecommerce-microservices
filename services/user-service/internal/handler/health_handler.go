package handler

import (
	"net/http"
	"time"

	"user-service-go/internal/httpx"
	"user-service-go/internal/service"
)

type HealthHandler struct {
	serviceName string
	userService *service.UserService
}

func NewHealthHandler(serviceName string, userService *service.UserService) *HealthHandler {
	return &HealthHandler{serviceName: serviceName, userService: userService}
}

func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	httpx.WriteSuccess(w, r, http.StatusOK, map[string]any{
		"status":    "ok",
		"service":   h.serviceName,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

func (h *HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	if err := h.userService.Ping(r.Context()); err != nil {
		httpx.WriteError(w, r, http.StatusServiceUnavailable, "USER_SERVICE_UNAVAILABLE", "Database is not ready", nil)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, map[string]any{
		"ready": true,
	})
}
