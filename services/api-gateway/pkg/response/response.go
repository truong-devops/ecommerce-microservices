package response

import (
	"encoding/json"
	"net/http"

	apperrors "api-gateway/pkg/errors"
)

type ErrorBody struct {
	Code    apperrors.Code `json:"code"`
	Message string         `json:"message"`
}

type Payload struct {
	Success   bool       `json:"success"`
	Data      any        `json:"data,omitempty"`
	Error     *ErrorBody `json:"error,omitempty"`
	RequestID string     `json:"request_id,omitempty"`
}

func Success(w http.ResponseWriter, status int, data any, requestID string) {
	writeJSON(w, status, Payload{
		Success:   true,
		Data:      data,
		RequestID: requestID,
	})
}

func Error(w http.ResponseWriter, status int, code apperrors.Code, message, requestID string) {
	writeJSON(w, status, Payload{
		Success: false,
		Error: &ErrorBody{
			Code:    code,
			Message: message,
		},
		RequestID: requestID,
	})
}

func writeJSON(w http.ResponseWriter, status int, payload Payload) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
