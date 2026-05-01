package handler

import (
	"net/http"
	"time"

	"review-service-go/internal/domain"
	"review-service-go/internal/httpx"

	"go.mongodb.org/mongo-driver/mongo"
)

type HealthHandler struct {
	serviceName string
	env         string
	mongoClient *mongo.Client
	startedAt   time.Time
}

func NewHealthHandler(serviceName, env string, mongoClient *mongo.Client) *HealthHandler {
	return &HealthHandler{
		serviceName: serviceName,
		env:         env,
		mongoClient: mongoClient,
		startedAt:   time.Now().UTC(),
	}
}

func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	state := "connected"
	if err := h.mongoClient.Ping(r.Context(), nil); err != nil {
		state = "disconnected"
	}

	httpx.WriteSuccess(w, r, http.StatusOK, map[string]any{
		"service":   h.serviceName,
		"env":       h.env,
		"mongodb":   state,
		"uptimeSec": time.Since(h.startedAt).Seconds(),
		"now":       time.Now().UTC().Format(time.RFC3339),
	})
}

func (h *HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	if err := h.mongoClient.Ping(r.Context(), nil); err != nil {
		httpx.WriteError(w, r, http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "MongoDB is not ready", nil)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, map[string]any{
		"ready":   true,
		"mongodb": "connected",
	})
}

func (h *HealthHandler) Live(w http.ResponseWriter, r *http.Request) {
	httpx.WriteSuccess(w, r, http.StatusOK, map[string]any{
		"alive": true,
		"now":   time.Now().UTC().Format(time.RFC3339),
	})
}
