package events

import "testing"

func TestEventMessageKeyUsesWalletIdentity(t *testing.T) {
	tests := []struct {
		name      string
		eventType string
		payload   map[string]any
		want      string
	}{
		{name: "wallet event", eventType: "wallet.customer-refund-credited", payload: map[string]any{"walletId": " wallet-1 "}, want: "wallet-1"},
		{name: "payment fallback", eventType: "wallet.payment-refunded", payload: map[string]any{"paymentId": "payment-1"}, want: "payment-1"},
		{name: "event type fallback", eventType: "wallet.unknown", payload: map[string]any{}, want: "wallet.unknown"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := string(eventMessageKey(test.eventType, test.payload)); got != test.want {
				t.Fatalf("eventMessageKey() = %q, want %q", got, test.want)
			}
		})
	}
}
