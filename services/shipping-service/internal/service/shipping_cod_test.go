package service

import "testing"

func TestCODAmountForPaymentMethod(t *testing.T) {
	totalAmount := 235000.0

	tests := []struct {
		name          string
		paymentMethod string
		totalAmount   *float64
		want          float64
	}{
		{
			name:          "online payment has no carrier collection",
			paymentMethod: "ONLINE",
			totalAmount:   &totalAmount,
			want:          0,
		},
		{
			name:          "cod payment collects order total",
			paymentMethod: "COD",
			totalAmount:   &totalAmount,
			want:          235000,
		},
		{
			name:          "missing total has no carrier collection",
			paymentMethod: "COD",
			totalAmount:   nil,
			want:          0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := codAmountForPaymentMethod(tt.paymentMethod, tt.totalAmount)
			if got != tt.want {
				t.Fatalf("expected %.2f, got %.2f", tt.want, got)
			}
		})
	}
}

func TestShipmentTrackingURLFromNexusMetadata(t *testing.T) {
	metadata := map[string]any{"nexus": map[string]any{"trackingUrl": "https://tracking.nexus.test/RET001"}}
	if got := shipmentTrackingURL(metadata); got != "https://tracking.nexus.test/RET001" {
		t.Fatalf("unexpected tracking URL: %s", got)
	}
	if got := shipmentTrackingURL(map[string]any{}); got != "" {
		t.Fatalf("expected empty tracking URL, got %s", got)
	}
}
