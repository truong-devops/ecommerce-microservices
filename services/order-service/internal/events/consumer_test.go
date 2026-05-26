package events

import (
	"context"
	"encoding/json"
	"testing"

	"order-service/internal/service"

	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

type fakeSagaService struct {
	inventoryReservedCalls int
	inventoryFailureCalls  int
	inventoryExpiredCalls  int
	paymentCapturedCalls   int
	paymentFailedCalls     int
	shipmentStatusCalls    int

	lastInventoryReserved service.InventoryReservedEvent
	lastInventoryFailure  service.InventoryFailureEvent
	lastPayment           service.PaymentEvent
	lastShipment          service.ShipmentEvent
	lastMeta              service.SagaEventMeta
}

func (f *fakeSagaService) HandleInventoryReserved(ctx context.Context, event service.InventoryReservedEvent, meta service.SagaEventMeta) error {
	f.inventoryReservedCalls++
	f.lastInventoryReserved = event
	f.lastMeta = meta
	return nil
}

func (f *fakeSagaService) HandleInventoryReservationFailed(ctx context.Context, event service.InventoryFailureEvent, meta service.SagaEventMeta) error {
	f.inventoryFailureCalls++
	f.lastInventoryFailure = event
	f.lastMeta = meta
	return nil
}

func (f *fakeSagaService) HandleInventoryExpired(ctx context.Context, event service.InventoryFailureEvent, meta service.SagaEventMeta) error {
	f.inventoryExpiredCalls++
	f.lastInventoryFailure = event
	f.lastMeta = meta
	return nil
}

func (f *fakeSagaService) HandlePaymentCaptured(ctx context.Context, event service.PaymentEvent, meta service.SagaEventMeta) error {
	f.paymentCapturedCalls++
	f.lastPayment = event
	f.lastMeta = meta
	return nil
}

func (f *fakeSagaService) HandlePaymentFailed(ctx context.Context, event service.PaymentEvent, meta service.SagaEventMeta) error {
	f.paymentFailedCalls++
	f.lastPayment = event
	f.lastMeta = meta
	return nil
}

func (f *fakeSagaService) HandleShipmentStatusUpdated(ctx context.Context, event service.ShipmentEvent, meta service.SagaEventMeta) error {
	f.shipmentStatusCalls++
	f.lastShipment = event
	f.lastMeta = meta
	return nil
}

func TestSagaConsumerHandleInventoryReserved(t *testing.T) {
	fake := &fakeSagaService{}
	consumer := &SagaConsumer{topic: "inventory.events", logger: zap.NewNop(), svc: fake}
	msg := kafka.Message{
		Topic:     "inventory.events",
		Partition: 2,
		Offset:    11,
		Value: mustJSON(t, map[string]any{
			"eventId":   "evt-inv-1",
			"eventType": "inventory.reserved",
			"payload": map[string]any{
				"orderId":  "11111111-1111-4111-8111-111111111111",
				"metadata": map[string]any{"requestId": "req-inv"},
			},
		}),
	}

	if err := consumer.handleMessage(context.Background(), msg); err != nil {
		t.Fatalf("handle message: %v", err)
	}
	if fake.inventoryReservedCalls != 1 {
		t.Fatalf("expected inventory reserved call, got %d", fake.inventoryReservedCalls)
	}
	if fake.lastInventoryReserved.OrderID != "11111111-1111-4111-8111-111111111111" {
		t.Fatalf("unexpected order id: %s", fake.lastInventoryReserved.OrderID)
	}
	if fake.lastMeta.EventID != "evt-inv-1" || fake.lastMeta.RequestID != "req-inv" || fake.lastMeta.Partition != 2 || fake.lastMeta.OffsetValue != 11 {
		t.Fatalf("unexpected meta: %+v", fake.lastMeta)
	}
}

func TestSagaConsumerHandleInventoryReservationFailed(t *testing.T) {
	fake := &fakeSagaService{}
	consumer := &SagaConsumer{topic: "inventory.events", logger: zap.NewNop(), svc: fake}
	msg := kafka.Message{Value: mustJSON(t, map[string]any{
		"eventType": "inventory.reservation-failed",
		"payload": map[string]any{
			"orderId": "11111111-1111-4111-8111-111111111111",
			"reason":  "INVENTORY_INSUFFICIENT_STOCK",
			"message": "Insufficient stock",
		},
	})}

	if err := consumer.handleMessage(context.Background(), msg); err != nil {
		t.Fatalf("handle message: %v", err)
	}
	if fake.inventoryFailureCalls != 1 {
		t.Fatalf("expected inventory failure call, got %d", fake.inventoryFailureCalls)
	}
	if fake.lastInventoryFailure.Reason != "INVENTORY_INSUFFICIENT_STOCK" {
		t.Fatalf("unexpected reason: %s", fake.lastInventoryFailure.Reason)
	}
}

func TestSagaConsumerHandlePaymentEvents(t *testing.T) {
	cases := []struct {
		name      string
		eventType string
		wantCap   int
		wantFail  int
	}{
		{name: "captured", eventType: "payment.captured", wantCap: 1},
		{name: "failed", eventType: "payment.failed", wantFail: 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fake := &fakeSagaService{}
			consumer := &SagaConsumer{topic: "payment.events", logger: zap.NewNop(), svc: fake}
			msg := kafka.Message{Value: mustJSON(t, map[string]any{
				"eventType": tc.eventType,
				"payload": map[string]any{
					"orderId":   "11111111-1111-4111-8111-111111111111",
					"paymentId": "22222222-2222-4222-8222-222222222222",
					"status":    "CAPTURED",
				},
			})}

			if err := consumer.handleMessage(context.Background(), msg); err != nil {
				t.Fatalf("handle message: %v", err)
			}
			if fake.paymentCapturedCalls != tc.wantCap || fake.paymentFailedCalls != tc.wantFail {
				t.Fatalf("unexpected calls captured=%d failed=%d", fake.paymentCapturedCalls, fake.paymentFailedCalls)
			}
			if fake.lastPayment.OrderID != "11111111-1111-4111-8111-111111111111" || fake.lastPayment.PaymentID != "22222222-2222-4222-8222-222222222222" {
				t.Fatalf("unexpected payment event: %+v", fake.lastPayment)
			}
		})
	}
}

func TestSagaConsumerSkipsUnknownEvent(t *testing.T) {
	fake := &fakeSagaService{}
	consumer := &SagaConsumer{topic: "inventory.events", logger: zap.NewNop(), svc: fake}
	msg := kafka.Message{Value: mustJSON(t, map[string]any{
		"eventType": "inventory.adjusted",
		"payload":   map[string]any{"orderId": "11111111-1111-4111-8111-111111111111"},
	})}

	if err := consumer.handleMessage(context.Background(), msg); err != nil {
		t.Fatalf("handle message: %v", err)
	}
	if fake.inventoryReservedCalls != 0 || fake.paymentCapturedCalls != 0 {
		t.Fatalf("expected unknown event to be ignored")
	}
}

func TestSagaConsumerHandleShipmentDelivered(t *testing.T) {
	fake := &fakeSagaService{}
	consumer := &SagaConsumer{topic: "shipping.events", logger: zap.NewNop(), svc: fake}
	msg := kafka.Message{Value: mustJSON(t, map[string]any{
		"eventType": "shipment.delivered",
		"payload": map[string]any{
			"orderId":        "11111111-1111-4111-8111-111111111111",
			"shipmentId":     "22222222-2222-4222-8222-222222222222",
			"status":         "DELIVERED",
			"awb":            "SHP123",
			"trackingNumber": "SHP123",
		},
	})}

	if err := consumer.handleMessage(context.Background(), msg); err != nil {
		t.Fatalf("handle message: %v", err)
	}
	if fake.shipmentStatusCalls != 1 {
		t.Fatalf("expected shipment status call, got %d", fake.shipmentStatusCalls)
	}
	if fake.lastShipment.OrderID != "11111111-1111-4111-8111-111111111111" || fake.lastShipment.Status != "DELIVERED" {
		t.Fatalf("unexpected shipment event: %+v", fake.lastShipment)
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
