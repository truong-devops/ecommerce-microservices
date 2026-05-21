package events

import (
	"context"
	"encoding/json"
	"testing"

	"inventory-service/internal/service"

	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

type fakeInventoryService struct {
	reservedEvent service.OrderCreatedEvent
	reservedMeta  service.EventMeta
	reserveCalls  int

	releasedOrderID   string
	releasedRequestID string
	releaseCalls      int

	confirmedOrderID   string
	confirmedRequestID string
	confirmCalls       int
}

func (f *fakeInventoryService) ReserveInventoryFromOrderCreated(ctx context.Context, event service.OrderCreatedEvent, meta service.EventMeta) (map[string]any, error) {
	f.reserveCalls++
	f.reservedEvent = event
	f.reservedMeta = meta
	return map[string]any{"ok": true}, nil
}

func (f *fakeInventoryService) ReleaseReservationsFromOrderCancellation(ctx context.Context, orderID, requestID string) (map[string]any, error) {
	f.releaseCalls++
	f.releasedOrderID = orderID
	f.releasedRequestID = requestID
	return map[string]any{"ok": true}, nil
}

func (f *fakeInventoryService) ReleaseReservationsFromOrderFailed(ctx context.Context, orderID, requestID string) (map[string]any, error) {
	f.releaseCalls++
	f.releasedOrderID = orderID
	f.releasedRequestID = requestID
	return map[string]any{"ok": true}, nil
}

func (f *fakeInventoryService) ConfirmReservationsFromOrderConfirmed(ctx context.Context, orderID, requestID string) (map[string]any, error) {
	f.confirmCalls++
	f.confirmedOrderID = orderID
	f.confirmedRequestID = requestID
	return map[string]any{"ok": true}, nil
}

func TestParseOrderCreatedEvent(t *testing.T) {
	event, err := parseOrderCreatedEvent(map[string]any{
		"orderId": "11111111-1111-4111-8111-111111111111",
		"items": []any{
			map[string]any{"sku": "sku-1", "quantity": float64(2)},
			map[string]any{"sku": "sku-2", "quantity": 1},
		},
	})
	if err != nil {
		t.Fatalf("parse order.created: %v", err)
	}
	if event.OrderID != "11111111-1111-4111-8111-111111111111" {
		t.Fatalf("unexpected order id: %s", event.OrderID)
	}
	if len(event.Items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(event.Items))
	}
	if event.Items[0].SKU != "sku-1" || event.Items[0].Quantity != 2 {
		t.Fatalf("unexpected first item: %+v", event.Items[0])
	}
}

func TestParseOrderCreatedEventRejectsInvalidItems(t *testing.T) {
	cases := []struct {
		name    string
		payload map[string]any
	}{
		{
			name:    "missing order",
			payload: map[string]any{"items": []any{map[string]any{"sku": "sku", "quantity": 1}}},
		},
		{
			name:    "missing items",
			payload: map[string]any{"orderId": "11111111-1111-4111-8111-111111111111"},
		},
		{
			name: "zero quantity",
			payload: map[string]any{
				"orderId": "11111111-1111-4111-8111-111111111111",
				"items":   []any{map[string]any{"sku": "sku", "quantity": 0}},
			},
		},
		{
			name: "fractional quantity",
			payload: map[string]any{
				"orderId": "11111111-1111-4111-8111-111111111111",
				"items":   []any{map[string]any{"sku": "sku", "quantity": 1.5}},
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := parseOrderCreatedEvent(tc.payload); err == nil {
				t.Fatalf("expected parse error")
			}
		})
	}
}

func TestConsumerHandleOrderCreated(t *testing.T) {
	fake := &fakeInventoryService{}
	consumer := &Consumer{logger: zap.NewNop(), svc: fake}
	msg := kafka.Message{
		Topic:     "order.events",
		Partition: 3,
		Offset:    42,
		Value: mustJSON(t, map[string]any{
			"eventId":   "evt-1",
			"eventType": "order.created",
			"payload": map[string]any{
				"orderId": "11111111-1111-4111-8111-111111111111",
				"items": []any{
					map[string]any{"sku": "sku-1", "quantity": 2},
				},
				"metadata": map[string]any{"requestId": "req-1"},
			},
		}),
	}

	consumer.handleMessage(context.Background(), msg)

	if fake.reserveCalls != 1 {
		t.Fatalf("expected reserve call, got %d", fake.reserveCalls)
	}
	if fake.reservedEvent.OrderID != "11111111-1111-4111-8111-111111111111" {
		t.Fatalf("unexpected reserved order id: %s", fake.reservedEvent.OrderID)
	}
	if fake.reservedEvent.Items[0].SKU != "sku-1" || fake.reservedEvent.Items[0].Quantity != 2 {
		t.Fatalf("unexpected reserved item: %+v", fake.reservedEvent.Items[0])
	}
	if fake.reservedMeta.EventID != "evt-1" || fake.reservedMeta.Topic != "order.events" || fake.reservedMeta.Partition != 3 || fake.reservedMeta.OffsetValue != 42 {
		t.Fatalf("unexpected event meta: %+v", fake.reservedMeta)
	}
	if fake.reservedMeta.RequestID != "req-1" {
		t.Fatalf("unexpected request id: %s", fake.reservedMeta.RequestID)
	}
}

func TestConsumerHandleOrderCancelled(t *testing.T) {
	fake := &fakeInventoryService{}
	consumer := &Consumer{logger: zap.NewNop(), svc: fake}
	msg := kafka.Message{
		Partition: 1,
		Offset:    7,
		Value: mustJSON(t, map[string]any{
			"eventType": "order.cancelled",
			"payload": map[string]any{
				"orderId":  "11111111-1111-4111-8111-111111111111",
				"metadata": map[string]any{"requestId": "cancel-req"},
			},
		}),
	}

	consumer.handleMessage(context.Background(), msg)

	if fake.releaseCalls != 1 {
		t.Fatalf("expected release call, got %d", fake.releaseCalls)
	}
	if fake.releasedOrderID != "11111111-1111-4111-8111-111111111111" {
		t.Fatalf("unexpected released order id: %s", fake.releasedOrderID)
	}
	if fake.releasedRequestID != "cancel-req" {
		t.Fatalf("unexpected request id: %s", fake.releasedRequestID)
	}
}

func TestConsumerSkipsInvalidOrderCreated(t *testing.T) {
	fake := &fakeInventoryService{}
	consumer := &Consumer{logger: zap.NewNop(), svc: fake}
	msg := kafka.Message{
		Value: mustJSON(t, map[string]any{
			"eventType": "order.created",
			"payload": map[string]any{
				"orderId": "11111111-1111-4111-8111-111111111111",
				"items":   []any{},
			},
		}),
	}

	consumer.handleMessage(context.Background(), msg)

	if fake.reserveCalls != 0 {
		t.Fatalf("expected invalid order.created to be skipped")
	}
}

func TestConsumerHandleOrderStatusUpdatedConfirmed(t *testing.T) {
	fake := &fakeInventoryService{}
	consumer := &Consumer{logger: zap.NewNop(), svc: fake}
	msg := kafka.Message{
		Value: mustJSON(t, map[string]any{
			"eventType": "order.status-updated",
			"payload": map[string]any{
				"orderId":  "11111111-1111-4111-8111-111111111111",
				"status":   "CONFIRMED",
				"metadata": map[string]any{"requestId": "confirm-req"},
			},
		}),
	}

	consumer.handleMessage(context.Background(), msg)

	if fake.confirmCalls != 1 {
		t.Fatalf("expected confirm call, got %d", fake.confirmCalls)
	}
	if fake.confirmedOrderID != "11111111-1111-4111-8111-111111111111" || fake.confirmedRequestID != "confirm-req" {
		t.Fatalf("unexpected confirm payload: order=%s request=%s", fake.confirmedOrderID, fake.confirmedRequestID)
	}
}

func TestConsumerHandleOrderStatusUpdatedFailed(t *testing.T) {
	fake := &fakeInventoryService{}
	consumer := &Consumer{logger: zap.NewNop(), svc: fake}
	msg := kafka.Message{
		Value: mustJSON(t, map[string]any{
			"eventType": "order.status-updated",
			"payload": map[string]any{
				"orderId":  "11111111-1111-4111-8111-111111111111",
				"status":   "FAILED",
				"metadata": map[string]any{"requestId": "failed-req"},
			},
		}),
	}

	consumer.handleMessage(context.Background(), msg)

	if fake.releaseCalls != 1 {
		t.Fatalf("expected release call, got %d", fake.releaseCalls)
	}
	if fake.releasedOrderID != "11111111-1111-4111-8111-111111111111" || fake.releasedRequestID != "failed-req" {
		t.Fatalf("unexpected release payload: order=%s request=%s", fake.releasedOrderID, fake.releasedRequestID)
	}
}

func mustJSON(t *testing.T, value any) []byte {
	t.Helper()
	out, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal json: %v", err)
	}
	return out
}
