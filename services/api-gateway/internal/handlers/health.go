package handlers

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"

	"api-gateway/internal/config"
	"api-gateway/internal/middleware"
	apperrors "api-gateway/pkg/errors"
	"api-gateway/pkg/response"

	"go.uber.org/zap"
)

type HealthHandler struct {
	appName  string
	appEnv   string
	services map[string]config.ServiceConfig
	client   *http.Client
	logger   *zap.Logger
}

type dependencyStatus struct {
	Name   string `json:"name"`
	URL    string `json:"url"`
	Ready  bool   `json:"ready"`
	Reason string `json:"reason,omitempty"`
}

func NewHealthHandler(cfg *config.Config, logger *zap.Logger) *HealthHandler {
	return &HealthHandler{
		appName:  cfg.AppName,
		appEnv:   cfg.AppEnv,
		services: cfg.Services,
		client: &http.Client{
			Timeout: 2 * time.Second,
		},
		logger: logger,
	}
}

func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	response.Success(w, http.StatusOK, map[string]any{
		"status":      "ok",
		"service":     h.appName,
		"environment": h.appEnv,
		"timestamp":   time.Now().UTC().Format(time.RFC3339),
	}, middleware.RequestIDFromContext(r.Context()))
}

func (h *HealthHandler) Live(w http.ResponseWriter, r *http.Request) {
	response.Success(w, http.StatusOK, map[string]any{
		"status":    "alive",
		"service":   h.appName,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}, middleware.RequestIDFromContext(r.Context()))
}

func (h *HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	statuses := make([]dependencyStatus, 0, len(h.services))
	resultsCh := make(chan dependencyStatus, len(h.services))

	wg := sync.WaitGroup{}
	for name, svc := range h.services {
		wg.Add(1)
		go func(serviceName string, serviceConfig config.ServiceConfig) {
			defer wg.Done()
			resultsCh <- h.checkDependency(r.Context(), serviceName, serviceConfig)
		}(name, svc)
	}

	wg.Wait()
	close(resultsCh)

	allReady := true
	for result := range resultsCh {
		statuses = append(statuses, result)
		if !result.Ready {
			allReady = false
		}
	}

	requestID := middleware.RequestIDFromContext(r.Context())
	if !allReady {
		h.logger.Warn("readiness check failed", zap.String("request_id", requestID))
		response.Error(w, http.StatusServiceUnavailable, apperrors.CodeServiceUnavailable, "Gateway is not ready", requestID)
		return
	}

	response.Success(w, http.StatusOK, map[string]any{
		"status":       "ready",
		"service":      h.appName,
		"dependencies": statuses,
		"timestamp":    time.Now().UTC().Format(time.RFC3339),
	}, requestID)
}

func (h *HealthHandler) checkDependency(parentCtx context.Context, serviceName string, service config.ServiceConfig) dependencyStatus {
	checkURL := strings.TrimRight(service.URL, "/") + "/health"
	ctx, cancel := context.WithTimeout(parentCtx, service.Timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, checkURL, nil)
	if err != nil {
		return dependencyStatus{Name: serviceName, URL: service.URL, Ready: false, Reason: "invalid URL"}
	}

	resp, err := h.client.Do(req)
	if err != nil {
		return dependencyStatus{Name: serviceName, URL: service.URL, Ready: false, Reason: "unreachable"}
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusInternalServerError {
		return dependencyStatus{Name: serviceName, URL: service.URL, Ready: false, Reason: "upstream unhealthy"}
	}

	return dependencyStatus{Name: serviceName, URL: service.URL, Ready: true}
}
