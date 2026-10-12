package httpx

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"wallet-service/internal/middleware"
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
	return e.Message
}

func NewAppError(status int, code, message string, details any) *AppError {
	return &AppError{Status: status, Code: code, Message: message, Details: details}
}

func WriteSuccess(w http.ResponseWriter, r *http.Request, status int, data any) {
	meta := Meta{RequestID: middleware.RequestIDFromContext(r.Context()), Timestamp: time.Now().UTC().Format(time.RFC3339)}
	if wrapped, ok := data.(map[string]any); ok {
		items, hasItems := wrapped["items"]
		pagination, hasPagination := wrapped["pagination"]
		if hasItems && hasPagination {
			if page, ok := pagination.(map[string]any); ok {
				meta.Pagination = page
				data = items
			}
		}
	}
	writeJSON(w, status, map[string]any{"success": true, "data": data, "meta": meta})
}

func WriteError(w http.ResponseWriter, r *http.Request, status int, code, message string, details any) {
	writeJSON(w, status, map[string]any{
		"success": false,
		"error":   ErrorPayload{Code: code, Message: message, Details: details},
		"meta":    Meta{RequestID: middleware.RequestIDFromContext(r.Context()), Timestamp: time.Now().UTC().Format(time.RFC3339)},
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

func ExtractBearerToken(value string) string {
	parts := strings.SplitN(strings.TrimSpace(value), " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
