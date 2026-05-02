package router

import (
	"net/http"

	"cart-service/internal/auth"
	"cart-service/internal/config"
	"cart-service/internal/domain"
	"cart-service/internal/handler"
	"cart-service/internal/httpx"
	"cart-service/internal/middleware"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

func New(
	cfg config.Config,
	logger *zap.Logger,
	revocationChecker auth.RevokedTokenChecker,
	cartHandler *handler.CartHandler,
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

	requireJWT := auth.RequireJWT(cfg.JWTAccessSecret, revocationChecker, logger)
	r.Group(func(private chi.Router) {
		private.Use(requireJWT)

		v1 := baseV1 + "/cart"
		legacy := baseLegacy + "/cart"

		private.With(auth.RequireRoles(domain.RoleBuyer, domain.RoleCustomer)).Get(v1, cartHandler.GetCart)
		private.With(auth.RequireRoles(domain.RoleBuyer, domain.RoleCustomer)).Get(legacy, cartHandler.GetCart)

		private.With(auth.RequireRoles(domain.RoleBuyer, domain.RoleCustomer)).Post(v1+"/items", cartHandler.AddItem)
		private.With(auth.RequireRoles(domain.RoleBuyer, domain.RoleCustomer)).Post(legacy+"/items", cartHandler.AddItem)

		private.With(auth.RequireRoles(domain.RoleBuyer, domain.RoleCustomer)).Patch(v1+"/items/{itemId}", cartHandler.UpdateItem)
		private.With(auth.RequireRoles(domain.RoleBuyer, domain.RoleCustomer)).Patch(legacy+"/items/{itemId}", cartHandler.UpdateItem)

		private.With(auth.RequireRoles(domain.RoleBuyer, domain.RoleCustomer)).Delete(v1+"/items/{itemId}", cartHandler.RemoveItem)
		private.With(auth.RequireRoles(domain.RoleBuyer, domain.RoleCustomer)).Delete(legacy+"/items/{itemId}", cartHandler.RemoveItem)

		private.With(auth.RequireRoles(domain.RoleBuyer, domain.RoleCustomer)).Delete(v1, cartHandler.ClearCart)
		private.With(auth.RequireRoles(domain.RoleBuyer, domain.RoleCustomer)).Delete(legacy, cartHandler.ClearCart)

		private.With(auth.RequireRoles(domain.RoleBuyer, domain.RoleCustomer)).Post(v1+"/validate", cartHandler.ValidateCart)
		private.With(auth.RequireRoles(domain.RoleBuyer, domain.RoleCustomer)).Post(legacy+"/validate", cartHandler.ValidateCart)
	})

	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusNotFound, domain.ErrorCodeNotFound, "Route not found", nil)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusMethodNotAllowed, domain.ErrorCodeBadRequest, "Method not allowed", nil)
	})

	return r
}
