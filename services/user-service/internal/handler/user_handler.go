package handler

import (
	"net/http"
	"strconv"
	"strings"

	"user-service-go/internal/auth"
	"user-service-go/internal/domain"
	"user-service-go/internal/httpx"
	"user-service-go/internal/service"

	"github.com/go-chi/chi/v5"
)

type UserHandler struct {
	userService *service.UserService
}

func NewUserHandler(userService *service.UserService) *UserHandler {
	return &UserHandler{userService: userService}
}

func (h *UserHandler) CreateUser(w http.ResponseWriter, r *http.Request) {
	var req service.CreateUserRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationError, "Validation failed", map[string]any{"body": err.Error()})
		return
	}

	user, err := h.userService.Create(r.Context(), req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusCreated, user)
}

func (h *UserHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	query, err := parseListUsersQuery(r)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalError)
		return
	}

	users, pagination, err := h.userService.List(r.Context(), query)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalError)
		return
	}

	httpx.WriteSuccessWithPagination(w, r, http.StatusOK, users, httpx.Pagination{
		Page:       pagination.Page,
		PageSize:   pagination.PageSize,
		TotalItems: pagination.TotalItems,
		TotalPages: pagination.TotalPages,
	})
}

func (h *UserHandler) GetUserByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	user, err := h.userService.FindOne(r.Context(), id)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, user)
}

func (h *UserHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	session, ok := auth.UserFromContext(r.Context())
	if !ok || strings.TrimSpace(session.UserID) == "" {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	user, err := h.userService.ResolveSelf(r.Context(), session.UserID, session.Email, session.Role)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalError)
		return
	}
	httpx.WriteSuccess(w, r, http.StatusOK, user)
}

func (h *UserHandler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req service.UpdateUserRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationError, "Validation failed", map[string]any{"body": err.Error()})
		return
	}

	updated, err := h.userService.Update(r.Context(), id, req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, updated)
}

func (h *UserHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	session, ok := auth.UserFromContext(r.Context())
	if !ok || strings.TrimSpace(session.UserID) == "" {
		httpx.WriteError(w, r, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
		return
	}

	var req service.UpdateUserRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationError, "Validation failed", map[string]any{"body": err.Error()})
		return
	}

	updated, err := h.userService.UpdateSelf(r.Context(), session.UserID, session.Email, session.Role, req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, updated)
}

func (h *UserHandler) UpdateUserStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req service.UpdateUserStatusRequest
	if err := httpx.DecodeJSONStrict(r, &req); err != nil {
		httpx.WriteError(w, r, http.StatusBadRequest, domain.ErrorCodeValidationError, "Validation failed", map[string]any{"body": err.Error()})
		return
	}

	updated, err := h.userService.UpdateStatus(r.Context(), id, req)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, updated)
}

func (h *UserHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	deleted, err := h.userService.Remove(r.Context(), id)
	if err != nil {
		httpx.WriteAppError(w, r, err, domain.ErrorCodeInternalError)
		return
	}

	httpx.WriteSuccess(w, r, http.StatusOK, deleted)
}

func parseListUsersQuery(r *http.Request) (domain.ListUsersQuery, error) {
	q := r.URL.Query()
	page := 1
	pageSize := 10

	if v := strings.TrimSpace(q.Get("page")); v != "" {
		parsed, err := strconv.Atoi(v)
		if err != nil || parsed < 1 {
			return domain.ListUsersQuery{}, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationError, "Validation failed", map[string]any{"page": "must be an integer >= 1"})
		}
		page = parsed
	}

	if v := strings.TrimSpace(q.Get("pageSize")); v != "" {
		parsed, err := strconv.Atoi(v)
		if err != nil || parsed < 1 || parsed > 100 {
			return domain.ListUsersQuery{}, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationError, "Validation failed", map[string]any{"pageSize": "must be an integer between 1 and 100"})
		}
		pageSize = parsed
	}

	search := strings.TrimSpace(q.Get("search"))

	var role *domain.UserRole
	if v := strings.TrimSpace(q.Get("role")); v != "" {
		parsed := domain.UserRole(v)
		if !domain.IsValidRole(parsed) {
			return domain.ListUsersQuery{}, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationError, "Validation failed", map[string]any{"role": "invalid role"})
		}
		role = &parsed
	}

	var status *domain.UserStatus
	if v := strings.TrimSpace(q.Get("status")); v != "" {
		parsed := domain.UserStatus(v)
		if !domain.IsValidStatus(parsed) {
			return domain.ListUsersQuery{}, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationError, "Validation failed", map[string]any{"status": "invalid status"})
		}
		status = &parsed
	}

	sortBy := strings.TrimSpace(q.Get("sortBy"))
	if sortBy == "" {
		sortBy = "createdAt"
	}
	switch sortBy {
	case "createdAt", "updatedAt", "email", "firstName", "lastName":
	default:
		return domain.ListUsersQuery{}, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationError, "Validation failed", map[string]any{"sortBy": "invalid sortBy"})
	}

	sortOrder := strings.ToUpper(strings.TrimSpace(q.Get("sortOrder")))
	if sortOrder == "" {
		sortOrder = "DESC"
	}
	if sortOrder != "ASC" && sortOrder != "DESC" {
		return domain.ListUsersQuery{}, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationError, "Validation failed", map[string]any{"sortOrder": "invalid sortOrder"})
	}

	return domain.ListUsersQuery{
		Page:      page,
		PageSize:  pageSize,
		Search:    search,
		Role:      role,
		Status:    status,
		SortBy:    sortBy,
		SortOrder: sortOrder,
	}, nil
}
