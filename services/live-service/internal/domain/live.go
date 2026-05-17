package domain

import "time"

type LiveSessionStatus string

const (
	LiveSessionStatusDraft     LiveSessionStatus = "DRAFT"
	LiveSessionStatusScheduled LiveSessionStatus = "SCHEDULED"
	LiveSessionStatusLive      LiveSessionStatus = "LIVE"
	LiveSessionStatusPaused    LiveSessionStatus = "PAUSED"
	LiveSessionStatusEnded     LiveSessionStatus = "ENDED"
	LiveSessionStatusCancelled LiveSessionStatus = "CANCELLED"
)

type LiveSourceType string

const (
	LiveSourceTypeExternalURL LiveSourceType = "EXTERNAL_URL"
	LiveSourceTypeMediaEngine LiveSourceType = "MEDIA_ENGINE"
)

type LiveMediaProvider string

const (
	LiveMediaProviderP2P      LiveMediaProvider = "P2P"
	LiveMediaProviderMediaMTX LiveMediaProvider = "MEDIAMTX"
	LiveMediaProviderLiveKit  LiveMediaProvider = "LIVEKIT"
)

type LiveIngestProtocol string

const (
	LiveIngestProtocolRTMP   LiveIngestProtocol = "RTMP"
	LiveIngestProtocolWHIP   LiveIngestProtocol = "WHIP"
	LiveIngestProtocolWebRTC LiveIngestProtocol = "WEBRTC"
)

type LivePlaybackProtocol string

const (
	LivePlaybackProtocolHLS    LivePlaybackProtocol = "HLS"
	LivePlaybackProtocolLLHLS  LivePlaybackProtocol = "LL_HLS"
	LivePlaybackProtocolWebRTC LivePlaybackProtocol = "WEBRTC"
)

type LiveMediaStatus string

const (
	LiveMediaStatusIdle     LiveMediaStatus = "IDLE"
	LiveMediaStatusReady    LiveMediaStatus = "READY"
	LiveMediaStatusLive     LiveMediaStatus = "LIVE"
	LiveMediaStatusDegraded LiveMediaStatus = "DEGRADED"
	LiveMediaStatusEnded    LiveMediaStatus = "ENDED"
)

type LiveMediaPublish struct {
	Protocol  LiveIngestProtocol `json:"protocol" bson:"protocol"`
	URL       string             `json:"url" bson:"url"`
	StreamKey string             `json:"streamKey,omitempty" bson:"streamKey,omitempty"`
}

type LiveMediaPlayback struct {
	Protocol LivePlaybackProtocol `json:"protocol" bson:"protocol"`
	URL      string               `json:"url" bson:"url"`
	Token    string               `json:"token,omitempty" bson:"token,omitempty"`
}

type LiveMedia struct {
	Provider   LiveMediaProvider `json:"provider" bson:"provider"`
	StreamName string            `json:"streamName,omitempty" bson:"streamName,omitempty"`
	Publish    LiveMediaPublish  `json:"publish" bson:"publish"`
	Playback   LiveMediaPlayback `json:"playback" bson:"playback"`
	Status     LiveMediaStatus   `json:"status" bson:"status"`
}

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
	Media              *LiveMedia          `json:"media,omitempty"`
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
