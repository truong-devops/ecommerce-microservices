package events

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"wallet-service/internal/domain"

	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

type fakeWalletEventHandler struct {
	capturedCalls  int
	captured       domain.PaymentCapturedEvent
	reversedCalls  int
	reversed       domain.PaymentReversedEvent
	deliveredCalls int
	delivered      domain.OrderDeliveredEvent
	meta           domain.EventMeta
}

func (f *fakeWalletEventHandler) HandlePaymentCaptured(_ context.Context, event domain.PaymentCapturedEvent, meta domain.EventMeta) (bool, error) {
	f.capturedCalls++
	f.captured = event
	f.meta = meta
	return true, nil
}

func (f *fakeWalletEventHandler) HandlePaymentReversed(_ context.Context, event domain.PaymentReversedEvent, meta domain.EventMeta) (bool, error) {
	f.reversedCalls++
	f.reversed = event
	f.meta = meta
	return true, nil
}

func (f *fakeWalletEventHandler) HandleOrderDelivered(_ context.Context, event domain.OrderDeliveredEvent, meta domain.EventMeta) (bool, error) {
	f.deliveredCalls++
	f.delivered = event
	f.meta = meta
	return true, nil
}

func TestHandlePaymentCapturedEvent(t *testing.T) {
	handler := &fakeWalletEventHandler{}
	consumer := &Consumer{handler: handler, logger: zap.NewNop()}
	message := kafka.Message{
		Topic: "payment.events", Partition: 2, Offset: 19,
		Value: mustJSON(t, map[string]any{
			"eventId": "evt-payment-1", "eventType": "payment.captured", "occurredAt": "2026-10-11T08:00:00Z",
			"payload": map[string]any{
				"paymentId": "22222222-2222-4222-8222-222222222222",
				"orderId":   "33333333-3333-4333-8333-333333333333",
				"sellerId":  "11111111-1111-4111-8111-111111111111",
				"amount":    125000, "currency": "VND",
				"metadata": map[string]any{"requestId": "req-1"},
			},
		}),
	}

	if err := consumer.handlePaymentMessage(context.Background(), message); err != nil {
		t.Fatalf("handle payment message: %v", err)
	}
	if handler.capturedCalls != 1 || handler.captured.Amount != 125000 {
		t.Fatalf("unexpected captured event: %+v", handler.captured)
	}
	if handler.meta.EventID != "evt-payment-1" || handler.meta.RequestID != "req-1" || handler.meta.OffsetValue != 19 {
		t.Fatalf("unexpected event meta: %+v", handler.meta)
	}
}

func TestHandlePaymentRefundEvent(t *testing.T) {
	handler := &fakeWalletEventHandler{}
	consumer := &Consumer{handler: handler, logger: zap.NewNop()}
	message := kafka.Message{Value: mustJSON(t, map[string]any{
		"eventId": "evt-refund-1", "eventType": "payment.partially-refunded",
		"payload": map[string]any{
			"paymentId": "22222222-2222-4222-8222-222222222222",
			"orderId":   "33333333-3333-4333-8333-333333333333",
			"sellerId":  "11111111-1111-4111-8111-111111111111",
			"amount":    125000, "refundedAmount": 25000, "currency": "VND",
		},
	})}

	if err := consumer.handlePaymentMessage(context.Background(), message); err != nil {
		t.Fatalf("handle refund message: %v", err)
	}
	if handler.reversedCalls != 1 || handler.reversed.RefundedAmount != 25000 || handler.reversed.IsChargeback {
		t.Fatalf("unexpected reversed event: %+v", handler.reversed)
	}
}

func TestHandleOrderDeliveredUsesEnvelopeTime(t *testing.T) {
	handler := &fakeWalletEventHandler{}
	consumer := &Consumer{handler: handler, logger: zap.NewNop()}
	message := kafka.Message{Topic: "order.events", Value: mustJSON(t, map[string]any{
		"eventId": "evt-order-1", "eventType": "order.delivered", "occurredAt": "2026-10-11T09:15:00Z",
		"payload": map[string]any{
			"orderId":  "33333333-3333-4333-8333-333333333333",
			"sellerId": "11111111-1111-4111-8111-111111111111",
		},
	})}

	if err := consumer.handleOrderMessage(context.Background(), message); err != nil {
		t.Fatalf("handle order message: %v", err)
	}
	want := time.Date(2026, 10, 11, 9, 15, 0, 0, time.UTC)
	if handler.deliveredCalls != 1 || !handler.delivered.DeliveredAt.Equal(want) {
		t.Fatalf("unexpected delivered event: %+v", handler.delivered)
	}
}

func TestConsumerSkipsMalformedRelevantEvent(t *testing.T) {
	handler := &fakeWalletEventHandler{}
	consumer := &Consumer{handler: handler, logger: zap.NewNop()}
	message := kafka.Message{Value: mustJSON(t, map[string]any{
		"eventType": "payment.captured",
		"payload":   map[string]any{"paymentId": "missing-amount"},
	})}

	if err := consumer.handlePaymentMessage(context.Background(), message); err != nil {
		t.Fatalf("malformed event should be skipped, got %v", err)
	}
	if handler.capturedCalls != 0 {
		t.Fatalf("expected no handler calls, got %d", handler.capturedCalls)
	}
}

func mustJSON(t *testing.T, value any) []byte {
	t.Helper()
	result, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal fixture: %v", err)
	}
	return result
}
