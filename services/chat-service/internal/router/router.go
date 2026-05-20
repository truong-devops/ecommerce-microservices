package router

import (
	"net/http"

	"chat-service/internal/auth"
	"chat-service/internal/config"
	"chat-service/internal/domain"
	"chat-service/internal/handler"
	"chat-service/internal/httpx"
	"chat-service/internal/middleware"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

func New(
	cfg config.Config,
	logger *zap.Logger,
	revocationChecker auth.RevokedTokenChecker,
	chatHandler *handler.ChatHandler,
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

	r.Group(func(private chi.Router) {
		private.Use(requireJWT)

		chatBase := "/" + cfg.APIPrefix + "/chat"
		private.With(auth.RequireRoles(domain.RoleModerator, domain.RoleAdmin, domain.RoleSupport, domain.RoleSuperAdmin)).Get(chatBase+"/violations", chatHandler.ListViolations)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleBuyer, domain.RoleSeller, domain.RoleAdmin, domain.RoleSupport, domain.RoleSuperAdmin)).Post(chatBase+"/conversations", chatHandler.CreateConversation)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleBuyer, domain.RoleSeller, domain.RoleAdmin, domain.RoleSupport, domain.RoleSuperAdmin)).Get(chatBase+"/conversations", chatHandler.ListConversations)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleBuyer, domain.RoleSeller, domain.RoleAdmin, domain.RoleSupport, domain.RoleSuperAdmin)).Get(chatBase+"/conversations/{id}/messages", chatHandler.ListMessages)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleBuyer, domain.RoleSeller, domain.RoleAdmin, domain.RoleSupport, domain.RoleSuperAdmin)).Post(chatBase+"/conversations/{id}/messages", chatHandler.SendMessage)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleBuyer, domain.RoleSeller, domain.RoleAdmin, domain.RoleSupport, domain.RoleSuperAdmin)).Post(chatBase+"/conversations/{id}/read", chatHandler.MarkRead)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleBuyer, domain.RoleSeller, domain.RoleAdmin, domain.RoleSupport, domain.RoleSuperAdmin)).Get(chatBase+"/ws", chatHandler.WebSocket)
	})

	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusNotFound, domain.ErrorCodeNotFound, "Route not found", nil)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusMethodNotAllowed, domain.ErrorCodeBadRequest, "Method not allowed", nil)
	})

	return r
}
