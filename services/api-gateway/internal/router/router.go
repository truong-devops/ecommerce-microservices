package router

import (
	"fmt"
	"net/http"
	"strings"

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

func New(
	cfg *config.Config,
	logger *zap.Logger,
	metrics *observability.Metrics,
	revocationChecker auth.RevokedTokenChecker,
) (http.Handler, error) {
	proxies, err := buildProxies(cfg, logger)
	if err != nil {
		return nil, err
	}

	healthHandler := handlers.NewHealthHandler(cfg, logger)
	buyerExperienceHandler := handlers.NewBuyerExperienceHandler(
		cfg.Services[config.ServiceProduct].URL,
		cfg.Services[config.ServiceProduct].Timeout,
	)
	buyerReviewHandler := handlers.NewBuyerReviewHandler(
		cfg.Services[config.ServiceOrder].URL,
		cfg.Services[config.ServiceReview].URL,
		cfg.Services[config.ServiceReview].Timeout,
	)
	jwtMiddleware := auth.Middleware(cfg.JWTSecret, revocationChecker, logger)

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
		public.Method(http.MethodPost, "/api/auth/refresh-token", proxies[config.ServiceAuth])
		public.Method(http.MethodPost, "/api/auth/verify-email", proxies[config.ServiceAuth])
		public.Method(http.MethodPost, "/api/auth/resend-verify-email", proxies[config.ServiceAuth])
		public.Method(http.MethodPost, "/api/auth/forgot-password", proxies[config.ServiceAuth])
		public.Method(http.MethodPost, "/api/auth/reset-password", proxies[config.ServiceAuth])
		public.Method(http.MethodPost, "/api/v1/auth/login", proxies[config.ServiceAuth])
		public.Method(http.MethodPost, "/api/v1/auth/register", proxies[config.ServiceAuth])
		public.Method(http.MethodPost, "/api/v1/auth/refresh-token", proxies[config.ServiceAuth])
		public.Method(http.MethodPost, "/api/v1/auth/verify-email", proxies[config.ServiceAuth])
		public.Method(http.MethodPost, "/api/v1/auth/resend-verify-email", proxies[config.ServiceAuth])
		public.Method(http.MethodPost, "/api/v1/auth/forgot-password", proxies[config.ServiceAuth])
		public.Method(http.MethodPost, "/api/v1/auth/reset-password", proxies[config.ServiceAuth])
		public.Method(http.MethodGet, "/api/auth/oauth/google/authorize", proxies[config.ServiceAuth])
		public.Method(http.MethodGet, "/api/v1/auth/oauth/google/authorize", proxies[config.ServiceAuth])
		public.Method(http.MethodGet, "/api/auth/oauth/google/callback", proxies[config.ServiceAuth])
		public.Method(http.MethodGet, "/api/v1/auth/oauth/google/callback", proxies[config.ServiceAuth])
		public.Method(http.MethodPost, "/api/auth/oauth/exchange-ticket", proxies[config.ServiceAuth])
		public.Method(http.MethodPost, "/api/v1/auth/oauth/exchange-ticket", proxies[config.ServiceAuth])

		public.Get("/api/v1/buyer-experience/home", buyerExperienceHandler.Home)
		public.Get("/api/v1/buyer-experience/products", buyerExperienceHandler.Products)
		public.Get("/api/v1/buyer-experience/products/{productId}", buyerExperienceHandler.ProductDetail)
		public.Get("/api/v1/buyer-experience/shops/{sellerId}", buyerExperienceHandler.Shop)

		public.Method(http.MethodGet, "/api/products", proxies[config.ServiceProduct])
		public.Method(http.MethodGet, "/api/products/*", proxies[config.ServiceProduct])
		public.Method(http.MethodGet, "/api/v1/products", proxies[config.ServiceProduct])
		public.Method(http.MethodGet, "/api/v1/products/*", proxies[config.ServiceProduct])
		public.Method(http.MethodGet, "/api/inventory/validate", proxies[config.ServiceInventory])
		public.Method(http.MethodGet, "/api/v1/inventory/validate", proxies[config.ServiceInventory])
		public.Method(http.MethodGet, "/api/shops", proxies[config.ServiceProduct])
		public.Method(http.MethodGet, "/api/shops/*", proxies[config.ServiceProduct])
		public.Method(http.MethodGet, "/api/v1/shops", proxies[config.ServiceProduct])
		public.Method(http.MethodGet, "/api/v1/shops/*", proxies[config.ServiceProduct])
		public.Method(http.MethodGet, "/api/videos", proxies[config.ServiceProduct])
		public.Method(http.MethodGet, "/api/videos/*", proxies[config.ServiceProduct])
		public.Method(http.MethodGet, "/api/v1/videos", proxies[config.ServiceProduct])
		public.Method(http.MethodGet, "/api/v1/videos/*", proxies[config.ServiceProduct])
		public.Method(http.MethodPost, "/api/videos/{videoId}/events/view-started", proxies[config.ServiceProduct])
		public.Method(http.MethodPost, "/api/videos/{videoId}/events/view-qualified", proxies[config.ServiceProduct])
		public.Method(http.MethodPost, "/api/videos/{videoId}/events/product-clicked", proxies[config.ServiceProduct])
		public.Method(http.MethodPost, "/api/videos/{videoId}/events/add-to-cart", proxies[config.ServiceProduct])
		public.Method(http.MethodPost, "/api/v1/videos/{videoId}/events/view-started", proxies[config.ServiceProduct])
		public.Method(http.MethodPost, "/api/v1/videos/{videoId}/events/view-qualified", proxies[config.ServiceProduct])
		public.Method(http.MethodPost, "/api/v1/videos/{videoId}/events/product-clicked", proxies[config.ServiceProduct])
		public.Method(http.MethodPost, "/api/v1/videos/{videoId}/events/add-to-cart", proxies[config.ServiceProduct])

		public.Method(http.MethodGet, "/api/reviews", proxies[config.ServiceReview])
		public.Method(http.MethodGet, "/api/reviews/*", proxies[config.ServiceReview])
		public.Method(http.MethodGet, "/api/v1/reviews", proxies[config.ServiceReview])
		public.Method(http.MethodGet, "/api/v1/reviews/*", proxies[config.ServiceReview])
		public.Method(http.MethodGet, "/api/chat/ws", proxies[config.ServiceChat])
		public.Method(http.MethodGet, "/api/v1/chat/ws", proxies[config.ServiceChat])
		public.Method(http.MethodGet, "/api/live/sessions", proxies[config.ServiceLive])
		public.Method(http.MethodGet, "/api/live/sessions/*", proxies[config.ServiceLive])
		public.Method(http.MethodGet, "/api/v1/live/sessions", proxies[config.ServiceLive])
		public.Method(http.MethodGet, "/api/v1/live/sessions/*", proxies[config.ServiceLive])
		public.Method(http.MethodGet, "/api/live/ws", proxies[config.ServiceLive])
		public.Method(http.MethodGet, "/api/v1/live/ws", proxies[config.ServiceLive])
		public.Method(http.MethodPost, "/api/live/sessions/{sessionId}/events/product-clicked", proxies[config.ServiceLive])
		public.Method(http.MethodPost, "/api/v1/live/sessions/{sessionId}/events/product-clicked", proxies[config.ServiceLive])
		public.Method(http.MethodPost, "/api/live/sessions/{sessionId}/events/media-metric", proxies[config.ServiceLive])
		public.Method(http.MethodPost, "/api/v1/live/sessions/{sessionId}/events/media-metric", proxies[config.ServiceLive])
		public.Method(http.MethodGet, "/api/analytics/recommendations/products/{productId}", proxies[config.ServiceAnalytics])
		public.Method(http.MethodGet, "/api/v1/analytics/recommendations/products/{productId}", proxies[config.ServiceAnalytics])
		public.Method(http.MethodPost, "/api/payments/webhooks/sepay", proxies[config.ServicePayment])
		public.Method(http.MethodPost, "/api/v1/payments/webhooks/sepay", proxies[config.ServicePayment])
		public.Method(http.MethodPost, "/api/v1/shipments/webhooks/nexus", proxies[config.ServiceShipping])

		public.Method(http.MethodGet, "/api/v1/buyer-experience/videos/feed", rewritePathPrefix("/api/v1/buyer-experience/videos", "/api/v1/videos", proxies[config.ServiceProduct]))
		public.Method(http.MethodGet, "/api/v1/buyer-experience/videos/*", rewritePathPrefix("/api/v1/buyer-experience/videos", "/api/v1/videos", proxies[config.ServiceProduct]))
		public.Method(http.MethodPost, "/api/v1/buyer-experience/videos/{videoId}/events/view-started", rewritePathPrefix("/api/v1/buyer-experience/videos", "/api/v1/videos", proxies[config.ServiceProduct]))
		public.Method(http.MethodPost, "/api/v1/buyer-experience/videos/{videoId}/events/view-qualified", rewritePathPrefix("/api/v1/buyer-experience/videos", "/api/v1/videos", proxies[config.ServiceProduct]))
		public.Method(http.MethodPost, "/api/v1/buyer-experience/videos/{videoId}/events/product-clicked", rewritePathPrefix("/api/v1/buyer-experience/videos", "/api/v1/videos", proxies[config.ServiceProduct]))
		public.Method(http.MethodPost, "/api/v1/buyer-experience/videos/{videoId}/events/add-to-cart", rewritePathPrefix("/api/v1/buyer-experience/videos", "/api/v1/videos", proxies[config.ServiceProduct]))

		public.Method(http.MethodGet, "/api/v1/buyer-experience/live/sessions", rewritePathPrefix("/api/v1/buyer-experience/live", "/api/v1/live", proxies[config.ServiceLive]))
		public.Method(http.MethodGet, "/api/v1/buyer-experience/live/sessions/*", rewritePathPrefix("/api/v1/buyer-experience/live", "/api/v1/live", proxies[config.ServiceLive]))
		public.Method(http.MethodGet, "/api/v1/buyer-experience/live/ws", rewritePathPrefix("/api/v1/buyer-experience/live", "/api/v1/live", proxies[config.ServiceLive]))
		public.Method(http.MethodPost, "/api/v1/buyer-experience/live/sessions/{sessionId}/events/product-clicked", rewritePathPrefix("/api/v1/buyer-experience/live", "/api/v1/live", proxies[config.ServiceLive]))
		public.Method(http.MethodPost, "/api/v1/buyer-experience/live/sessions/{sessionId}/events/media-metric", rewritePathPrefix("/api/v1/buyer-experience/live", "/api/v1/live", proxies[config.ServiceLive]))
	})

	r.Group(func(private chi.Router) {
		private.Use(jwtMiddleware)

		mountPrefix(private, "/api/auth", proxies[config.ServiceAuth])
		mountPrefix(private, "/api/v1/auth", proxies[config.ServiceAuth])
		mountPrefix(private, "/api/users", proxies[config.ServiceUser])
		mountPrefix(private, "/api/v1/users", proxies[config.ServiceUser])
		mountPrefix(private, "/api/media", proxies[config.ServiceMedia])
		mountPrefix(private, "/api/v1/media", proxies[config.ServiceMedia])
		mountPrefix(private, "/api/cart", proxies[config.ServiceCart])
		mountPrefix(private, "/api/v1/cart", proxies[config.ServiceCart])
		mountPrefix(private, "/api/orders", proxies[config.ServiceOrder])
		mountPrefix(private, "/api/v1/orders", proxies[config.ServiceOrder])
		mountPrefix(private, "/api/payments", proxies[config.ServicePayment])
		mountPrefix(private, "/api/v1/payments", proxies[config.ServicePayment])
		mountPrefix(private, "/api/inventory", proxies[config.ServiceInventory])
		mountPrefix(private, "/api/v1/inventory", proxies[config.ServiceInventory])
		mountPrefix(private, "/api/shipping", proxies[config.ServiceShipping])
		mountPrefix(private, "/api/v1/shipping", proxies[config.ServiceShipping])
		mountPrefix(private, "/api/shipments", proxies[config.ServiceShipping])
		mountPrefix(private, "/api/v1/shipments", proxies[config.ServiceShipping])
		mountPrefix(private, "/api/notifications", proxies[config.ServiceNotification])
		mountPrefix(private, "/api/v1/notifications", proxies[config.ServiceNotification])
		mountPrefix(private, "/api/analytics", proxies[config.ServiceAnalytics])
		mountPrefix(private, "/api/v1/analytics", proxies[config.ServiceAnalytics])
		mountPrefix(private, "/api/chat", proxies[config.ServiceChat])
		mountPrefix(private, "/api/v1/chat", proxies[config.ServiceChat])
		mountPrefix(private, "/api/live", proxies[config.ServiceLive])
		mountPrefix(private, "/api/v1/live", proxies[config.ServiceLive])
		private.Post("/api/v1/buyer-experience/reviews", buyerReviewHandler.Create)
		private.Method(http.MethodPost, "/api/v1/buyer-experience/videos/{videoId}/comments", rewritePathPrefix("/api/v1/buyer-experience/videos", "/api/v1/videos", proxies[config.ServiceProduct]))
		mountPrefix(private, "/api/moderation/videos", proxies[config.ServiceProduct])
		mountPrefix(private, "/api/v1/moderation/videos", proxies[config.ServiceProduct])

		mountMethodPrefix(private, http.MethodPost, "/api/products", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodPut, "/api/products", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodPatch, "/api/products", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodDelete, "/api/products", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodPost, "/api/shops", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodPut, "/api/shops", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodPatch, "/api/shops", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodDelete, "/api/shops", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodPost, "/api/videos", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodPut, "/api/videos", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodPatch, "/api/videos", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodDelete, "/api/videos", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodPost, "/api/v1/products", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodPut, "/api/v1/products", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodPatch, "/api/v1/products", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodDelete, "/api/v1/products", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodPost, "/api/v1/shops", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodPut, "/api/v1/shops", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodPatch, "/api/v1/shops", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodDelete, "/api/v1/shops", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodPost, "/api/v1/videos", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodPut, "/api/v1/videos", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodPatch, "/api/v1/videos", proxies[config.ServiceProduct])
		mountMethodPrefix(private, http.MethodDelete, "/api/v1/videos", proxies[config.ServiceProduct])

		mountMethodPrefix(private, http.MethodPost, "/api/reviews", proxies[config.ServiceReview])
		mountMethodPrefix(private, http.MethodPut, "/api/reviews", proxies[config.ServiceReview])
		mountMethodPrefix(private, http.MethodPatch, "/api/reviews", proxies[config.ServiceReview])
		mountMethodPrefix(private, http.MethodDelete, "/api/reviews", proxies[config.ServiceReview])
		mountMethodPrefix(private, http.MethodPost, "/api/v1/reviews", proxies[config.ServiceReview])
		mountMethodPrefix(private, http.MethodPut, "/api/v1/reviews", proxies[config.ServiceReview])
		mountMethodPrefix(private, http.MethodPatch, "/api/v1/reviews", proxies[config.ServiceReview])
		mountMethodPrefix(private, http.MethodDelete, "/api/v1/reviews", proxies[config.ServiceReview])
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

func rewritePathPrefix(from, to string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, from) {
			cloned := r.Clone(r.Context())
			cloned.URL.Path = to + strings.TrimPrefix(r.URL.Path, from)
			next.ServeHTTP(w, cloned)
			return
		}
		next.ServeHTTP(w, r)
	})
}
