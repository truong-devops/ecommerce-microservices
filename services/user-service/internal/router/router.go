package router

import (
	"net/http"

	"user-service-go/internal/auth"
	"user-service-go/internal/config"
	"user-service-go/internal/domain"
	"user-service-go/internal/handler"
	"user-service-go/internal/httpx"
	"user-service-go/internal/middleware"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

func New(
	cfg config.Config,
	logger *zap.Logger,
	revocationChecker auth.RevokedTokenChecker,
	userHandler *handler.UserHandler,
	healthHandler *handler.HealthHandler,
) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID())
	r.Use(middleware.Recovery(logger))
	r.Use(middleware.Logger(logger, cfg.AppName+"-go"))

	// Compatibility routes for old API shape.
	r.Get("/api/health", healthHandler.Health)
	r.Get("/api/v1/health", healthHandler.Health)
	r.Get("/api/ready", healthHandler.Ready)
	r.Get("/api/v1/ready", healthHandler.Ready)

	requireJWT := auth.RequireJWT(cfg.JWTAccessSecret, revocationChecker, logger)
	r.Group(func(private chi.Router) {
		private.Use(requireJWT)
		mountUsersRoutes(private, "/api/users", userHandler)
		mountUsersRoutes(private, "/api/v1/users", userHandler)
	})

	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusNotFound, domain.ErrorCodeUserNotFound, "Route not found", nil)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusMethodNotAllowed, domain.ErrorCodeValidationError, "Method not allowed", nil)
	})

	return r
}

func mountUsersRoutes(r chi.Router, base string, h *handler.UserHandler) {
	r.With(auth.RequireRoles(auth.RoleAdmin, auth.RoleSupport, auth.RoleSuperAdmin)).Post(base, h.CreateUser)
	r.With(auth.RequireRoles(auth.RoleAdmin, auth.RoleSupport, auth.RoleSuperAdmin)).Get(base, h.ListUsers)
	r.With(auth.RequireSelfOrRoles("id", auth.RoleAdmin, auth.RoleSupport, auth.RoleSuperAdmin)).Get(base+"/{id}", h.GetUserByID)
	r.With(auth.RequireSelfOrRoles("id", auth.RoleAdmin, auth.RoleSuperAdmin)).Patch(base+"/{id}", h.UpdateUser)
	r.With(auth.RequireRoles(auth.RoleAdmin, auth.RoleSupport, auth.RoleSuperAdmin)).Patch(base+"/{id}/status", h.UpdateUserStatus)
	r.With(auth.RequireRoles(auth.RoleAdmin, auth.RoleSuperAdmin)).Delete(base+"/{id}", h.DeleteUser)
}
