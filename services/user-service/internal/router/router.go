package router

import (
	"net/http"

	"user-service-go/internal/config"
	"user-service-go/internal/domain"
	"user-service-go/internal/handler"
	"user-service-go/internal/httpx"
	"user-service-go/internal/middleware"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

func New(cfg config.Config, logger *zap.Logger, userHandler *handler.UserHandler, healthHandler *handler.HealthHandler) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID())
	r.Use(middleware.Recovery(logger))
	r.Use(middleware.Logger(logger, cfg.AppName+"-go"))

	// Compatibility routes for old API shape.
	r.Get("/api/health", healthHandler.Health)
	r.Get("/api/v1/health", healthHandler.Health)
	r.Get("/api/ready", healthHandler.Ready)
	r.Get("/api/v1/ready", healthHandler.Ready)

	mountUsersRoutes(r, "/api/users", userHandler)
	mountUsersRoutes(r, "/api/v1/users", userHandler)

	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusNotFound, domain.ErrorCodeUserNotFound, "Route not found", nil)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusMethodNotAllowed, domain.ErrorCodeValidationError, "Method not allowed", nil)
	})

	return r
}

func mountUsersRoutes(r chi.Router, base string, h *handler.UserHandler) {
	r.Post(base, h.CreateUser)
	r.Get(base, h.ListUsers)
	r.Get(base+"/{id}", h.GetUserByID)
	r.Patch(base+"/{id}", h.UpdateUser)
	r.Patch(base+"/{id}/status", h.UpdateUserStatus)
	r.Delete(base+"/{id}", h.DeleteUser)
}
