package router

import (
	"net/http"

	"review-service-go/internal/auth"
	"review-service-go/internal/config"
	"review-service-go/internal/domain"
	"review-service-go/internal/handler"
	"review-service-go/internal/httpx"
	"review-service-go/internal/middleware"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

func New(
	cfg config.Config,
	logger *zap.Logger,
	revocationChecker auth.RevokedTokenChecker,
	reviewHandler *handler.ReviewHandler,
	healthHandler *handler.HealthHandler,
) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID())
	r.Use(middleware.Recovery(logger))
	r.Use(middleware.Logger(logger))

	requireJWT := auth.RequireJWT(cfg.JWTAccessSecret, revocationChecker, logger)
	optionalJWT := auth.OptionalJWT(cfg.JWTAccessSecret, revocationChecker, logger)

	// Compatibility health routes
	r.Get("/health", healthHandler.Health)
	r.Get("/ready", healthHandler.Ready)
	r.Get("/live", healthHandler.Live)
	r.Get("/api/v1/health", healthHandler.Health)
	r.Get("/api/v1/ready", healthHandler.Ready)
	r.Get("/api/v1/live", healthHandler.Live)
	r.Get("/api/health", healthHandler.Health)
	r.Get("/api/ready", healthHandler.Ready)
	r.Get("/api/live", healthHandler.Live)

	mountReviewRoutes(r, "/api/v1/reviews", reviewHandler, requireJWT, optionalJWT)
	mountReviewRoutes(r, "/api/reviews", reviewHandler, requireJWT, optionalJWT)

	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusNotFound, domain.ErrorCodeNotFound, "Route not found", nil)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusMethodNotAllowed, domain.ErrorCodeBadRequest, "Method not allowed", nil)
	})

	return r
}

func mountReviewRoutes(
	r chi.Router,
	base string,
	h *handler.ReviewHandler,
	requireJWT func(http.Handler) http.Handler,
	optionalJWT func(http.Handler) http.Handler,
) {
	r.With(optionalJWT).Get(base, h.ListReviews)
	r.With(requireJWT, auth.RequireRoles(domain.RoleCustomer)).Post(base, h.CreateReview)

	r.Route(base, func(rr chi.Router) {
		rr.With(optionalJWT).Get("/", h.ListReviews)
		rr.With(optionalJWT).Get("/products/{productId}/summary", h.GetProductSummary)
		rr.With(optionalJWT).Get("/{id}", h.GetReviewByID)

		rr.With(requireJWT, auth.RequireRoles(domain.RoleCustomer)).Post("/", h.CreateReview)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleCustomer)).Patch("/{id}", h.UpdateReview)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleCustomer)).Delete("/{id}", h.DeleteReview)

		rr.With(requireJWT, auth.RequireRoles(domain.RoleAdmin, domain.RoleSupport, domain.RoleSuperAdmin)).Patch("/{id}/moderation", h.ModerateReview)
		rr.With(requireJWT, auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleSupport, domain.RoleSuperAdmin)).Post("/{id}/reply", h.ReplyReview)
	})
}
