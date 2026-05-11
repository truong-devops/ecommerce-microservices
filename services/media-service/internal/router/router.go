package router

import (
	"net/http"

	"media-service/internal/auth"
	"media-service/internal/config"
	"media-service/internal/domain"
	"media-service/internal/handler"
	"media-service/internal/httpx"
	"media-service/internal/middleware"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

func New(
	cfg config.Config,
	logger *zap.Logger,
	mediaHandler *handler.MediaHandler,
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

	requireJWT := auth.RequireJWT(cfg.JWTAccessSecret, nil, logger)
	r.Group(func(private chi.Router) {
		private.Use(requireJWT)

		v1 := baseV1 + "/media"
		legacy := baseLegacy + "/media"

		private.With(auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleModerator, domain.RoleSuperAdmin)).Post(v1+"/presign-upload", mediaHandler.PresignUpload)
		private.With(auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleModerator, domain.RoleSuperAdmin)).Post(legacy+"/presign-upload", mediaHandler.PresignUpload)

		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleSeller, domain.RoleAdmin, domain.RoleModerator, domain.RoleSuperAdmin)).Post(v1+"/presign-download", mediaHandler.PresignDownload)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleSeller, domain.RoleAdmin, domain.RoleModerator, domain.RoleSuperAdmin)).Post(legacy+"/presign-download", mediaHandler.PresignDownload)

		private.With(auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleModerator, domain.RoleSuperAdmin)).Delete(v1, mediaHandler.DeleteObject)
		private.With(auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleModerator, domain.RoleSuperAdmin)).Delete(legacy, mediaHandler.DeleteObject)
	})

	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusNotFound, domain.ErrorCodeNotFound, "Route not found", nil)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusMethodNotAllowed, domain.ErrorCodeBadRequest, "Method not allowed", nil)
	})

	return r
}
