package httpx

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"inventory-service/internal/middleware"
)

type Meta struct {
	RequestID  string         `json:"requestId"`
	Timestamp  string         `json:"timestamp"`
	Pagination map[string]any `json:"pagination,omitempty"`
}

type ErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
}

type SuccessEnvelope struct {
	Success bool `json:"success"`
	Data    any  `json:"data"`
	Meta    Meta `json:"meta"`
}

type ErrorEnvelope struct {
	Success bool         `json:"success"`
	Error   ErrorPayload `json:"error"`
	Meta    Meta         `json:"meta"`
}

type AppError struct {
	Status  int
	Code    string
	Message string
	Details any
}

func (e *AppError) Error() string {
	if e == nil {
		return ""
	}
	if e.Message != "" {
		return e.Message
	}
	return e.Code
}

func NewAppError(status int, code, message string, details any) *AppError {
	return &AppError{Status: status, Code: code, Message: message, Details: details}
}

func WriteSuccess(w http.ResponseWriter, r *http.Request, status int, data any) {
	meta := Meta{
		RequestID: middleware.RequestIDFromContext(r.Context()),
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	if wrapped, ok := data.(map[string]any); ok {
		items, hasItems := wrapped["items"]
		pagination, hasPagination := wrapped["pagination"]
		if hasItems && hasPagination {
			if pMap, pOK := pagination.(map[string]any); pOK {
				meta.Pagination = pMap
				data = items
			}
		}
	}

	writeJSON(w, status, SuccessEnvelope{Success: true, Data: data, Meta: meta})
}

func WriteError(w http.ResponseWriter, r *http.Request, status int, code, message string, details any) {
	writeJSON(w, status, ErrorEnvelope{
		Success: false,
		Error:   ErrorPayload{Code: code, Message: message, Details: details},
		Meta: Meta{
			RequestID: middleware.RequestIDFromContext(r.Context()),
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		},
	})
}

func WriteAppError(w http.ResponseWriter, r *http.Request, err error, fallbackCode string) {
	var appErr *AppError
	if errors.As(err, &appErr) {
		WriteError(w, r, appErr.Status, appErr.Code, appErr.Message, appErr.Details)
		return
	}

	WriteError(w, r, http.StatusInternalServerError, fallbackCode, "Internal server error", nil)
}

func DecodeJSONStrict(r *http.Request, dst any) error {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		return err
	}
	if decoder.More() {
		return errors.New("request body must contain only one JSON object")
	}
	return nil
}

func ExtractBearerToken(value string) string {
	raw := strings.TrimSpace(value)
	if raw == "" {
		return ""
	}
	parts := strings.SplitN(raw, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
