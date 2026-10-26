package domain

import "testing"

func TestCanTransitionReturnRequestStatus(t *testing.T) {
	tests := []struct {
		name string
		from ReturnRequestStatus
		to   ReturnRequestStatus
		want bool
	}{
		{name: "seller approves", from: ReturnRequestStatusRequested, to: ReturnRequestStatusApproved, want: true},
		{name: "seller rejects", from: ReturnRequestStatusRequested, to: ReturnRequestStatusRejected, want: true},
		{name: "customer ships", from: ReturnRequestStatusApproved, to: ReturnRequestStatusReturning, want: true},
		{name: "seller receives", from: ReturnRequestStatusReturning, to: ReturnRequestStatusRefundPending, want: true},
		{name: "wallet credit closes return", from: ReturnRequestStatusRefundPending, to: ReturnRequestStatusRefunded, want: true},
		{name: "cannot skip customer shipment", from: ReturnRequestStatusApproved, to: ReturnRequestStatusRefundPending, want: false},
		{name: "cannot receive before approval", from: ReturnRequestStatusRequested, to: ReturnRequestStatusReturning, want: false},
		{name: "refunded is terminal", from: ReturnRequestStatusRefunded, to: ReturnRequestStatusReturning, want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := CanTransitionReturnRequestStatus(test.from, test.to); got != test.want {
				t.Fatalf("CanTransitionReturnRequestStatus(%s, %s) = %v, want %v", test.from, test.to, got, test.want)
			}
		})
	}
}
