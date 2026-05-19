package router

import (
	"net/http"
	"strings"

	"product-service/internal/auth"
	"product-service/internal/config"
	"product-service/internal/domain"
	"product-service/internal/handler"
	"product-service/internal/httpx"
	"product-service/internal/middleware"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

func New(
	cfg config.Config,
	logger *zap.Logger,
	revocationChecker auth.RevokedTokenChecker,
	productHandler *handler.ProductHandler,
	videoHandler *handler.VideoHandler,
	shopDecorHandler *handler.ShopDecorHandler,
	healthHandler *handler.HealthHandler,
) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID())
	r.Use(middleware.Recovery(logger))
	r.Use(middleware.Logger(logger, cfg.AppName))

	requireJWT := auth.RequireJWT(cfg.JWTAccessSecret, revocationChecker, logger)

	prefix := apiPrefix(cfg.APIPrefix)
	mountHealthRoutes(r, prefix, healthHandler)
	mountProductRoutes(r, prefix+"/products", productHandler, requireJWT)
	mountVideoRoutes(r, prefix+"/videos", videoHandler, requireJWT)
	mountModerationVideoRoutes(r, prefix+"/moderation/videos", videoHandler, requireJWT)
	mountShopDecorRoutes(r, prefix+"/shops", shopDecorHandler, requireJWT)

	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusNotFound, domain.ErrorCodeNotFound, "Route not found", nil)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusMethodNotAllowed, domain.ErrorCodeBadRequest, "Method not allowed", nil)
	})

	return r
}

func apiPrefix(value string) string {
	trimmed := strings.Trim(value, "/")
	if trimmed == "" {
		return ""
	}
	return "/" + trimmed
}

func mountHealthRoutes(r chi.Router, prefix string, h *handler.HealthHandler) {
	r.Get(prefix+"/health", h.Health)
	r.Get(prefix+"/ready", h.Ready)
	r.Get(prefix+"/live", h.Live)
}

func mountProductRoutes(r chi.Router, base string, h *handler.ProductHandler, requireJWT func(http.Handler) http.Handler) {
	r.Route(base, func(rr chi.Router) {
		rr.Get("/", h.ListPublicProducts)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleModerator, domain.RoleSuperAdmin)).Get("/my", h.ListManagedProducts)
		rr.Get("/{id}", h.GetPublicProduct)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleSuperAdmin)).Patch("/{id}", h.UpdateProduct)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleAdmin, domain.RoleModerator, domain.RoleSuperAdmin)).Patch("/{id}/status", h.UpdateProductStatus)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleSuperAdmin)).Delete("/{id}", h.DeleteProduct)
	})
	r.Get(base, h.ListPublicProducts)
	r.With(requireJWT, auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleSuperAdmin)).Post(base, h.CreateProduct)
}

func mountVideoRoutes(r chi.Router, base string, h *handler.VideoHandler, requireJWT func(http.Handler) http.Handler) {
	r.Route(base, func(rr chi.Router) {
		rr.Get("/feed", h.ListFeed)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleModerator, domain.RoleSuperAdmin)).Get("/me", h.ListManagedVideos)
		rr.Get("/{videoId}", h.GetPublicVideo)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleSuperAdmin)).Patch("/{videoId}", h.UpdateVideo)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleSuperAdmin)).Post("/{videoId}/media/confirm", h.ConfirmMedia)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleSuperAdmin)).Post("/{videoId}/thumbnail/confirm", h.ConfirmThumbnail)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleSuperAdmin)).Post("/{videoId}/submit-review", h.SubmitReview)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleModerator, domain.RoleAdmin, domain.RoleSuperAdmin)).Post("/{videoId}/publish", h.PublishVideo)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleSuperAdmin)).Post("/{videoId}/unpublish", h.UnpublishVideo)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleSuperAdmin)).Delete("/{videoId}", h.ArchiveVideo)
		rr.Get("/{videoId}/comments", h.ListComments)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleBuyer, domain.RoleCustomer, domain.RoleSeller, domain.RoleAdmin, domain.RoleModerator, domain.RoleSuperAdmin)).Post("/{videoId}/comments", h.CreateComment)
		rr.Post("/{videoId}/events/view-started", h.TrackViewStarted)
		rr.Post("/{videoId}/events/view-qualified", h.TrackViewQualified)
		rr.Post("/{videoId}/events/product-clicked", h.TrackProductClicked)
		rr.Post("/{videoId}/events/add-to-cart", h.TrackAddToCart)
	})
	r.Get(base+"/feed", h.ListFeed)
	r.With(requireJWT, auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleSuperAdmin)).Post(base, h.CreateVideo)
}

func mountModerationVideoRoutes(r chi.Router, base string, h *handler.VideoHandler, requireJWT func(http.Handler) http.Handler) {
	r.Route(base, func(rr chi.Router) {
		rr.With(requireJWT, auth.RequireRoles(domain.RoleModerator, domain.RoleAdmin, domain.RoleSuperAdmin)).Get("/", h.ListReviewQueue)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleModerator, domain.RoleAdmin, domain.RoleSuperAdmin)).Post("/{videoId}/approve", h.ApproveVideo)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleModerator, domain.RoleAdmin, domain.RoleSuperAdmin)).Post("/{videoId}/reject", h.RejectVideo)
	})
	r.With(requireJWT, auth.RequireRoles(domain.RoleModerator, domain.RoleAdmin, domain.RoleSuperAdmin)).Get(base, h.ListReviewQueue)
}

func mountShopDecorRoutes(r chi.Router, base string, h *handler.ShopDecorHandler, requireJWT func(http.Handler) http.Handler) {
	r.Route(base, func(rr chi.Router) {
		rr.With(requireJWT, auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleModerator, domain.RoleSupport, domain.RoleSuperAdmin)).Get("/me/decor", h.GetMyShopDecor)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleModerator, domain.RoleSupport, domain.RoleSuperAdmin)).Patch("/me/decor", h.UpdateMyShopDecor)
		rr.Get("/{sellerId}/decor", h.GetPublicShopDecor)
	})
}
