package router

import (
	"net/http"

	"order-service/internal/auth"
	"order-service/internal/config"
	"order-service/internal/domain"
	"order-service/internal/handler"
	"order-service/internal/httpx"
	"order-service/internal/middleware"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

func New(
	cfg config.Config,
	logger *zap.Logger,
	revocationChecker auth.RevokedTokenChecker,
	orderHandler *handler.OrderHandler,
	healthHandler *handler.HealthHandler,
) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID())
	r.Use(middleware.Recovery(logger))
	r.Use(middleware.Logger(logger, cfg.AppName))

	base := "/" + cfg.APIPrefix
	r.Get(base+"/health", healthHandler.Health)
	r.Get(base+"/ready", healthHandler.Ready)
	r.Get(base+"/live", healthHandler.Live)

	requireJWT := auth.RequireJWT(cfg.JWTAccessSecret, revocationChecker, logger)
	requireInternalToken := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			if cfg.InternalServiceToken == "" {
				httpx.WriteError(w, req, http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Internal service token is not configured", nil)
				return
			}
			if req.Header.Get("X-Internal-Service-Token") != cfg.InternalServiceToken {
				httpx.WriteError(w, req, http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Unauthorized", nil)
				return
			}
			next.ServeHTTP(w, req)
		})
	}

	r.Group(func(internal chi.Router) {
		internal.Use(requireInternalToken)
		internal.Get(base+"/orders/internal/completed", orderHandler.ListCompletedOrdersForRecommendation)
	})

	r.Group(func(private chi.Router) {
		private.Use(requireJWT)

		orders := "/" + cfg.APIPrefix + "/orders"
		private.With(auth.RequireRoles(domain.RoleCustomer)).Post(orders, orderHandler.CreateOrder)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Get(orders, orderHandler.ListOrders)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Get(orders+"/{id}", orderHandler.GetOrderByID)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Patch(orders+"/{id}/cancel", orderHandler.CancelOrder)
		private.With(auth.RequireRoles(domain.RoleCustomer)).Patch(orders+"/{id}/confirm-received", orderHandler.ConfirmReceived)
		private.With(auth.RequireRoles(domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Patch(orders+"/{id}/status", orderHandler.UpdateOrderStatus)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Get(orders+"/{id}/history", orderHandler.GetOrderStatusHistory)
	})

	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusNotFound, domain.ErrorCodeNotFound, "Route not found", nil)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusMethodNotAllowed, domain.ErrorCodeBadRequest, "Method not allowed", nil)
	})

	return r
}
