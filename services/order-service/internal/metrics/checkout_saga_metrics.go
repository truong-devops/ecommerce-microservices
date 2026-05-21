package metrics

import (
	"fmt"
	"net/http"
	"sync/atomic"
)

type CheckoutSagaMetrics struct {
	startedTotal        atomic.Uint64
	confirmedTotal      atomic.Uint64
	failedTotal         atomic.Uint64
	duplicateEventTotal atomic.Uint64
	durationCount       atomic.Uint64
	durationSumMillis   atomic.Uint64
	stuckPendingTotal   atomic.Int64
}

func NewCheckoutSagaMetrics() *CheckoutSagaMetrics {
	return &CheckoutSagaMetrics{}
}

func (m *CheckoutSagaMetrics) IncStarted() {
	if m != nil {
		m.startedTotal.Add(1)
	}
}

func (m *CheckoutSagaMetrics) IncConfirmed() {
	if m != nil {
		m.confirmedTotal.Add(1)
	}
}

func (m *CheckoutSagaMetrics) IncFailed() {
	if m != nil {
		m.failedTotal.Add(1)
	}
}

func (m *CheckoutSagaMetrics) IncDuplicateEvent() {
	if m != nil {
		m.duplicateEventTotal.Add(1)
	}
}

func (m *CheckoutSagaMetrics) ObserveDurationMillis(ms int64) {
	if m == nil || ms < 0 {
		return
	}
	m.durationCount.Add(1)
	m.durationSumMillis.Add(uint64(ms))
}

func (m *CheckoutSagaMetrics) SetStuckPendingTotal(value int) {
	if m != nil {
		m.stuckPendingTotal.Store(int64(value))
	}
}

func (m *CheckoutSagaMetrics) Handler() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		_, _ = fmt.Fprintf(w, "# TYPE checkout_saga_started_total counter\ncheckout_saga_started_total %d\n", m.startedTotal.Load())
		_, _ = fmt.Fprintf(w, "# TYPE checkout_saga_confirmed_total counter\ncheckout_saga_confirmed_total %d\n", m.confirmedTotal.Load())
		_, _ = fmt.Fprintf(w, "# TYPE checkout_saga_failed_total counter\ncheckout_saga_failed_total %d\n", m.failedTotal.Load())
		_, _ = fmt.Fprintf(w, "# TYPE checkout_saga_duplicate_event_total counter\ncheckout_saga_duplicate_event_total %d\n", m.duplicateEventTotal.Load())
		_, _ = fmt.Fprintf(w, "# TYPE checkout_saga_duration_milliseconds summary\ncheckout_saga_duration_milliseconds_count %d\n", m.durationCount.Load())
		_, _ = fmt.Fprintf(w, "checkout_saga_duration_milliseconds_sum %d\n", m.durationSumMillis.Load())
		_, _ = fmt.Fprintf(w, "# TYPE checkout_saga_stuck_pending_total gauge\ncheckout_saga_stuck_pending_total %d\n", m.stuckPendingTotal.Load())
	}
}
