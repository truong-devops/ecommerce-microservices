package router

import (
	"net/http"

	"payment-service-go/internal/auth"
	"payment-service-go/internal/config"
	"payment-service-go/internal/domain"
	"payment-service-go/internal/handler"
	"payment-service-go/internal/httpx"
	"payment-service-go/internal/middleware"

	"github.com/go-chi/chi/v5"
	"go.uber.org/zap"
)

func New(
	cfg config.Config,
	logger *zap.Logger,
	revocationChecker auth.RevokedTokenChecker,
	paymentHandler *handler.PaymentHandler,
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
	r.Post(base+"/payments/webhooks/{provider}", paymentHandler.HandleProviderWebhook)

	requireJWT := auth.RequireJWT(cfg.JWTAccessSecret, revocationChecker, logger)

	r.Group(func(private chi.Router) {
		private.Use(requireJWT)

		payments := "/" + cfg.APIPrefix + "/payments"
		private.With(auth.RequireRoles(domain.RoleCustomer)).Post(payments+"/intents", paymentHandler.CreatePaymentIntent)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Get(payments, paymentHandler.ListPayments)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Get(payments+"/order/{orderId}", paymentHandler.GetPaymentByOrderID)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Get(payments+"/{id}", paymentHandler.GetPaymentByID)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleAdmin, domain.RoleSupport, domain.RoleSuperAdmin)).Post(payments+"/{id}/refunds", paymentHandler.CreateRefund)
		private.With(auth.RequireRoles(domain.RoleCustomer, domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin)).Get(payments+"/{id}/refunds", paymentHandler.ListRefunds)
	})

	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusNotFound, domain.ErrorCodeNotFound, "Route not found", nil)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, req *http.Request) {
		httpx.WriteError(w, req, http.StatusMethodNotAllowed, domain.ErrorCodeBadRequest, "Method not allowed", nil)
	})

	return r
}
