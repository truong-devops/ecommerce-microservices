package domain

import "time"

type ProductVideoStatus string

const (
	ProductVideoStatusDraft            ProductVideoStatus = "draft"
	ProductVideoStatusProcessing       ProductVideoStatus = "processing"
	ProductVideoStatusProcessingFailed ProductVideoStatus = "processing_failed"
	ProductVideoStatusReviewPending    ProductVideoStatus = "review_pending"
	ProductVideoStatusPublished        ProductVideoStatus = "published"
	ProductVideoStatusHidden           ProductVideoStatus = "hidden"
	ProductVideoStatusRejected         ProductVideoStatus = "rejected"
	ProductVideoStatusArchived         ProductVideoStatus = "archived"
)

type VideoCommentStatus string

const (
	VideoCommentStatusVisible VideoCommentStatus = "VISIBLE"
	VideoCommentStatusHidden  VideoCommentStatus = "HIDDEN"
	VideoCommentStatusDeleted VideoCommentStatus = "DELETED"
)

type VideoProductTagPosition struct {
	X        *float64 `bson:"x,omitempty" json:"x,omitempty"`
	Y        *float64 `bson:"y,omitempty" json:"y,omitempty"`
	StartSec *float64 `bson:"startSec,omitempty" json:"startSec,omitempty"`
	EndSec   *float64 `bson:"endSec,omitempty" json:"endSec,omitempty"`
}

type VideoProductTag struct {
	ProductID        string                   `bson:"productId" json:"productId"`
	SKU              *string                  `bson:"sku,omitempty" json:"sku"`
	NameSnapshot     string                   `bson:"nameSnapshot" json:"nameSnapshot"`
	ImageSnapshot    *string                  `bson:"imageSnapshot,omitempty" json:"imageSnapshot"`
	PriceSnapshot    float64                  `bson:"priceSnapshot" json:"priceSnapshot"`
	CurrencySnapshot string                   `bson:"currencySnapshot" json:"currencySnapshot"`
	StatusSnapshot   string                   `bson:"statusSnapshot" json:"statusSnapshot"`
	SortOrder        int                      `bson:"sortOrder" json:"sortOrder"`
	TagPosition      *VideoProductTagPosition `bson:"tagPosition,omitempty" json:"tagPosition"`
}

type VideoModeration struct {
	SubmittedAt     *time.Time `bson:"submittedAt,omitempty"`
	ReviewedAt      *time.Time `bson:"reviewedAt,omitempty"`
	ReviewedBy      *string    `bson:"reviewedBy,omitempty"`
	RejectionReason *string    `bson:"rejectionReason,omitempty"`
	PolicyFlags     []string   `bson:"policyFlags"`
}

type VideoMetricsSnapshot struct {
	ViewStartedCount   int64      `bson:"viewStartedCount" json:"viewStartedCount"`
	QualifiedViewCount int64      `bson:"qualifiedViewCount" json:"qualifiedViewCount"`
	ProductClickCount  int64      `bson:"productClickCount" json:"productClickCount"`
	AddToCartCount     int64      `bson:"addToCartCount" json:"addToCartCount"`
	CommentCount       int64      `bson:"commentCount" json:"commentCount"`
	CTR                float64    `bson:"ctr" json:"ctr"`
	AddToCartRate      float64    `bson:"addToCartRate" json:"addToCartRate"`
	LastAggregatedAt   *time.Time `bson:"lastAggregatedAt,omitempty" json:"-"`
}

type ProductVideo struct {
	ID                 string
	VideoID            string
	SellerID           string
	Title              string
	Description        *string
	Status             ProductVideoStatus
	MediaObjectKey     *string
	MediaURL           *string
	ThumbnailObjectKey *string
	ThumbnailURL       *string
	MimeType           *string
	SizeBytes          *int64
	DurationSec        *float64
	Products           []VideoProductTag
	Moderation         VideoModeration
	MetricsSnapshot    VideoMetricsSnapshot
	RecentEventKeys    []string
	PublishedAt        *time.Time
	HiddenAt           *time.Time
	ArchivedAt         *time.Time
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

type VideoComment struct {
	ID              string
	CommentID       string
	VideoID         string
	UserID          string
	UserRole        Role
	Text            string
	Status          VideoCommentStatus
	ClientCommentID string
	CreatedAt       time.Time
	UpdatedAt       time.Time
	HiddenAt        *time.Time
	DeletedAt       *time.Time
}

type ListProductVideosQuery struct {
	Page      int
	PageSize  int
	Status    ProductVideoStatus
	SellerID  string
	ProductID string
	Search    string
}

type ListVideoCommentsQuery struct {
	Page     int
	PageSize int
}

type VideoProductResponse struct {
	ProductID   string                   `json:"productId"`
	SKU         *string                  `json:"sku"`
	Name        string                   `json:"name"`
	Image       *string                  `json:"image"`
	Price       float64                  `json:"price"`
	Currency    string                   `json:"currency"`
	Status      string                   `json:"status"`
	SortOrder   int                      `json:"sortOrder"`
	TagPosition *VideoProductTagPosition `json:"tagPosition"`
}

type ProductVideoResponse struct {
	VideoID            string                 `json:"videoId"`
	SellerID           string                 `json:"sellerId"`
	Title              string                 `json:"title"`
	Description        *string                `json:"description"`
	Status             ProductVideoStatus     `json:"status"`
	MediaObjectKey     *string                `json:"mediaObjectKey"`
	MediaURL           *string                `json:"mediaUrl"`
	ThumbnailObjectKey *string                `json:"thumbnailObjectKey"`
	ThumbnailURL       *string                `json:"thumbnailUrl"`
	MimeType           *string                `json:"mimeType"`
	SizeBytes          *int64                 `json:"sizeBytes"`
	DurationSec        *float64               `json:"durationSec"`
	Products           []VideoProductResponse `json:"products"`
	Seller             VideoSellerResponse    `json:"seller"`
	Metrics            VideoMetricsResponse   `json:"metrics"`
	PublishedAt        *string                `json:"publishedAt"`
	HiddenAt           *string                `json:"hiddenAt"`
	ArchivedAt         *string                `json:"archivedAt"`
	CreatedAt          string                 `json:"createdAt"`
	UpdatedAt          string                 `json:"updatedAt"`
}

type VideoSellerResponse struct {
	SellerID   string `json:"sellerId"`
	SellerCode string `json:"sellerCode"`
	ShopName   string `json:"shopName"`
}

type VideoMetricsResponse struct {
	ViewStartedCount   int64   `json:"viewStartedCount"`
	QualifiedViewCount int64   `json:"qualifiedViewCount"`
	ProductClickCount  int64   `json:"productClickCount"`
	AddToCartCount     int64   `json:"addToCartCount"`
	CommentCount       int64   `json:"commentCount"`
	CTR                float64 `json:"ctr"`
	AddToCartRate      float64 `json:"addToCartRate"`
	LastAggregatedAt   *string `json:"lastAggregatedAt"`
}

type VideoCommentResponse struct {
	CommentID       string             `json:"commentId"`
	VideoID         string             `json:"videoId"`
	UserID          string             `json:"userId"`
	UserRole        Role               `json:"userRole"`
	Text            string             `json:"text"`
	Status          VideoCommentStatus `json:"status"`
	ClientCommentID string             `json:"clientCommentId,omitempty"`
	CreatedAt       string             `json:"createdAt"`
	UpdatedAt       string             `json:"updatedAt"`
}

type PaginatedVideos struct {
	Items      []ProductVideoResponse `json:"items"`
	Pagination Pagination             `json:"pagination"`
}

type PaginatedVideoComments struct {
	Items      []VideoCommentResponse `json:"items"`
	Pagination Pagination             `json:"pagination"`
}
