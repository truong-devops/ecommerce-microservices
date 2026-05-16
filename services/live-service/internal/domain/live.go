package domain

import "time"

type LiveSessionStatus string

const (
	LiveSessionStatusDraft     LiveSessionStatus = "DRAFT"
	LiveSessionStatusScheduled LiveSessionStatus = "SCHEDULED"
	LiveSessionStatusLive      LiveSessionStatus = "LIVE"
	LiveSessionStatusEnded     LiveSessionStatus = "ENDED"
	LiveSessionStatusCancelled LiveSessionStatus = "CANCELLED"
)

type LiveSourceType string

const (
	LiveSourceTypeExternalURL LiveSourceType = "EXTERNAL_URL"
)

type LiveMetricsSnapshot struct {
	ViewerPeak        int64 `json:"viewerPeak" bson:"viewerPeak"`
	MessageCount      int64 `json:"messageCount" bson:"messageCount"`
	ProductClickCount int64 `json:"productClickCount" bson:"productClickCount"`
	AddToCartCount    int64 `json:"addToCartCount" bson:"addToCartCount"`
}

type LiveSession struct {
	ID                 string              `json:"id"`
	SessionID          string              `json:"sessionId"`
	SellerID           string              `json:"sellerId"`
	Title              string              `json:"title"`
	Description        string              `json:"description,omitempty"`
	ThumbnailURL       string              `json:"thumbnailUrl,omitempty"`
	PlaybackURL        string              `json:"playbackUrl"`
	SourceType         LiveSourceType      `json:"sourceType"`
	Status             LiveSessionStatus   `json:"status"`
	DefaultLanguage    string              `json:"defaultLanguage"`
	SupportedLanguages []string            `json:"supportedLanguages"`
	MetricsSnapshot    LiveMetricsSnapshot `json:"metricsSnapshot"`
	ScheduledAt        *time.Time          `json:"scheduledAt,omitempty"`
	StartedAt          *time.Time          `json:"startedAt,omitempty"`
	EndedAt            *time.Time          `json:"endedAt,omitempty"`
	CreatedAt          time.Time           `json:"createdAt"`
	UpdatedAt          time.Time           `json:"updatedAt"`
}

type ProductPinStatus string

const (
	ProductPinStatusPinned   ProductPinStatus = "PINNED"
	ProductPinStatusUnpinned ProductPinStatus = "UNPINNED"
)

type LiveProduct struct {
	ID               string           `json:"id"`
	SessionID        string           `json:"sessionId"`
	ProductID        string           `json:"productId"`
	SellerID         string           `json:"sellerId"`
	NameSnapshot     string           `json:"nameSnapshot"`
	PriceSnapshot    float64          `json:"priceSnapshot"`
	CurrencySnapshot string           `json:"currencySnapshot"`
	ImageSnapshot    string           `json:"imageSnapshot,omitempty"`
	StatusSnapshot   string           `json:"statusSnapshot"`
	PinStatus        ProductPinStatus `json:"pinStatus"`
	SortOrder        int              `json:"sortOrder"`
	PinnedAt         time.Time        `json:"pinnedAt"`
	UnpinnedAt       *time.Time       `json:"unpinnedAt,omitempty"`
	PinnedBy         string           `json:"pinnedBy"`
}

type LiveMessageStatus string

const (
	LiveMessageStatusVisible LiveMessageStatus = "VISIBLE"
	LiveMessageStatusHidden  LiveMessageStatus = "HIDDEN"
	LiveMessageStatusDeleted LiveMessageStatus = "DELETED"
)

type LiveMessage struct {
	ID              string            `json:"id"`
	MessageID       string            `json:"messageId"`
	SessionID       string            `json:"sessionId"`
	SenderID        string            `json:"senderId"`
	SenderRole      Role              `json:"senderRole"`
	Text            string            `json:"text"`
	ClientMessageID string            `json:"clientMessageId,omitempty"`
	Language        string            `json:"language"`
	Status          LiveMessageStatus `json:"status"`
	CreatedAt       time.Time         `json:"createdAt"`
}
