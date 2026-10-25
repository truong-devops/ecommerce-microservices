package service

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

type fakeOrderEventHandler struct {
	createdCalls   int
	cancelledCalls int
	orderID        string
	userID         string
	sellerID       string
	totalAmount    float64
	eventID        string
}

func (f *fakeOrderEventHandler) HandleOrderCreatedEvent(
	_ context.Context,
	orderID, userID, sellerID string,
	totalAmount float64,
	_ string,
	_ *string,
	_ string,
	_ string,
	eventID string,
	_ string,
	_ int,
	_ int64,
) error {
	f.createdCalls++
	f.orderID = orderID
	f.userID = userID
	f.sellerID = sellerID
	f.totalAmount = totalAmount
	f.eventID = eventID
	return nil
}

func (f *fakeOrderEventHandler) HandleOrderCancelledEvent(
	_ context.Context,
	orderID, _ string, eventID, _ string,
	_ int,
	_ int64,
) error {
	f.cancelledCalls++
	f.orderID = orderID
	f.eventID = eventID
	return nil
}

func TestOrderCancelledEventDoesNotRequireCreatedOrderFields(t *testing.T) {
	handler := &fakeOrderEventHandler{}
	consumer := &OrderEventsConsumer{topic: "order.events", logger: zap.NewNop(), service: handler}
	message := kafka.Message{
		Topic: "order.events",
		Value: mustMarshalOrderEvent(t, KafkaEnvelope{
			EventID: "evt-cancelled-1", EventType: "order.cancelled",
			Payload: map[string]any{"orderId": "11111111-1111-4111-8111-111111111111"},
		}),
	}

	if err := consumer.handleMessage(context.Background(), message); err != nil {
		t.Fatalf("handle cancellation: %v", err)
	}
	if handler.cancelledCalls != 1 || handler.createdCalls != 0 || handler.eventID != "evt-cancelled-1" {
		t.Fatalf("unexpected handler calls: %+v", handler)
	}
}

func TestOrderCreatedEventKeepsPaymentFields(t *testing.T) {
	handler := &fakeOrderEventHandler{}
	consumer := &OrderEventsConsumer{topic: "order.events", logger: zap.NewNop(), service: handler}
	message := kafka.Message{Value: mustMarshalOrderEvent(t, KafkaEnvelope{
		EventID: "evt-created-1", EventType: "order.created",
		Payload: map[string]any{
			"orderId":       "11111111-1111-4111-8111-111111111111",
			"userId":        "22222222-2222-4222-8222-222222222222",
			"sellerId":      "33333333-3333-4333-8333-333333333333",
			"totalAmount":   109000,
			"currency":      "VND",
			"paymentMethod": "ONLINE",
		},
	})}

	if err := consumer.handleMessage(context.Background(), message); err != nil {
		t.Fatalf("handle creation: %v", err)
	}
	if handler.createdCalls != 1 || handler.totalAmount != 109000 || handler.userID == "" || handler.sellerID == "" {
		t.Fatalf("unexpected created event: %+v", handler)
	}
}

func mustMarshalOrderEvent(t *testing.T, value KafkaEnvelope) []byte {
	t.Helper()
	result, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal order event: %v", err)
	}
	return result
}
