package router

import (
	"net/http"

	"inventory-service/internal/auth"
	"inventory-service/internal/config"
	"inventory-service/internal/domain"
	"inventory-service/internal/handler"
	"inventory-service/internal/httpx"
	"inventory-service/internal/middleware"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

func New(
	cfg config.Config,
	logger *zap.Logger,
	revocationChecker auth.RevokedTokenChecker,
	inventoryHandler *handler.InventoryHandler,
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

	r.Get(baseV1+"/inventory/validate", inventoryHandler.ValidateStock)
	r.Get(baseLegacy+"/inventory/validate", inventoryHandler.ValidateStock)

	requireJWT := auth.RequireJWT(cfg.JWTAccessSecret, revocationChecker, logger)
	r.Group(func(private chi.Router) {
		private.Use(requireJWT)

		v1 := baseV1 + "/inventory"
		legacy := baseLegacy + "/inventory"

		private.With(auth.RequireRoles(domain.RoleSeller, domain.RoleWarehouse, domain.RoleAdmin, domain.RoleSuperAdmin)).
			Get(v1+"/stocks/{sku}", inventoryHandler.GetStockBySKU)
		private.With(auth.RequireRoles(domain.RoleSeller, domain.RoleWarehouse, domain.RoleAdmin, domain.RoleSuperAdmin)).
			Get(legacy+"/stocks/{sku}", inventoryHandler.GetStockBySKU)

		private.With(auth.RequireRoles(domain.RoleSeller, domain.RoleWarehouse, domain.RoleAdmin, domain.RoleSuperAdmin)).
			Patch(v1+"/stocks/{sku}/adjust", inventoryHandler.AdjustStock)
		private.With(auth.RequireRoles(domain.RoleSeller, domain.RoleWarehouse, domain.RoleAdmin, domain.RoleSuperAdmin)).
			Patch(legacy+"/stocks/{sku}/adjust", inventoryHandler.AdjustStock)

		private.With(auth.RequireRoles(domain.RoleAdmin, domain.RoleWarehouse, domain.RoleSuperAdmin)).
			Post(v1+"/reservations", inventoryHandler.ReserveInventory)
		private.With(auth.RequireRoles(domain.RoleAdmin, domain.RoleWarehouse, domain.RoleSuperAdmin)).
			Post(legacy+"/reservations", inventoryHandler.ReserveInventory)

		private.With(auth.RequireRoles(domain.RoleAdmin, domain.RoleWarehouse, domain.RoleSuperAdmin)).
			Post(v1+"/reservations/{orderId}/release", inventoryHandler.ReleaseReservations)
		private.With(auth.RequireRoles(domain.RoleAdmin, domain.RoleWarehouse, domain.RoleSuperAdmin)).
			Post(legacy+"/reservations/{orderId}/release", inventoryHandler.ReleaseReservations)

		private.With(auth.RequireRoles(domain.RoleAdmin, domain.RoleWarehouse, domain.RoleSuperAdmin)).
			Post(v1+"/reservations/{orderId}/confirm", inventoryHandler.ConfirmReservations)
		private.With(auth.RequireRoles(domain.RoleAdmin, domain.RoleWarehouse, domain.RoleSuperAdmin)).
			Post(legacy+"/reservations/{orderId}/confirm", inventoryHandler.ConfirmReservations)
	})

	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusNotFound, domain.ErrorCodeNotFound, "Route not found", nil)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusMethodNotAllowed, domain.ErrorCodeBadRequest, "Method not allowed", nil)
	})

	return r
}
