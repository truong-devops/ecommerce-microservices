package router

import (
	"net/http"

	"wallet-service/internal/auth"
	"wallet-service/internal/config"
	"wallet-service/internal/domain"
	"wallet-service/internal/handler"
	"wallet-service/internal/httpx"
	"wallet-service/internal/middleware"
	"wallet-service/internal/observability"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

func New(cfg config.Config, logger *zap.Logger, revocationChecker auth.RevokedTokenChecker, walletHandler *handler.WalletHandler, payoutHandler *handler.PayoutHandler, healthHandler *handler.HealthHandler, metrics *observability.Metrics) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID())
	r.Use(middleware.Recovery(logger))
	r.Use(middleware.Logger(logger, cfg.AppName))

	base := "/" + cfg.APIPrefix
	r.Get(base+"/health", healthHandler.Health)
	r.Get(base+"/ready", healthHandler.Ready)
	r.Get(base+"/live", healthHandler.Live)
	r.Get("/metrics", metrics.Handler)

	requireJWT := auth.RequireJWT(cfg.JWTAccessSecret, revocationChecker, logger)
	r.Group(func(private chi.Router) {
		private.Use(requireJWT)
		private.With(auth.RequireRoles(domain.RoleSeller)).Get(base+"/wallets/me", walletHandler.GetMyWallet)
		private.With(auth.RequireRoles(domain.RoleSeller)).Get(base+"/wallets/me/transactions", walletHandler.ListMyTransactions)
		private.With(auth.RequireRoles(domain.RoleSeller)).Get(base+"/wallets/me/bank-account", payoutHandler.GetBankAccount)
		private.With(auth.RequireRoles(domain.RoleSeller)).Put(base+"/wallets/me/bank-account", payoutHandler.UpsertBankAccount)
		private.With(auth.RequireRoles(domain.RoleSeller)).Post(base+"/payouts", payoutHandler.CreatePayout)
		private.With(auth.RequireRoles(domain.RoleSeller)).Get(base+"/payouts", payoutHandler.ListPayouts)
		private.With(auth.RequireRoles(domain.RoleSeller)).Get(base+"/payouts/summary", payoutHandler.GetPayoutSummary)
		private.With(auth.RequireRoles(domain.RoleSeller)).Get(base+"/payouts/{payoutID}", payoutHandler.GetPayout)
	})

	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusNotFound, domain.ErrorCodeNotFound, "Route not found", nil)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusMethodNotAllowed, domain.ErrorCodeBadRequest, "Method not allowed", nil)
	})
	return r
}
