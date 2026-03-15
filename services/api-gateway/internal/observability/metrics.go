package observability

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus"
)

type Metrics struct {
	RequestTotal    *prometheus.CounterVec
	RequestDuration *prometheus.HistogramVec
}

type recorder struct {
	http.ResponseWriter
	status int
}

func (r *recorder) WriteHeader(statusCode int) {
	r.status = statusCode
	r.ResponseWriter.WriteHeader(statusCode)
}

func NewMetrics(appName string) *Metrics {
	requestTotal := prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name:        "api_gateway_http_requests_total",
			Help:        "Total HTTP requests handled by the API gateway",
			ConstLabels: prometheus.Labels{"app": appName},
		},
		[]string{"method", "route", "status"},
	)

	requestDuration := prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:        "api_gateway_http_request_duration_seconds",
			Help:        "HTTP request duration in seconds",
			ConstLabels: prometheus.Labels{"app": appName},
			Buckets:     prometheus.DefBuckets,
		},
		[]string{"method", "route", "status"},
	)

	mustRegister(requestTotal)
	mustRegister(requestDuration)

	return &Metrics{
		RequestTotal:    requestTotal,
		RequestDuration: requestDuration,
	}
}

func PrometheusMiddleware(metrics *Metrics) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rw := &recorder{ResponseWriter: w, status: http.StatusOK}

			next.ServeHTTP(rw, r)

			routePattern := "unknown"
			if rc := chi.RouteContext(r.Context()); rc != nil {
				if p := rc.RoutePattern(); p != "" {
					routePattern = p
				}
			}

			status := strconv.Itoa(rw.status)
			metrics.RequestTotal.WithLabelValues(r.Method, routePattern, status).Inc()
			metrics.RequestDuration.WithLabelValues(r.Method, routePattern, status).Observe(time.Since(start).Seconds())
		})
	}
}

func mustRegister(collector prometheus.Collector) {
	if err := prometheus.Register(collector); err != nil {
		var alreadyRegisteredErr prometheus.AlreadyRegisteredError
		if !errors.As(err, &alreadyRegisteredErr) {
			panic(err)
		}
	}
}
