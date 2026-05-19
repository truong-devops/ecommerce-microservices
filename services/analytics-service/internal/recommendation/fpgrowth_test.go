package recommendation

import "testing"

func TestMineGeneratesFrequentlyBoughtTogetherRules(t *testing.T) {
	result := Mine([][]string{
		{"iphone", "case", "charger"},
		{"iphone", "case"},
		{"iphone", "case"},
		{"iphone", "charger"},
		{"case", "charger"},
	}, Config{MinSupportCount: 2, MinConfidence: 0.5, MaxAntecedentSize: 2, MaxRules: 20})

	if result.TransactionCount != 5 {
		t.Fatalf("TransactionCount = %d, want 5", result.TransactionCount)
	}
	if result.FrequentItemsetCount == 0 {
		t.Fatal("FrequentItemsetCount should be greater than zero")
	}

	var found bool
	for _, rule := range result.Rules {
		if len(rule.AntecedentProductIDs) == 1 &&
			rule.AntecedentProductIDs[0] == "iphone" &&
			rule.ConsequentProductID == "case" {
			found = true
			if rule.SupportCount != 3 {
				t.Fatalf("SupportCount = %d, want 3", rule.SupportCount)
			}
			if rule.AntecedentCount != 4 {
				t.Fatalf("AntecedentCount = %d, want 4", rule.AntecedentCount)
			}
			if rule.ConsequentCount != 4 {
				t.Fatalf("ConsequentCount = %d, want 4", rule.ConsequentCount)
			}
			if rule.Confidence != 0.75 {
				t.Fatalf("Confidence = %f, want 0.75", rule.Confidence)
			}
		}
	}
	if !found {
		t.Fatalf("expected iphone -> case rule, got %#v", result.Rules)
	}
}

func TestMineDeduplicatesItemsInsideTransaction(t *testing.T) {
	result := Mine([][]string{
		{"a", "a", "b"},
		{"a", "b"},
	}, Config{MinSupportCount: 2, MinConfidence: 0.5, MaxAntecedentSize: 1, MaxRules: 10})

	var found bool
	for _, rule := range result.Rules {
		if len(rule.AntecedentProductIDs) == 1 && rule.AntecedentProductIDs[0] == "a" && rule.ConsequentProductID == "b" {
			found = true
			if rule.SupportCount != 2 {
				t.Fatalf("SupportCount = %d, want 2", rule.SupportCount)
			}
		}
	}
	if !found {
		t.Fatalf("expected a -> b rule, got %#v", result.Rules)
	}
}
