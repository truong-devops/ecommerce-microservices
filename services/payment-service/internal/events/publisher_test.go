package events

import "testing"

func TestEventMessageKeyUsesPaymentIdentity(t *testing.T) {
	tests := []struct {
		name      string
		eventType string
		payload   map[string]any
		want      string
	}{
		{name: "payment event", eventType: "payment.refunded", payload: map[string]any{"paymentId": " payment-1 "}, want: "payment-1"},
		{name: "order fallback", eventType: "payment.unknown", payload: map[string]any{"orderId": "order-1"}, want: "order-1"},
		{name: "event type fallback", eventType: "payment.unknown", payload: map[string]any{}, want: "payment.unknown"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := string(eventMessageKey(test.eventType, test.payload)); got != test.want {
				t.Fatalf("eventMessageKey() = %q, want %q", got, test.want)
			}
		})
	}
}
