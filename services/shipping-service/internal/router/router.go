package router

import (
	"net/http"

	"shipping-service/internal/auth"
	"shipping-service/internal/config"
	"shipping-service/internal/domain"
	"shipping-service/internal/handler"
	"shipping-service/internal/httpx"
	"shipping-service/internal/middleware"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

func New(
	cfg config.Config,
	logger *zap.Logger,
	revocationChecker auth.RevokedTokenChecker,
	shippingHandler *handler.ShippingHandler,
	healthHandler *handler.HealthHandler,
) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID())
	r.Use(middleware.Recovery(logger))
	r.Use(middleware.Logger(logger, cfg.AppName))

	baseV1 := "/" + cfg.APIPrefix
	baseLegacy := "/api"

	r.Get(baseV1+"/health", healthHandler.Health)
	r.Get(baseV1+"/ready", healthHandler.Ready)
	r.Get(baseV1+"/live", healthHandler.Live)
	r.Get(baseLegacy+"/health", healthHandler.Health)
	r.Get(baseLegacy+"/ready", healthHandler.Ready)
	r.Get(baseLegacy+"/live", healthHandler.Live)

	r.Post(baseV1+"/shipments/webhooks/{provider}", shippingHandler.HandleProviderWebhook)
	r.Post(baseLegacy+"/shipments/webhooks/{provider}", shippingHandler.HandleProviderWebhook)

	requireJWT := auth.RequireJWT(cfg.JWTAccessSecret, revocationChecker, logger)
	r.Group(func(private chi.Router) {
		private.Use(requireJWT)

		v1 := baseV1 + "/shipments"
		legacy := baseLegacy + "/shipments"

		private.With(auth.RequireRoles(domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Post(v1, shippingHandler.CreateShipment)
		private.With(auth.RequireRoles(domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Post(legacy, shippingHandler.CreateShipment)

		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Get(v1, shippingHandler.ListShipments)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Get(legacy, shippingHandler.ListShipments)

		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Get(v1+"/order/{orderId}", shippingHandler.GetShipmentByOrderID)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Get(legacy+"/order/{orderId}", shippingHandler.GetShipmentByOrderID)

		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Get(v1+"/{id}", shippingHandler.GetShipmentByID)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Get(legacy+"/{id}", shippingHandler.GetShipmentByID)

		private.With(auth.RequireRoles(domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Patch(v1+"/{id}/status", shippingHandler.UpdateShipmentStatus)
		private.With(auth.RequireRoles(domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Patch(legacy+"/{id}/status", shippingHandler.UpdateShipmentStatus)

		private.With(auth.RequireRoles(domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Post(v1+"/{id}/tracking-events", shippingHandler.AddTrackingEvent)
		private.With(auth.RequireRoles(domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Post(legacy+"/{id}/tracking-events", shippingHandler.AddTrackingEvent)

		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Get(v1+"/{id}/tracking-events", shippingHandler.GetTrackingEvents)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Get(legacy+"/{id}/tracking-events", shippingHandler.GetTrackingEvents)
	})

	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusNotFound, domain.ErrorCodeNotFound, "Route not found", nil)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusMethodNotAllowed, domain.ErrorCodeBadRequest, "Method not allowed", nil)
	})

	return r
}
