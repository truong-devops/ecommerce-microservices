package events

import "testing"

func TestEventMessageKeyUsesShipmentIdentity(t *testing.T) {
	tests := []struct {
		name      string
		eventType string
		payload   map[string]any
		want      string
	}{
		{name: "shipment event", eventType: "shipment.status-updated", payload: map[string]any{"shipmentId": " shipment-1 "}, want: "shipment-1"},
		{name: "order fallback", eventType: "shipment.created", payload: map[string]any{"orderId": "order-1"}, want: "order-1"},
		{name: "event type fallback", eventType: "shipment.unknown", payload: map[string]any{}, want: "shipment.unknown"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := string(eventMessageKey(test.eventType, test.payload)); got != test.want {
				t.Fatalf("eventMessageKey() = %q, want %q", got, test.want)
			}
		})
	}
}
