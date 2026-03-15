package proxy

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"time"

	"api-gateway/internal/middleware"
	apperrors "api-gateway/pkg/errors"
	"api-gateway/pkg/response"

	"go.uber.org/zap"
)

type ServiceProxy struct {
	name    string
	timeout time.Duration
	proxy   *httputil.ReverseProxy
	logger  *zap.Logger
}

func NewServiceProxy(name, rawURL string, timeout time.Duration, logger *zap.Logger) (*ServiceProxy, error) {
	targetURL, err := url.Parse(rawURL)
	if err != nil {
		return nil, fmt.Errorf("parse target URL for %s: %w", name, err)
	}

	reverseProxy := httputil.NewSingleHostReverseProxy(targetURL)
	originalDirector := reverseProxy.Director

	reverseProxy.Transport = &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           (&net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          200,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		ResponseHeaderTimeout: timeout,
	}

	reverseProxy.Director = func(req *http.Request) {
		originalDirector(req)

		requestID := middleware.RequestIDFromContext(req.Context())
		if requestID != "" {
			req.Header.Set(middleware.HeaderRequestID, requestID)
		}

		if req.Header.Get("X-Forwarded-Proto") == "" {
			proto := "http"
			if req.TLS != nil {
				proto = "https"
			}
			req.Header.Set("X-Forwarded-Proto", proto)
		}
	}

	reverseProxy.ErrorHandler = func(w http.ResponseWriter, req *http.Request, err error) {
		requestID := middleware.RequestIDFromContext(req.Context())
		if isTimeoutError(err) || errors.Is(req.Context().Err(), context.DeadlineExceeded) {
			response.Error(w, http.StatusGatewayTimeout, apperrors.CodeUpstreamTimeout, "Upstream timeout", requestID)
			return
		}

		logger.Error("upstream proxy error",
			zap.String("service", name),
			zap.String("target", rawURL),
			zap.String("request_id", requestID),
			zap.Error(err),
		)
		response.Error(w, http.StatusBadGateway, apperrors.CodeBadGateway, "Upstream service error", requestID)
	}

	return &ServiceProxy{
		name:    name,
		timeout: timeout,
		proxy:   reverseProxy,
		logger:  logger,
	}, nil
}

func (s *ServiceProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), s.timeout)
	defer cancel()

	s.proxy.ServeHTTP(w, r.WithContext(ctx))
}

func (s *ServiceProxy) Name() string {
	return s.name
}

func isTimeoutError(err error) bool {
	var netErr net.Error
	if errors.As(err, &netErr) {
		return netErr.Timeout()
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	return false
}
