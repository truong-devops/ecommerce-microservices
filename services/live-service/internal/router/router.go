package router

import (
	"net/http"

	"live-service/internal/auth"
	"live-service/internal/config"
	"live-service/internal/domain"
	"live-service/internal/handler"
	"live-service/internal/httpx"
	"live-service/internal/middleware"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

func New(
	cfg config.Config,
	logger *zap.Logger,
	revocationChecker auth.RevokedTokenChecker,
	liveHandler *handler.LiveHandler,
	wsHandler *handler.WSHandler,
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
	optionalJWT := auth.OptionalJWT(cfg.JWTAccessSecret, revocationChecker, logger)
	sellerRoles := auth.RequireRoles(domain.RoleSeller, domain.RoleAdmin, domain.RoleSuperAdmin)

	liveBase := base + "/live"
	r.Get(liveBase+"/sessions", liveHandler.ListPublicSessions)
	r.With(optionalJWT).Get(liveBase+"/sessions/{sessionId}", liveHandler.GetSession)
	r.Get(liveBase+"/sessions/{sessionId}/products", liveHandler.ListPinnedProducts)
	r.With(optionalJWT).Get(liveBase+"/sessions/{sessionId}/messages", liveHandler.ListMessages)
	r.With(optionalJWT).Post(liveBase+"/sessions/{sessionId}/events/product-clicked", liveHandler.TrackProductClicked)
	r.With(optionalJWT).Post(liveBase+"/sessions/{sessionId}/events/media-metric", liveHandler.TrackMediaMetric)
	r.With(optionalJWT).Get(liveBase+"/ws", wsHandler.WebSocket)

	r.Group(func(private chi.Router) {
		private.Use(requireJWT)
		private.With(sellerRoles).Post(liveBase+"/sessions", liveHandler.CreateSession)
		private.With(sellerRoles).Get(liveBase+"/sessions/my", liveHandler.ListMySessions)
		private.With(sellerRoles).Patch(liveBase+"/sessions/{sessionId}", liveHandler.UpdateSession)
		private.With(sellerRoles).Patch(liveBase+"/sessions/{sessionId}/start", liveHandler.StartSession)
		private.With(sellerRoles).Patch(liveBase+"/sessions/{sessionId}/pause", liveHandler.PauseSession)
		private.With(sellerRoles).Patch(liveBase+"/sessions/{sessionId}/end", liveHandler.EndSession)
		private.With(sellerRoles).Patch(liveBase+"/sessions/{sessionId}/cancel", liveHandler.CancelSession)
		private.With(sellerRoles).Post(liveBase+"/sessions/{sessionId}/products", liveHandler.PinProduct)
		private.With(sellerRoles).Delete(liveBase+"/sessions/{sessionId}/products/{productId}", liveHandler.UnpinProduct)
	})

	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusNotFound, domain.ErrorCodeNotFound, "Route not found", nil)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusMethodNotAllowed, domain.ErrorCodeBadRequest, "Method not allowed", nil)
	})

	return r
}
