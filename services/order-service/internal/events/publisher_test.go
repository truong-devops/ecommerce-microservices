package events

import "testing"

func TestEventMessageKeyUsesOrderIdentity(t *testing.T) {
	tests := []struct {
		name      string
		eventType string
		payload   map[string]any
		want      string
	}{
		{name: "order event", eventType: "order.created", payload: map[string]any{"orderId": " order-1 "}, want: "order-1"},
		{name: "return fallback", eventType: "order.return-shipped", payload: map[string]any{"returnRequestId": "return-1"}, want: "return-1"},
		{name: "event type fallback", eventType: "order.unknown", payload: map[string]any{}, want: "order.unknown"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := string(eventMessageKey(test.eventType, test.payload)); got != test.want {
				t.Fatalf("eventMessageKey() = %q, want %q", got, test.want)
			}
		})
	}
}
