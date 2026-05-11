package handler

import (
	"net/http"
	"regexp"
	"strings"

	"media-service/internal/httpx"
	"media-service/internal/middleware"
	"media-service/internal/service"
)

type MediaHandler struct {
	service *service.StorageService
}

var unknownFieldRegex = regexp.MustCompile(`unknown field "([^"]+)"`)

func NewMediaHandler(s *service.StorageService) *MediaHandler {
	return &MediaHandler{service: s}
}

func (h *MediaHandler) PresignUpload(w http.ResponseWriter, r *http.Request) {
	var req service.PresignUploadRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		writeDecodeValidationError(w, r, err)
		return
	}

	result, err := h.service.PresignUpload(r.Context(), req)
	if err != nil {
		httpx.WriteAppError(w, r, err, "INTERNAL_SERVER_ERROR")
		return
	}

	httpx.WriteSuccess(w, r, http.StatusCreated, result)
}

func (h *MediaHandler) PresignDownload(w http.ResponseWriter, r *http.Request) {
	var req service.PresignDownloadRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		writeDecodeValidationError(w, r, err)
		return
	}

	result, err := h.service.PresignDownload(r.Context(), req)
	if err != nil {
		httpx.WriteAppError(w, r, err, "INTERNAL_SERVER_ERROR")
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *MediaHandler) DeleteObject(w http.ResponseWriter, r *http.Request) {
	var req service.DeleteObjectRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		writeDecodeValidationError(w, r, err)
		return
	}

	result, err := h.service.DeleteObject(r.Context(), req)
	if err != nil {
		httpx.WriteAppError(w, r, err, "INTERNAL_SERVER_ERROR")
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func requestID(r *http.Request) string {
	if requestID := middleware.RequestIDFromContext(r.Context()); requestID != "" {
		return requestID
	}
	return "unknown-request-id"
}

func writeDecodeValidationError(w http.ResponseWriter, r *http.Request, err error) {
	message := "Validation failed"
	if matches := unknownFieldRegex.FindStringSubmatch(err.Error()); len(matches) == 2 && strings.TrimSpace(matches[1]) != "" {
		message = "property " + matches[1] + " should not exist"
	}
	httpx.WriteError(w, r, http.StatusBadRequest, "BAD_REQUEST", message, nil)
}
