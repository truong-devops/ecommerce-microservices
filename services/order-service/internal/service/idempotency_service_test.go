package service

import (
	"testing"

	"order-service/internal/domain"
	"order-service/internal/httpx"
	"order-service/internal/repository"
)

func TestCreateOrderIdempotencyLockKeyUsesDomainConvention(t *testing.T) {
	key := createOrderIdempotencyLockKey("user-1", "checkout-abc")
	if key != "idem:order:create:user-1:checkout-abc" {
		t.Fatalf("unexpected lock key: %s", key)
	}
}

func TestHandleExistingReplaysCompletedResponse(t *testing.T) {
	service := &IdempotencyService{}
	result, err := service.handleExisting(repository.IdempotencyRecord{
		RequestHash:  "hash-1",
		ResponseBody: map[string]any{"orderId": "order-1"},
	}, "hash-1")
	if err != nil {
		t.Fatalf("handleExisting returned error: %v", err)
	}
	if !result.Replay || result.ResponseBody["orderId"] != "order-1" {
		t.Fatalf("unexpected replay result: %+v", result)
	}
}

func TestHandleExistingRejectsDifferentPayload(t *testing.T) {
	service := &IdempotencyService{}
	_, err := service.handleExisting(repository.IdempotencyRecord{RequestHash: "hash-1"}, "hash-2")
	if err == nil {
		t.Fatal("expected conflict for reused idempotency key with different payload")
	}
	appErr, ok := err.(*httpx.AppError)
	if !ok {
		t.Fatalf("expected AppError, got %T", err)
	}
	if appErr.Code != domain.ErrorCodeIdempotencyConflict {
		t.Fatalf("expected idempotency conflict, got %s", appErr.Code)
	}
}
