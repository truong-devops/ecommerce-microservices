package router

import (
	"net/http"

	"analytics-service/internal/auth"
	"analytics-service/internal/config"
	"analytics-service/internal/domain"
	"analytics-service/internal/handler"
	"analytics-service/internal/httpx"
	"analytics-service/internal/middleware"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

func New(cfg config.Config, logger *zap.Logger, revocationChecker auth.RevokedTokenChecker, analyticsHandler *handler.AnalyticsHandler, healthHandler *handler.HealthHandler) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID())
	r.Use(middleware.Recovery(logger))
	r.Use(middleware.Logger(logger, cfg.AppName))

	r.Get("/"+cfg.APIPrefix+"/health", healthHandler.Health)
	r.Get("/"+cfg.APIPrefix+"/ready", healthHandler.Ready)
	r.Get("/"+cfg.APIPrefix+"/live", healthHandler.Live)
	r.Get("/api/health", healthHandler.Health)
	r.Get("/api/ready", healthHandler.Ready)
	r.Get("/api/live", healthHandler.Live)

	requireJWT := auth.RequireJWT(cfg.JWTAccessSecret, revocationChecker, logger)
	readRoles := auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleSupport, domain.RoleSuperAdmin)

	r.Group(func(private chi.Router) {
		private.Use(requireJWT)
		baseV1 := "/" + cfg.APIPrefix + "/analytics"
		private.With(readRoles).Get(baseV1+"/overview", analyticsHandler.GetOverview)
		private.With(readRoles).Get(baseV1+"/events/timeseries", analyticsHandler.GetTimeseries)
		private.With(readRoles).Get(baseV1+"/payments/summary", analyticsHandler.GetPaymentsSummary)
		private.With(readRoles).Get(baseV1+"/shipping/summary", analyticsHandler.GetShippingSummary)
		private.With(readRoles).Get(baseV1+"/videos/summary", analyticsHandler.GetVideoSummary)

		baseLegacy := "/api/analytics"
		private.With(readRoles).Get(baseLegacy+"/overview", analyticsHandler.GetOverview)
		private.With(readRoles).Get(baseLegacy+"/events/timeseries", analyticsHandler.GetTimeseries)
		private.With(readRoles).Get(baseLegacy+"/payments/summary", analyticsHandler.GetPaymentsSummary)
		private.With(readRoles).Get(baseLegacy+"/shipping/summary", analyticsHandler.GetShippingSummary)
		private.With(readRoles).Get(baseLegacy+"/videos/summary", analyticsHandler.GetVideoSummary)
	})

	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusNotFound, domain.ErrorCodeNotFound, "Route not found", nil)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusMethodNotAllowed, domain.ErrorCodeBadRequest, "Method not allowed", nil)
	})

	return r
}
