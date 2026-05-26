package nexus

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/google/uuid"
)

type MerchantMapping struct {
	ShopID     string         `json:"shopId"`
	ShopName   string         `json:"shopName"`
	MerchantID string         `json:"merchantId"`
	Sender     AddressContact `json:"sender"`
	Active     bool           `json:"active"`
}

func LoadMerchantMappings(path string) (map[string]MerchantMapping, error) {
	data, err := os.ReadFile(strings.TrimSpace(path))
	if err != nil {
		return nil, fmt.Errorf("read Nexus merchant mapping: %w", err)
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
		if _, err := uuid.Parse(entry.ShopID); err != nil || entry.MerchantID == "" ||
			strings.TrimSpace(entry.ShopName) == "" || strings.TrimSpace(entry.Sender.Name) == "" ||
			strings.TrimSpace(entry.Sender.Phone) == "" || strings.TrimSpace(entry.Sender.Address) == "" ||
			strings.TrimSpace(entry.Sender.Province) == "" {
			return nil, fmt.Errorf("active Nexus merchant mapping for shop %q is incomplete", entry.ShopID)
		}
		mappings[entry.ShopID] = entry
	}
	return mappings, nil
}
