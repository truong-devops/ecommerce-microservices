package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"analytics-service/internal/config"
	"analytics-service/internal/repository"
	"analytics-service/internal/service"

	"github.com/jackc/pgx/v5/pgxpool"
)

type seedFile struct {
	Items []service.CompletedOrder `json:"items"`
}

type staticOrderSource struct {
	orders []service.CompletedOrder
}

func (s staticOrderSource) FetchCompletedOrders(_ context.Context, from, to time.Time) ([]service.CompletedOrder, error) {
	out := make([]service.CompletedOrder, 0, len(s.orders))
	for _, order := range s.orders {
		if order.CompletedAt.Before(from) || order.CompletedAt.After(to) {
			continue
		}
		out = append(out, order)
	}
	return out, nil
}

func main() {
	seedPath := flag.String("file", "testdata/recommendation_completed_orders.json", "completed-order seed JSON file")
	refreshTimes := flag.Bool("refresh-times", true, "rewrite completedAt values into the current recommendation window")
	flag.Parse()

	ctx := context.Background()
	cfg, err := config.Load()
	if err != nil {
		fatal(err)
	}

	orders, err := loadOrders(*seedPath)
	if err != nil {
		fatal(err)
	}
	if *refreshTimes {
		orders = rewriteCompletedTimes(orders, time.Now().UTC())
	}

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		fatal(err)
	}
	defer pool.Close()

	repo := repository.NewAnalyticsRepository(pool)
	if err := repo.EnsureSchema(ctx); err != nil {
		fatal(err)
	}

	recommendations := service.NewRecommendationService(repo, staticOrderSource{orders: orders}, service.RecommendationConfig{
		Enabled:           cfg.RecommendationEnabled,
		WindowDays:        cfg.RecommendationWindowDays,
		MinSupportCount:   cfg.RecommendationMinSupportCount,
		MinConfidence:     cfg.RecommendationMinConfidence,
		MaxAntecedentSize: cfg.RecommendationMaxAntecedentSize,
		MaxRules:          cfg.RecommendationMaxRules,
	})
	result, err := recommendations.Train(ctx)
	if err != nil {
		fatal(err)
	}

	encoded, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		fatal(err)
	}
	fmt.Println(string(encoded))
}

func loadOrders(path string) ([]service.CompletedOrder, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var wrapped seedFile
	if err := json.Unmarshal(data, &wrapped); err == nil && len(wrapped.Items) > 0 {
		return cleanOrders(wrapped.Items), nil
	}

	var items []service.CompletedOrder
	if err := json.Unmarshal(data, &items); err != nil {
		return nil, err
	}
	return cleanOrders(items), nil
}

func cleanOrders(orders []service.CompletedOrder) []service.CompletedOrder {
	out := make([]service.CompletedOrder, 0, len(orders))
	for _, order := range orders {
		order.OrderID = strings.TrimSpace(order.OrderID)
		order.UserID = strings.TrimSpace(order.UserID)
		for i := range order.Items {
			order.Items[i].ProductID = strings.TrimSpace(order.Items[i].ProductID)
		}
		if order.OrderID == "" || len(order.Items) == 0 {
			continue
		}
		out = append(out, order)
	}
	return out
}

func rewriteCompletedTimes(orders []service.CompletedOrder, now time.Time) []service.CompletedOrder {
	out := make([]service.CompletedOrder, len(orders))
	copy(out, orders)
	for i := range out {
		out[i].CompletedAt = now.Add(-time.Duration(len(out)-i) * time.Hour)
	}
	return out
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
