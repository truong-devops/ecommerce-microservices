package domain

import "time"

type RecommendationTransaction struct {
	TransactionID  string
	OrderID        string
	UserID         *string
	SellerID       *string
	ProductIDs     []string
	ItemCount      int
	SourceSnapshot *string
	OccurredAt     time.Time
	CreatedAt      time.Time
}

type RecommendationRule struct {
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
	SellerID             *string
	GeneratedAt          time.Time
	CreatedAt            time.Time
}

type RecommendationTrainingRun struct {
	RunID                string
	Status               string
	WindowDays           int
	MinSupportCount      int
	MinConfidence        float64
	MaxAntecedentSize    int
	TransactionCount     int64
	FrequentItemsetCount int64
	RuleCount            int64
	StartedAt            time.Time
	FinishedAt           *time.Time
	ErrorMessage         *string
}

type RecommendationItem struct {
	ProductID   string
	Score       float64
	Support     float64
	Confidence  float64
	Lift        float64
	Reason      string
	GeneratedAt time.Time
}
