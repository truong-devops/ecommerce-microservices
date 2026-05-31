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
