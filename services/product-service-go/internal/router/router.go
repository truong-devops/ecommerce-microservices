package router

import (
	"net/http"

	"product-service-go/internal/auth"
	"product-service-go/internal/config"
	"product-service-go/internal/domain"
	"product-service-go/internal/handler"
	"product-service-go/internal/httpx"
	"product-service-go/internal/middleware"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

func New(
	cfg config.Config,
	logger *zap.Logger,
	revocationChecker auth.RevokedTokenChecker,
	productHandler *handler.ProductHandler,
	videoHandler *handler.VideoHandler,
	healthHandler *handler.HealthHandler,
) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID())
	r.Use(middleware.Recovery(logger))
	r.Use(middleware.Logger(logger, cfg.AppName))

	requireJWT := auth.RequireJWT(cfg.JWTAccessSecret, revocationChecker, logger)

	mountHealthRoutes(r, "", healthHandler)
	mountHealthRoutes(r, "/api", healthHandler)
	mountHealthRoutes(r, "/api/v1", healthHandler)

	mountProductRoutes(r, "/api/v1/products", productHandler, requireJWT)
	mountProductRoutes(r, "/api/products", productHandler, requireJWT)
	mountVideoPublicRoutes(r, "/api/v1/videos", videoHandler)
	mountVideoPublicRoutes(r, "/api/videos", videoHandler)

	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusNotFound, domain.ErrorCodeNotFound, "Route not found", nil)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusMethodNotAllowed, domain.ErrorCodeBadRequest, "Method not allowed", nil)
	})

	return r
}

func mountHealthRoutes(r chi.Router, prefix string, h *handler.HealthHandler) {
	r.Get(prefix+"/health", h.Health)
	r.Get(prefix+"/ready", h.Ready)
	r.Get(prefix+"/live", h.Live)
}

func mountProductRoutes(r chi.Router, base string, h *handler.ProductHandler, requireJWT func(http.Handler) http.Handler) {
	r.Get(base, h.ListPublicProducts)
	r.With(requireJWT, auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleSuperAdmin)).Post(base, h.CreateProduct)

	r.Route(base, func(rr chi.Router) {
		rr.Get("/", h.ListPublicProducts)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleModerator, domain.RoleSuperAdmin)).Get("/my", h.ListManagedProducts)
		rr.Get("/{id}", h.GetPublicProduct)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleSuperAdmin)).Patch("/{id}", h.UpdateProduct)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleAdmin, domain.RoleModerator, domain.RoleSuperAdmin)).Patch("/{id}/status", h.UpdateProductStatus)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleSuperAdmin)).Delete("/{id}", h.DeleteProduct)
	})
}

func mountVideoPublicRoutes(r chi.Router, base string, h *handler.VideoHandler) {
	r.Get(base+"/feed", h.ListFeed)
	r.Route(base, func(rr chi.Router) {
		rr.Get("/feed", h.ListFeed)
		rr.Get("/{videoId}", h.GetPublicVideo)
	})
}
