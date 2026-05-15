package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"product-service/internal/domain"
	"product-service/internal/middleware"
	"product-service/internal/timefmt"
)

type Meta struct {
	RequestID  string             `json:"requestId"`
	Timestamp  string             `json:"timestamp"`
	Pagination *domain.Pagination `json:"pagination,omitempty"`
}

type SuccessEnvelope struct {
	Success bool `json:"success"`
	Data    any  `json:"data"`
	Meta    Meta `json:"meta"`
}

type ErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
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
	return e.Message
}

func NewAppError(status int, code, message string, details any) *AppError {
	return &AppError{Status: status, Code: code, Message: message, Details: details}
}

func WriteSuccess(w http.ResponseWriter, r *http.Request, status int, data any) {
	writeJSON(w, status, SuccessEnvelope{
		Success: true,
		Data:    data,
		Meta:    baseMeta(r, nil),
	})
}

func WritePaginated(w http.ResponseWriter, r *http.Request, status int, items any, pagination domain.Pagination) {
	writeJSON(w, status, SuccessEnvelope{
		Success: true,
		Data:    items,
		Meta:    baseMeta(r, &pagination),
	})
}

func WriteError(w http.ResponseWriter, r *http.Request, status int, code, message string, details any) {
	if status == http.StatusBadRequest && details == nil {
		details = "Bad Request"
	}
	writeJSON(w, status, ErrorEnvelope{
		Success: false,
		Error: ErrorPayload{
			Code:    code,
			Message: message,
			Details: details,
		},
		Meta: baseMeta(r, nil),
	})
}

func WriteAppError(w http.ResponseWriter, r *http.Request, err error) {
	var appErr *AppError
	if errors.As(err, &appErr) {
		WriteError(w, r, appErr.Status, appErr.Code, appErr.Message, appErr.Details)
		return
	}
	WriteError(w, r, http.StatusInternalServerError, domain.ErrorCodeInternalServerError, "Internal server error", nil)
}

func DecodeJSONStrict(r *http.Request, dst any) error {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return errors.New("request body must contain only one JSON object")
	}
	return nil
}

func DecodeJSONOptionalStrict(r *http.Request, dst any) error {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		if errors.Is(err, io.EOF) {
			return nil
		}
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return errors.New("request body must contain only one JSON object")
	}
	return nil
}

func ExtractBearerToken(authHeader string) string {
	authHeader = strings.TrimSpace(authHeader)
	if authHeader == "" {
		return ""
	}
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func baseMeta(r *http.Request, pagination *domain.Pagination) Meta {
	return Meta{
		RequestID:  middleware.RequestIDFromContext(r.Context()),
		Timestamp:  timefmt.ISO(time.Now()),
		Pagination: pagination,
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
