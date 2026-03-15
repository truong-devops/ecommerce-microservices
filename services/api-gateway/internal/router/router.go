package router

import (
	"fmt"
	"net/http"

	"api-gateway/internal/auth"
	"api-gateway/internal/config"
	"api-gateway/internal/handlers"
	"api-gateway/internal/middleware"
	"api-gateway/internal/observability"
	"api-gateway/internal/proxy"
	apperrors "api-gateway/pkg/errors"
	"api-gateway/pkg/response"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.uber.org/zap"
)

func New(cfg *config.Config, logger *zap.Logger, metrics *observability.Metrics) (http.Handler, error) {
	proxies, err := buildProxies(cfg, logger)
	if err != nil {
		return nil, err
	}

	healthHandler := handlers.NewHealthHandler(cfg, logger)
	jwtMiddleware := auth.Middleware(cfg.JWTSecret, logger)

	r := chi.NewRouter()
	r.Use(middleware.RequestID())
	r.Use(middleware.Recovery(logger))
	r.Use(middleware.Logger(logger))
	r.Use(middleware.Timeout(cfg.Server.RequestTimeout))
	r.Use(middleware.CORS(cfg.CORSAllowedOrigins))
	r.Use(middleware.RateLimit(cfg.RateLimit.RPS, cfg.RateLimit.Burst))
	r.Use(observability.PrometheusMiddleware(metrics))

	r.Get("/health", healthHandler.Health)
	r.Get("/ready", healthHandler.Ready)
	r.Get("/live", healthHandler.Live)
	r.Handle("/metrics", promhttp.Handler())

	r.Group(func(public chi.Router) {
		public.Method(http.MethodPost, "/api/auth/login", proxies[config.ServiceAuth])
		public.Method(http.MethodPost, "/api/auth/register", proxies[config.ServiceAuth])

		public.Method(http.MethodGet, "/api/products", proxies[config.ServiceProduct])
		public.Method(http.MethodGet, "/api/products/*", proxies[config.ServiceProduct])

		public.Method(http.MethodGet, "/api/reviews", proxies[config.ServiceReview])
		public.Method(http.MethodGet, "/api/reviews/*", proxies[config.ServiceReview])
	})

	r.Group(func(private chi.Router) {
		private.Use(jwtMiddleware)

		mountPrefix(private, "/api/auth", proxies[config.ServiceAuth])
		mountPrefix(private, "/api/users", proxies[config.ServiceUser])
		mountPrefix(private, "/api/cart", proxies[config.ServiceCart])
		mountPrefix(private, "/api/orders", proxies[config.ServiceOrder])
		mountPrefix(private, "/api/payments", proxies[config.ServicePayment])
		mountPrefix(private, "/api/inventory", proxies[config.ServiceInventory])
		mountPrefix(private, "/api/shipping", proxies[config.ServiceShipping])
		mountPrefix(private, "/api/notifications", proxies[config.ServiceNotification])
		mountPrefix(private, "/api/analytics", proxies[config.ServiceAnalytics])

		mountMethodPrefix(private, http.MethodPost, "/api/products", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodPut, "/api/products", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodPatch, "/api/products", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodDelete, "/api/products", proxies[config.ServiceProduct])

		mountMethodPrefix(private, http.MethodPost, "/api/reviews", proxies[config.ServiceReview])
		mountMethodPrefix(private, http.MethodPut, "/api/reviews", proxies[config.ServiceReview])
		mountMethodPrefix(private, http.MethodPatch, "/api/reviews", proxies[config.ServiceReview])
		mountMethodPrefix(private, http.MethodDelete, "/api/reviews", proxies[config.ServiceReview])
	})

	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		response.Error(w, http.StatusNotFound, apperrors.CodeNotFound, "Route not found", middleware.RequestIDFromContext(r.Context()))
	})

	r.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
		response.Error(w, http.StatusMethodNotAllowed, apperrors.CodeBadRequest, "Method not allowed", middleware.RequestIDFromContext(r.Context()))
	})

	return r, nil
}

func buildProxies(cfg *config.Config, logger *zap.Logger) (map[string]http.Handler, error) {
	handlers := make(map[string]http.Handler, len(cfg.Services))

	for serviceName, serviceCfg := range cfg.Services {
		serviceProxy, err := proxy.NewServiceProxy(serviceName, serviceCfg.URL, serviceCfg.Timeout, logger)
		if err != nil {
			return nil, fmt.Errorf("create proxy for service %s: %w", serviceName, err)
		}
		handlers[serviceName] = serviceProxy
	}

	return handlers, nil
}

func mountPrefix(r chi.Router, prefix string, h http.Handler) {
	r.Handle(prefix, h)
	r.Handle(prefix+"/", h)
	r.Handle(prefix+"/*", h)
}

func mountMethodPrefix(r chi.Router, method, prefix string, h http.Handler) {
	r.Method(method, prefix, h)
	r.Method(method, prefix+"/", h)
	r.Method(method, prefix+"/*", h)
}
