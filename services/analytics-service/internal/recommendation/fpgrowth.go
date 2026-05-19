package recommendation

import (
	"crypto/sha1"
	"encoding/hex"
	"sort"
	"strings"
)

type Config struct {
	MinSupportCount   int
	MinConfidence     float64
	MaxAntecedentSize int
	MaxRules          int
}

type Rule struct {
	RuleID               string
	AntecedentProductIDs []string
	ConsequentProductID  string
	SupportCount         int64
	AntecedentCount      int64
	ConsequentCount      int64
	TransactionCount     int64
	Support              float64
	Confidence           float64
	Lift                 float64
	Score                float64
}

type Result struct {
	Rules                []Rule
	FrequentItemsetCount int
	TransactionCount     int
}

type node struct {
	item     string
	count    int
	parent   *node
	children map[string]*node
	next     *node
}

type tree struct {
	root   *node
	header map[string]*node
}

func Mine(transactions [][]string, cfg Config) Result {
	if cfg.MinSupportCount < 1 {
		cfg.MinSupportCount = 1
	}
	if cfg.MinConfidence <= 0 {
		cfg.MinConfidence = 0.01
	}
	if cfg.MaxAntecedentSize < 1 {
		cfg.MaxAntecedentSize = 3
	}
	if cfg.MaxRules < 1 {
		cfg.MaxRules = 5000
	}

	normalized := normalizeTransactions(transactions)
	if len(normalized) == 0 {
		return Result{}
	}

	fpTree, freq := buildTree(normalized, cfg.MinSupportCount)
	if fpTree == nil {
		return Result{TransactionCount: len(normalized)}
	}

	itemsetSupport := map[string]int{}
	for item, count := range freq {
		itemsetSupport[item] = count
	}
	mineTree(fpTree, nil, cfg.MinSupportCount, itemsetSupport)

	rules := generateRules(itemsetSupport, len(normalized), cfg)
	return Result{
		Rules:                rules,
		FrequentItemsetCount: len(itemsetSupport),
		TransactionCount:     len(normalized),
	}
}

func buildTree(transactions [][]string, minSupport int) (*tree, map[string]int) {
	freq := map[string]int{}
	for _, tx := range transactions {
		for _, item := range tx {
			freq[item]++
		}
	}
	for item, count := range freq {
		if count < minSupport {
			delete(freq, item)
		}
	}
	if len(freq) == 0 {
		return nil, nil
	}

	t := &tree{root: &node{children: map[string]*node{}}, header: map[string]*node{}}
	for _, tx := range transactions {
		filtered := make([]string, 0, len(tx))
		for _, item := range tx {
			if _, ok := freq[item]; ok {
				filtered = append(filtered, item)
			}
		}
		sort.Slice(filtered, func(i, j int) bool {
			if freq[filtered[i]] == freq[filtered[j]] {
				return filtered[i] < filtered[j]
			}
			return freq[filtered[i]] > freq[filtered[j]]
		})
		insertTransaction(t, filtered, 1)
	}
	return t, freq
}

func insertTransaction(t *tree, tx []string, count int) {
	current := t.root
	for _, item := range tx {
		if current.children == nil {
			current.children = map[string]*node{}
		}
		child := current.children[item]
		if child == nil {
			child = &node{item: item, parent: current, children: map[string]*node{}}
			current.children[item] = child
			child.next = t.header[item]
			t.header[item] = child
		}
		child.count += count
		current = child
	}
}

func mineTree(t *tree, suffix []string, minSupport int, support map[string]int) {
	items := make([]string, 0, len(t.header))
	for item := range t.header {
		items = append(items, item)
	}
	sort.Strings(items)

	for _, item := range items {
		itemSupport := 0
		for n := t.header[item]; n != nil; n = n.next {
			itemSupport += n.count
		}
		if itemSupport < minSupport {
			continue
		}

		itemset := appendSorted(append([]string{}, suffix...), item)
		support[itemsetKey(itemset)] = itemSupport

		conditionalTransactions := make([][]string, 0)
		for n := t.header[item]; n != nil; n = n.next {
			path := make([]string, 0)
			for parent := n.parent; parent != nil && parent.item != ""; parent = parent.parent {
				path = append(path, parent.item)
			}
			if len(path) == 0 {
				continue
			}
			for i := 0; i < n.count; i++ {
				conditionalTransactions = append(conditionalTransactions, path)
			}
		}

		conditionalTree, _ := buildTree(conditionalTransactions, minSupport)
		if conditionalTree != nil {
			mineTree(conditionalTree, itemset, minSupport, support)
		}
	}
}

func generateRules(itemsetSupport map[string]int, transactionCount int, cfg Config) []Rule {
	rules := make([]Rule, 0)
	for key, supportCount := range itemsetSupport {
		itemset := splitItemsetKey(key)
		if len(itemset) < 2 {
			continue
		}
		for _, consequent := range itemset {
			antecedent := withoutItem(itemset, consequent)
			if len(antecedent) == 0 || len(antecedent) > cfg.MaxAntecedentSize {
				continue
			}
			antecedentCount := itemsetSupport[itemsetKey(antecedent)]
			consequentCount := itemsetSupport[consequent]
			if antecedentCount == 0 || consequentCount == 0 {
				continue
			}
			confidence := float64(supportCount) / float64(antecedentCount)
			if confidence < cfg.MinConfidence {
				continue
			}
			supportValue := float64(supportCount) / float64(transactionCount)
			consequentSupport := float64(consequentCount) / float64(transactionCount)
			lift := confidence / consequentSupport
			rules = append(rules, Rule{
				RuleID:               makeRuleID(antecedent, consequent),
				AntecedentProductIDs: antecedent,
				ConsequentProductID:  consequent,
				SupportCount:         int64(supportCount),
				AntecedentCount:      int64(antecedentCount),
				ConsequentCount:      int64(consequentCount),
				TransactionCount:     int64(transactionCount),
				Support:              supportValue,
				Confidence:           confidence,
				Lift:                 lift,
				Score:                confidence * lift,
			})
		}
	}

	sort.Slice(rules, func(i, j int) bool {
		if rules[i].Score == rules[j].Score {
			if strings.Join(rules[i].AntecedentProductIDs, ",") == strings.Join(rules[j].AntecedentProductIDs, ",") {
				return rules[i].ConsequentProductID < rules[j].ConsequentProductID
			}
			return strings.Join(rules[i].AntecedentProductIDs, ",") < strings.Join(rules[j].AntecedentProductIDs, ",")
		}
		return rules[i].Score > rules[j].Score
	})
	if len(rules) > cfg.MaxRules {
		rules = rules[:cfg.MaxRules]
	}
	return rules
}

func normalizeTransactions(transactions [][]string) [][]string {
	out := make([][]string, 0, len(transactions))
	for _, tx := range transactions {
		seen := map[string]struct{}{}
		items := make([]string, 0, len(tx))
		for _, item := range tx {
			item = strings.TrimSpace(item)
			if item == "" {
				continue
			}
			if _, ok := seen[item]; ok {
				continue
			}
			seen[item] = struct{}{}
			items = append(items, item)
		}
		if len(items) < 2 {
			continue
		}
		sort.Strings(items)
		out = append(out, items)
	}
	return out
}

func appendSorted(items []string, item string) []string {
	items = append(items, item)
	sort.Strings(items)
	return items
}

func withoutItem(items []string, target string) []string {
	out := make([]string, 0, len(items)-1)
	for _, item := range items {
		if item != target {
			out = append(out, item)
		}
	}
	sort.Strings(out)
	return out
}

func itemsetKey(items []string) string {
	cp := append([]string{}, items...)
	sort.Strings(cp)
	return strings.Join(cp, "\x1f")
}

func splitItemsetKey(key string) []string {
	if key == "" {
		return nil
	}
	return strings.Split(key, "\x1f")
}

func makeRuleID(antecedent []string, consequent string) string {
	sum := sha1.Sum([]byte(itemsetKey(antecedent) + "=>" + consequent))
	return hex.EncodeToString(sum[:])
}
