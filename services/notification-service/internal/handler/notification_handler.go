package handler

import (
	"net/http"
	"strconv"
	"strings"

	"notification-service/internal/auth"
	"notification-service/internal/domain"
	"notification-service/internal/httpx"
	"notification-service/internal/middleware"
	"notification-service/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type NotificationHandler struct {
	notificationService *service.NotificationService
}

func NewNotificationHandler(notificationService *service.NotificationService) *NotificationHandler {
	return &NotificationHandler{notificationService: notificationService}
}

func (h *NotificationHandler) CreateManualNotifications(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	var req service.CreateNotificationRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", map[string]any{"body": err.Error()})
		return
	}

	result, err := h.notificationService.CreateManualNotifications(r.Context(), user, requestID(r), req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusCreated, result)
}

func (h *NotificationHandler) ListNotifications(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	query, err := parseListQuery(r)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeBadRequest)
		return
	}

	result, err := h.notificationService.ListNotifications(r.Context(), user, query)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *NotificationHandler) GetNotificationByID(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	id := chi.URLParam(r, "id")
	result, err := h.notificationService.GetNotificationByID(r.Context(), user, id)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func (h *NotificationHandler) MarkNotificationAsRead(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	id := chi.URLParam(r, "id")
	result, err := h.notificationService.MarkAsRead(r.Context(), user, id)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalServerError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, result)
}

func parseListQuery(r *http.Request) (service.ListNotificationRequest, error) {
	q := r.URL.Query()
	page := 1
	pageSize := 20

	if v := strings.TrimSpace(q.Get("page")); v != "" {
		parsed, err := strconv.Atoi(v)
		if err != nil || parsed < 1 {
			return service.ListNotificationRequest{}, validationError("page", "must be an integer >= 1")
		}
		page = parsed
	}
	if v := strings.TrimSpace(q.Get("pageSize")); v != "" {
		parsed, err := strconv.Atoi(v)
		if err != nil || parsed < 1 || parsed > 100 {
			return service.ListNotificationRequest{}, validationError("pageSize", "must be an integer between 1 and 100")
		}
		pageSize = parsed
	}

	var status *domain.NotificationStatus
	if v := strings.TrimSpace(q.Get("status")); v != "" {
		parsed := domain.NotificationStatus(strings.ToUpper(v))
		if !domain.IsValidStatus(parsed) {
			return service.ListNotificationRequest{}, validationError("status", "invalid status")
		}
		status = &parsed
	}

	var channel *domain.NotificationChannel
	if v := strings.TrimSpace(q.Get("channel")); v != "" {
		parsed := domain.NotificationChannel(strings.ToUpper(v))
		if !domain.IsValidChannel(parsed) {
			return service.ListNotificationRequest{}, validationError("channel", "invalid channel")
		}
		channel = &parsed
	}

	var category *domain.NotificationCategory
	if v := strings.TrimSpace(q.Get("category")); v != "" {
		parsed := domain.NotificationCategory(strings.ToUpper(v))
		if !domain.IsValidCategory(parsed) {
			return service.ListNotificationRequest{}, validationError("category", "invalid category")
		}
		category = &parsed
	}

	var recipientID *string
	if v := strings.TrimSpace(q.Get("recipientId")); v != "" {
		if !isUUID(v) {
			return service.ListNotificationRequest{}, validationError("recipientId", "must be UUID")
		}
		recipientID = &v
	}

	var eventType *string
	if v := strings.TrimSpace(q.Get("eventType")); v != "" {
		eventType = &v
	}

	var search *string
	if v := strings.TrimSpace(q.Get("search")); v != "" {
		search = &v
	}

	sortBy := strings.TrimSpace(q.Get("sortBy"))
	if sortBy == "" {
		sortBy = domain.SortByCreatedAt
	}
	if sortBy != domain.SortByCreatedAt && sortBy != domain.SortBySentAt && sortBy != domain.SortByStatus {
		return service.ListNotificationRequest{}, validationError("sortBy", "invalid sortBy")
	}

	sortOrder := strings.ToUpper(strings.TrimSpace(q.Get("sortOrder")))
	if sortOrder == "" {
		sortOrder = "DESC"
	}
	if sortOrder != "ASC" && sortOrder != "DESC" {
		return service.ListNotificationRequest{}, validationError("sortOrder", "invalid sortOrder")
	}

	return service.ListNotificationRequest{
		Page:        page,
		PageSize:    pageSize,
		Status:      status,
		Channel:     channel,
		Category:    category,
		RecipientID: recipientID,
		EventType:   eventType,
		Search:      search,
		SortBy:      sortBy,
		SortOrder:   sortOrder,
	}, nil
}

func validationError(field, msg string) error {
	return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "Validation failed", map[string]any{field: msg})
}

func requestID(r *http.Request) string {
	return middleware.RequestIDFromContext(r.Context())
}

func isUUID(value string) bool {
	_, err := uuid.Parse(strings.TrimSpace(value))
	return err == nil
}
