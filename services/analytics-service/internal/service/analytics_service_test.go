package service

import "testing"

func TestNormalizeAnalyticsEventExtractsNestedVideoSellerAndActor(t *testing.T) {
	message := `{
		"eventType":"video.product_clicked",
		"occurredAt":"2026-05-15T00:00:00Z",
		"payload":{
			"actor":{"userId":"buyer-1","anonymousSessionId":"anon-1"},
			"video":{"videoId":"video-1","sellerId":"seller-1"},
			"product":{"productId":"product-1"},
			"context":{"source":"buyer_video_feed"}
		}
	}`

	result := normalizeAnalyticsEvent("", message, "event-key-1")
	if result.Record == nil {
		t.Fatalf("expected normalized record, reason=%s", result.Reason)
	}
	if result.Record.SellerID == nil || *result.Record.SellerID != "seller-1" {
		t.Fatalf("SellerID = %v, want seller-1", result.Record.SellerID)
	}
	if result.Record.UserID == nil || *result.Record.UserID != "buyer-1" {
		t.Fatalf("UserID = %v, want buyer-1", result.Record.UserID)
	}
	if result.Record.EventType != "video.product_clicked" {
		t.Fatalf("EventType = %q", result.Record.EventType)
	}
}
