package nexus

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadMerchantMappingsValidatesActiveSender(t *testing.T) {
	path := filepath.Join(t.TempDir(), "mappings.json")
	data := `[
		{
			"shopId": "550e8400-e29b-41d4-a716-446655440000",
			"shopName": "Shop A",
			"merchantId": "41100001",
			"sender": {"name":"Shop A","phone":"0909000000","address":"86 Nguyen Hue","province":"Ho Chi Minh"},
			"active": true
		}
	]`
	if err := os.WriteFile(path, []byte(data), 0o600); err != nil {
		t.Fatal(err)
	}
	mappings, err := LoadMerchantMappings(path)
	if err != nil {
		t.Fatal(err)
	}
	if mappings["550e8400-e29b-41d4-a716-446655440000"].MerchantID != "41100001" {
		t.Fatalf("unexpected mapping: %+v", mappings)
	}
}

func TestLoadMerchantMappingsRejectsIncompleteActiveEntry(t *testing.T) {
	path := filepath.Join(t.TempDir(), "mappings.json")
	if err := os.WriteFile(path, []byte(`[{"shopId":"550e8400-e29b-41d4-a716-446655440000","active":true}]`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadMerchantMappings(path); err == nil {
		t.Fatal("expected incomplete active entry to be rejected")
	}
}

func TestLoadPlatformMerchantMappingSupportsAllSellers(t *testing.T) {
	path := filepath.Join(t.TempDir(), "mappings.json")
	data := `{
		"shopName": "DT Commerce Marketplace",
		"merchantId": "41100000",
		"activeSellerIds": ["*"],
		"active": true
	}`
	if err := os.WriteFile(path, []byte(data), 0o600); err != nil {
		t.Fatal(err)
	}
	mappings, err := LoadMerchantMappings(path)
	if err != nil {
		t.Fatal(err)
	}

	sellerID := "9F8A2776-A0D3-4013-AC02-6784166EADD6"
	mapping, ok := ResolveMerchantMapping(mappings, sellerID)
	if !ok {
		t.Fatal("expected platform-wide seller mapping")
	}
	if mapping.ShopID != "9f8a2776-a0d3-4013-ac02-6784166eadd6" {
		t.Fatalf("expected canonical seller ID, got %q", mapping.ShopID)
	}
	if mapping.MerchantID != "41100000" {
		t.Fatalf("unexpected mapping: %+v", mapping)
	}
}

func TestResolveMerchantMappingPrefersExactSeller(t *testing.T) {
	sellerID := "9f8a2776-a0d3-4013-ac02-6784166eadd6"
	mappings := map[string]MerchantMapping{
		AllSellersMappingKey: {MerchantID: "platform"},
		sellerID:             {MerchantID: "seller-specific"},
	}

	mapping, ok := ResolveMerchantMapping(mappings, sellerID)
	if !ok || mapping.MerchantID != "seller-specific" {
		t.Fatalf("expected exact mapping, got %+v", mapping)
	}
}
