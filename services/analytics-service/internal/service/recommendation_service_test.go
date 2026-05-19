package service

import (
	"testing"
	"time"
)

func TestBuildRecommendationTransactionsDeduplicatesAndSkipsSingleItemOrders(t *testing.T) {
	completedAt := time.Date(2026, 5, 19, 2, 0, 0, 0, time.UTC)
	transactions := BuildRecommendationTransactions([]CompletedOrder{
		{
			OrderID:     "ord-1",
			UserID:      "user-1",
			CompletedAt: completedAt,
			Items: []CompletedOrderItem{
				{ProductID: "prod-b"},
				{ProductID: "prod-a"},
				{ProductID: "prod-a"},
				{ProductID: " "},
			},
		},
		{
			OrderID:     "ord-2",
			UserID:      "user-2",
			CompletedAt: completedAt,
			Items:       []CompletedOrderItem{{ProductID: "prod-c"}},
		},
	})

	if len(transactions) != 1 {
		t.Fatalf("len(transactions) = %d, want 1", len(transactions))
	}
	got := transactions[0]
	if got.OrderID != "ord-1" {
		t.Fatalf("OrderID = %q, want ord-1", got.OrderID)
	}
	if got.ItemCount != 2 {
		t.Fatalf("ItemCount = %d, want 2", got.ItemCount)
	}
	if got.ProductIDs[0] != "prod-a" || got.ProductIDs[1] != "prod-b" {
		t.Fatalf("ProductIDs = %#v, want sorted deduped prod-a/prod-b", got.ProductIDs)
	}
	if got.SourceSnapshot == nil || *got.SourceSnapshot == "" {
		t.Fatal("SourceSnapshot should be populated")
	}
}
