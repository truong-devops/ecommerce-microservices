package service

import (
	"errors"
	"net/http"
	"testing"

	"inventory-service/internal/domain"
	"inventory-service/internal/httpx"
)

func TestCalculateStockAdjustmentSetsTargetOnHand(t *testing.T) {
	target := 20

	nextOnHand, deltaOnHand, err := calculateStockAdjustment(7, AdjustStockRequest{OnHand: &target})
	if err != nil {
		t.Fatalf("calculate stock adjustment: %v", err)
	}
	if nextOnHand != 20 || deltaOnHand != 13 {
		t.Fatalf("unexpected adjustment: on_hand=%d delta=%d", nextOnHand, deltaOnHand)
	}
}

func TestCalculateStockAdjustmentPreservesDeltaInput(t *testing.T) {
	delta := -3

	nextOnHand, deltaOnHand, err := calculateStockAdjustment(7, AdjustStockRequest{DeltaOnHand: &delta})
	if err != nil {
		t.Fatalf("calculate stock adjustment: %v", err)
	}
	if nextOnHand != 4 || deltaOnHand != -3 {
		t.Fatalf("unexpected adjustment: on_hand=%d delta=%d", nextOnHand, deltaOnHand)
	}
}

func TestSellerCannotAdjustStockForAnotherSeller(t *testing.T) {
	item := &domain.InventoryItem{SellerID: "11111111-1111-1111-1111-111111111111"}
	actor := domain.UserContext{
		UserID: "22222222-2222-2222-2222-222222222222",
		Role:   domain.RoleSeller,
	}

	err := assertSellerInventoryOwnership(actor, item, nil)
	var appErr *httpx.AppError
	if !errors.As(err, &appErr) || appErr.Status != http.StatusForbidden {
		t.Fatalf("expected forbidden app error, got %v", err)
	}
}
