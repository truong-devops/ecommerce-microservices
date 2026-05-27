package nexus

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/google/uuid"
)

type MerchantMapping struct {
	ShopID              string            `json:"shopId"`
	ShopName            string            `json:"shopName"`
	MerchantID          string            `json:"merchantId"`
	Sender              AddressContact    `json:"sender"`
	ProvinceHubMappings map[string]string `json:"provinceHubMappings,omitempty"`
	Active              bool              `json:"active"`
}

type PlatformMerchantMapping struct {
	ShopName            string            `json:"shopName"`
	MerchantID          string            `json:"merchantId"`
	ActiveSellerIDs     []string          `json:"activeSellerIds"`
	Sender              AddressContact    `json:"sender"`
	ProvinceHubMappings map[string]string `json:"provinceHubMappings,omitempty"`
	Active              bool              `json:"active"`
}

func LoadMerchantMappings(path string) (map[string]MerchantMapping, error) {
	data, err := os.ReadFile(strings.TrimSpace(path))
	if err != nil {
		return nil, fmt.Errorf("read Nexus merchant mapping: %w", err)
	}

	trimmed := strings.TrimSpace(string(data))
	if strings.HasPrefix(trimmed, "{") {
		return loadPlatformMerchantMapping(data)
	}

	var entries []MerchantMapping
	if err := json.Unmarshal(data, &entries); err != nil {
		return nil, fmt.Errorf("parse Nexus merchant mapping: %w", err)
	}
	mappings := make(map[string]MerchantMapping, len(entries))
	for _, entry := range entries {
		entry.ShopID = strings.TrimSpace(entry.ShopID)
		entry.MerchantID = strings.TrimSpace(entry.MerchantID)
		if !entry.Active {
			continue
		}
		if _, err := uuid.Parse(entry.ShopID); err != nil || entry.MerchantID == "" || strings.TrimSpace(entry.ShopName) == "" {
			return nil, fmt.Errorf("active Nexus merchant mapping for shop %q is incomplete", entry.ShopID)
		}
		entry.ProvinceHubMappings = normalizeHubMappings(entry.ProvinceHubMappings)
		mappings[entry.ShopID] = entry
	}
	return mappings, nil
}

func loadPlatformMerchantMapping(data []byte) (map[string]MerchantMapping, error) {
	var entry PlatformMerchantMapping
	if err := json.Unmarshal(data, &entry); err != nil {
		return nil, fmt.Errorf("parse Nexus platform merchant mapping: %w", err)
	}
	entry.MerchantID = strings.TrimSpace(entry.MerchantID)
	entry.ShopName = strings.TrimSpace(entry.ShopName)
	if !entry.Active {
		return map[string]MerchantMapping{}, nil
	}
	if entry.MerchantID == "" || entry.ShopName == "" || len(entry.ActiveSellerIDs) == 0 {
		return nil, fmt.Errorf("active Nexus platform merchant mapping is incomplete")
	}

	hubMappings := normalizeHubMappings(entry.ProvinceHubMappings)
	mappings := make(map[string]MerchantMapping, len(entry.ActiveSellerIDs))
	for _, rawSellerID := range entry.ActiveSellerIDs {
		sellerID := strings.TrimSpace(rawSellerID)
		if _, err := uuid.Parse(sellerID); err != nil {
			return nil, fmt.Errorf("active Nexus platform merchant mapping has invalid seller %q", sellerID)
		}
		mappings[sellerID] = MerchantMapping{
			ShopID:              sellerID,
			ShopName:            entry.ShopName,
			MerchantID:          entry.MerchantID,
			Sender:              entry.Sender,
			ProvinceHubMappings: hubMappings,
			Active:              true,
		}
	}
	return mappings, nil
}

func normalizeHubMappings(input map[string]string) map[string]string {
	if len(input) == 0 {
		return nil
	}
	out := make(map[string]string, len(input))
	for key, value := range input {
		normalizedKey := strings.TrimSpace(key)
		normalizedValue := strings.TrimSpace(value)
		if normalizedKey != "" && normalizedValue != "" {
			out[normalizedKey] = normalizedValue
		}
	}
	return out
}
