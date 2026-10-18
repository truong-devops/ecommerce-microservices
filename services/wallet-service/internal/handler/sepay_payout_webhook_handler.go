package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"wallet-service/internal/service"
)

const maxSePayPayoutWebhookBody = 1 << 20

type SePayPayoutWebhookHandler struct {
	service *service.SePayPayoutWebhookService
}

func NewSePayPayoutWebhookHandler(webhookService *service.SePayPayoutWebhookService) *SePayPayoutWebhookHandler {
	return &SePayPayoutWebhookHandler{service: webhookService}
}

func (h *SePayPayoutWebhookHandler) Handle(w http.ResponseWriter, r *http.Request) {
	rawBody, err := io.ReadAll(io.LimitReader(r.Body, maxSePayPayoutWebhookBody+1))
	if err != nil || len(rawBody) > maxSePayPayoutWebhookBody {
		writeSePayPayoutResponse(w, http.StatusBadRequest, false, "Invalid webhook body")
		return
	}
	_, err = h.service.Handle(r.Context(), r.Header, rawBody)
	switch {
	case err == nil:
		writeSePayPayoutResponse(w, http.StatusOK, true, "")
	case errors.Is(err, service.ErrSePayPayoutWebhookDisabled):
		writeSePayPayoutResponse(w, http.StatusServiceUnavailable, false, "Payout webhook is disabled")
	case errors.Is(err, service.ErrSePayPayoutWebhookUnauthorized):
		writeSePayPayoutResponse(w, http.StatusUnauthorized, false, "Unauthorized")
	case errors.Is(err, service.ErrSePayPayoutWebhookInvalid):
		writeSePayPayoutResponse(w, http.StatusBadRequest, false, "Invalid webhook payload")
	default:
		writeSePayPayoutResponse(w, http.StatusInternalServerError, false, "Webhook processing failed")
	}
}

func writeSePayPayoutResponse(w http.ResponseWriter, status int, success bool, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	payload := map[string]any{"success": success}
	if message != "" {
		payload["message"] = message
	}
	_ = json.NewEncoder(w).Encode(payload)
}
