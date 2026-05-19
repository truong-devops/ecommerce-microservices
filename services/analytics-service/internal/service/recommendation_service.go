package service

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"analytics-service/internal/domain"
	"analytics-service/internal/httpx"
	"analytics-service/internal/recommendation"
	"analytics-service/internal/repository"

	"github.com/google/uuid"
)

type RecommendationConfig struct {
	Enabled           bool
	WindowDays        int
	MinSupportCount   int
	MinConfidence     float64
	MaxAntecedentSize int
	MaxRules          int
}

type completedOrderFetcher interface {
	FetchCompletedOrders(ctx context.Context, from, to time.Time) ([]CompletedOrder, error)
}

type RecommendationService struct {
	repo       *repository.AnalyticsRepository
	order      completedOrderFetcher
	cfg        RecommendationConfig
	trainingMu sync.Mutex
}

func NewRecommendationService(repo *repository.AnalyticsRepository, order completedOrderFetcher, cfg RecommendationConfig) *RecommendationService {
	return &RecommendationService{repo: repo, order: order, cfg: cfg}
}

func (s *RecommendationService) Train(ctx context.Context) (map[string]any, error) {
	if s == nil || !s.cfg.Enabled {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Recommendation is disabled", nil)
	}
	if s.order == nil {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Order client is not configured", nil)
	}

	s.trainingMu.Lock()
	defer s.trainingMu.Unlock()

	startedAt := time.Now().UTC()
	runID := uuid.NewString()
	run := domain.RecommendationTrainingRun{
		RunID:             runID,
		Status:            "RUNNING",
		WindowDays:        s.cfg.WindowDays,
		MinSupportCount:   s.cfg.MinSupportCount,
		MinConfidence:     s.cfg.MinConfidence,
		MaxAntecedentSize: s.cfg.MaxAntecedentSize,
		StartedAt:         startedAt,
	}
	if err := s.repo.CreateTrainingRun(ctx, run); err != nil {
		return nil, err
	}

	counts := repository.RecommendationTrainingCounts{}
	var finishErr *string
	status := "SUCCEEDED"
	defer func() {
		_ = s.repo.FinishTrainingRun(context.Background(), runID, status, counts, finishErr)
	}()

	to := startedAt
	from := to.Add(-time.Duration(s.cfg.WindowDays) * 24 * time.Hour)
	orders, err := s.order.FetchCompletedOrders(ctx, from, to)
	if err != nil {
		status = "FAILED"
		msg := err.Error()
		finishErr = &msg
		return nil, err
	}

	transactions := BuildRecommendationTransactions(orders)
	if err := s.repo.UpsertRecommendationTransactions(ctx, transactions); err != nil {
		status = "FAILED"
		msg := err.Error()
		finishErr = &msg
		return nil, err
	}

	stored, err := s.repo.ListRecommendationTransactions(ctx, s.cfg.WindowDays, "")
	if err != nil {
		status = "FAILED"
		msg := err.Error()
		finishErr = &msg
		return nil, err
	}

	input := make([][]string, 0, len(stored))
	for _, tx := range stored {
		input = append(input, tx.ProductIDs)
	}
	minSupport := s.cfg.MinSupportCount
	if len(input) > 0 && len(input) < 50 && minSupport > 2 {
		minSupport = 2
	}
	result := recommendation.Mine(input, recommendation.Config{
		MinSupportCount:   minSupport,
		MinConfidence:     s.cfg.MinConfidence,
		MaxAntecedentSize: s.cfg.MaxAntecedentSize,
		MaxRules:          s.cfg.MaxRules,
	})

	rules := make([]domain.RecommendationRule, 0, len(result.Rules))
	for _, rule := range result.Rules {
		rules = append(rules, domain.RecommendationRule{
			RuleID:               rule.RuleID,
			AntecedentProductIDs: rule.AntecedentProductIDs,
			ConsequentProductID:  rule.ConsequentProductID,
			SupportCount:         rule.SupportCount,
			AntecedentCount:      rule.AntecedentCount,
			ConsequentCount:      rule.ConsequentCount,
			TransactionCount:     rule.TransactionCount,
			Support:              rule.Support,
			Confidence:           rule.Confidence,
			Lift:                 rule.Lift,
			Score:                rule.Score,
			GeneratedAt:          startedAt,
		})
	}
	if err := s.repo.ReplaceRecommendationRules(ctx, rules); err != nil {
		status = "FAILED"
		msg := err.Error()
		finishErr = &msg
		return nil, err
	}

	counts = repository.RecommendationTrainingCounts{
		TransactionCount:     int64(result.TransactionCount),
		FrequentItemsetCount: int64(result.FrequentItemsetCount),
		RuleCount:            int64(len(rules)),
	}

	return map[string]any{
		"runId":                runID,
		"status":               status,
		"fetchedOrders":        len(orders),
		"storedTransactions":   len(transactions),
		"trainingTransactions": result.TransactionCount,
		"frequentItemsets":     result.FrequentItemsetCount,
		"rules":                len(rules),
		"generatedAt":          startedAt.Format(time.RFC3339Nano),
	}, nil
}

func (s *RecommendationService) GetByProduct(ctx context.Context, productID, sellerID string, limit int) (map[string]any, error) {
	productID = strings.TrimSpace(productID)
	if productID == "" {
		return nil, validationError("productId", "is required")
	}
	items, err := s.repo.QueryRecommendationsByProduct(ctx, productID, sellerID, limit)
	if err != nil {
		return nil, err
	}
	return recommendationResponse(map[string]any{"productId": productID, "sellerId": nullableString(sellerID)}, items), nil
}

func (s *RecommendationService) GetByCart(ctx context.Context, productIDs []string, sellerID string, limit int) (map[string]any, error) {
	normalized := normalizeProductIDs(productIDs)
	if len(normalized) == 0 {
		return nil, validationError("productIds", "must contain at least one product ID")
	}
	items, err := s.repo.QueryRecommendationsByCart(ctx, normalized, sellerID, limit)
	if err != nil {
		return nil, err
	}
	return recommendationResponse(map[string]any{"productIds": normalized, "sellerId": nullableString(sellerID)}, items), nil
}

func (s *RecommendationService) GetInsights(ctx context.Context, sellerID string, limit int) (map[string]any, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	run, err := s.repo.GetLatestTrainingRun(ctx)
	if err != nil {
		return nil, err
	}
	rules, err := s.repo.QueryTopRecommendationRules(ctx, sellerID, limit)
	if err != nil {
		return nil, err
	}
	items := make([]map[string]any, 0, len(rules))
	for _, rule := range rules {
		items = append(items, map[string]any{
			"ruleId":               rule.RuleID,
			"antecedentProductIds": rule.AntecedentProductIDs,
			"consequentProductId":  rule.ConsequentProductID,
			"support":              roundMetric(rule.Support),
			"confidence":           roundMetric(rule.Confidence),
			"lift":                 roundMetric(rule.Lift),
			"score":                roundMetric(rule.Score),
			"supportCount":         rule.SupportCount,
			"transactionCount":     rule.TransactionCount,
			"generatedAt":          rule.GeneratedAt.UTC().Format(time.RFC3339Nano),
		})
	}
	return map[string]any{"limit": limit, "sellerId": nullableString(sellerID), "latestTrainingRun": run, "items": items}, nil
}

func BuildRecommendationTransactions(orders []CompletedOrder) []domain.RecommendationTransaction {
	out := make([]domain.RecommendationTransaction, 0, len(orders))
	for _, order := range orders {
		productIDs := make([]string, 0, len(order.Items))
		for _, item := range order.Items {
			productIDs = append(productIDs, item.ProductID)
		}
		productIDs = normalizeProductIDs(productIDs)
		if len(productIDs) < 2 || strings.TrimSpace(order.OrderID) == "" {
			continue
		}
		snapshot := snapshotOrder(order)
		out = append(out, domain.RecommendationTransaction{
			TransactionID:  makeTransactionID(order.OrderID),
			OrderID:        strings.TrimSpace(order.OrderID),
			UserID:         nullableString(order.UserID),
			SellerID:       order.SellerID,
			ProductIDs:     productIDs,
			ItemCount:      len(productIDs),
			SourceSnapshot: &snapshot,
			OccurredAt:     order.CompletedAt.UTC(),
		})
	}
	return out
}

func recommendationResponse(base map[string]any, items []domain.RecommendationItem) map[string]any {
	respItems := make([]map[string]any, 0, len(items))
	var generatedAt any
	for _, item := range items {
		if generatedAt == nil {
			generatedAt = item.GeneratedAt.UTC().Format(time.RFC3339Nano)
		}
		respItems = append(respItems, map[string]any{
			"productId": item.ProductID,
			"score":     roundMetric(item.Score),
			"reason":    item.Reason,
		})
	}
	if generatedAt == nil {
		generatedAt = nil
	}
	base["generatedAt"] = generatedAt
	base["items"] = respItems
	return base
}

func normalizeProductIDs(productIDs []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(productIDs))
	for _, id := range productIDs {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

func snapshotOrder(order CompletedOrder) string {
	data, err := json.Marshal(order)
	if err != nil {
		return "{}"
	}
	return string(data)
}

func makeTransactionID(orderID string) string {
	sum := sha1.Sum([]byte(strings.TrimSpace(orderID)))
	return hex.EncodeToString(sum[:])
}
