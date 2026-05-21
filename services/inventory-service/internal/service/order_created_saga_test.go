package service

import (
	"testing"

	"inventory-service/internal/domain"
)

func TestNormalizeReserveItemsMergesAndSorts(t *testing.T) {
	items := normalizeReserveItems([]ReserveInventoryItem{
		{SKU: " sku-b ", Quantity: 1},
		{SKU: "SKU-A", Quantity: 2},
		{SKU: "sku-b", Quantity: 3},
	})

	if len(items) != 2 {
		t.Fatalf("expected 2 normalized items, got %d", len(items))
	}
	if items[0].SKU != "SKU-A" || items[0].Quantity != 2 {
		t.Fatalf("unexpected first item: %+v", items[0])
	}
	if items[1].SKU != "SKU-B" || items[1].Quantity != 4 {
		t.Fatalf("unexpected second item: %+v", items[1])
	}
}

func TestReservationBusinessFailureCodes(t *testing.T) {
	accepted := []string{
		domain.ErrorCodeInventoryInsufficientStock,
		domain.ErrorCodeInventorySkuNotFound,
		domain.ErrorCodeInventoryReservationConflict,
		domain.ErrorCodeValidationFailed,
	}
	for _, code := range accepted {
		if !isReservationBusinessFailure(code) {
			t.Fatalf("expected %s to be a business failure", code)
		}
	}
	if isReservationBusinessFailure(domain.ErrorCodeServiceUnavailable) {
		t.Fatalf("service unavailable should remain retryable")
	}
}

func TestBuildFailedReservationLinesPrefersErrorDetails(t *testing.T) {
	lines := buildFailedReservationLines(
		[]ReserveInventoryItem{{SKU: "SKU-A", Quantity: 1}, {SKU: "SKU-B", Quantity: 2}},
		map[string]any{"sku": "sku-b", "requestedQuantity": float64(2)},
	)

	if len(lines) != 1 {
		t.Fatalf("expected one failed line, got %d", len(lines))
	}
	if lines[0].SKU != "SKU-B" || lines[0].Quantity != 2 {
		t.Fatalf("unexpected failed line: %+v", lines[0])
	}
}
