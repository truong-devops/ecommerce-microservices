package router

import (
	"net/http"

	"notification-service/internal/auth"
	"notification-service/internal/config"
	"notification-service/internal/domain"
	"notification-service/internal/handler"
	"notification-service/internal/httpx"
	"notification-service/internal/middleware"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

func New(
	cfg config.Config,
	logger *zap.Logger,
	revocationChecker auth.RevokedTokenChecker,
	notificationHandler *handler.NotificationHandler,
	healthHandler *handler.HealthHandler,
) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID())
	r.Use(middleware.Recovery(logger))
	r.Use(middleware.Logger(logger, cfg.AppName))

	healthBase := "/" + cfg.APIPrefix
	r.Get(healthBase+"/health", healthHandler.Health)
	r.Get(healthBase+"/ready", healthHandler.Ready)
	r.Get(healthBase+"/live", healthHandler.Live)

	requireJWT := auth.RequireJWT(cfg.JWTAccessSecret, revocationChecker, logger)

	r.Group(func(private chi.Router) {
		private.Use(requireJWT)

		base := "/" + cfg.APIPrefix + "/notifications"
		private.With(auth.RequireRoles(domain.RoleAdmin, domain.RoleSupport, domain.RoleSuperAdmin)).Post(base, notificationHandler.CreateManualNotifications)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Get(base, notificationHandler.ListNotifications)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Get(base+"/{id}", notificationHandler.GetNotificationByID)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Patch(base+"/{id}/read", notificationHandler.MarkNotificationAsRead)
	})

	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusNotFound, domain.ErrorCodeNotFound, "Route not found", nil)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusMethodNotAllowed, domain.ErrorCodeBadRequest, "Method not allowed", nil)
	})

	return r
}
