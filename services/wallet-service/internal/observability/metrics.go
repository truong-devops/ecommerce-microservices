package observability

import (
	"fmt"
	"net/http"
	"sync/atomic"
)

type Metrics struct {
	payoutRequested atomic.Uint64
	payoutSucceeded atomic.Uint64
	payoutFailed    atomic.Uint64
	providerRetries atomic.Uint64
}

func NewMetrics() *Metrics { return &Metrics{} }

func (m *Metrics) RecordPayoutRequested() { m.payoutRequested.Add(1) }
func (m *Metrics) RecordPayoutCompleted(status string) {
	if status == "SUCCEEDED" {
		m.payoutSucceeded.Add(1)
	}
	if status == "FAILED" {
		m.payoutFailed.Add(1)
	}
}
func (m *Metrics) RecordProviderRetry() { m.providerRetries.Add(1) }

func (m *Metrics) Handler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	_, _ = fmt.Fprintf(w, "# TYPE wallet_payout_requested_total counter\nwallet_payout_requested_total %d\n", m.payoutRequested.Load())
	_, _ = fmt.Fprintf(w, "# TYPE wallet_payout_processed_total counter\nwallet_payout_processed_total{status=\"succeeded\"} %d\nwallet_payout_processed_total{status=\"failed\"} %d\n", m.payoutSucceeded.Load(), m.payoutFailed.Load())
	_, _ = fmt.Fprintf(w, "# TYPE wallet_payout_provider_retries_total counter\nwallet_payout_provider_retries_total %d\n", m.providerRetries.Load())
}
