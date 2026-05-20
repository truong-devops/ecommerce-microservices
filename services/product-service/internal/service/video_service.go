package service

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"product-service/internal/domain"
	"product-service/internal/events"
	"product-service/internal/httpx"
	"product-service/internal/repository"
	"product-service/internal/timefmt"

	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/bson"
)

type VideoService struct {
	repo               repository.VideoRepository
	productRepo        repository.ProductRepository
	redis              *RedisService
	events             events.ProductEventPublisher
	mediaPublicBaseURL string
	cacheTTL           time.Duration
	cacheKeySet        string
}

type VideoProductInput struct {
	ProductID   string                          `json:"productId"`
	SortOrder   *int                            `json:"sortOrder,omitempty"`
	TagPosition *domain.VideoProductTagPosition `json:"tagPosition,omitempty"`
}

type CreateVideoInput struct {
	SellerID    string              `json:"sellerId,omitempty"`
	Title       string              `json:"title"`
	Description *string             `json:"description,omitempty"`
	Products    []VideoProductInput `json:"products"`
}

type UpdateVideoInput struct {
	Title       *string             `json:"title,omitempty"`
	Description *string             `json:"description,omitempty"`
	Products    []VideoProductInput `json:"products,omitempty"`
}

type ConfirmVideoMediaInput struct {
	MediaObjectKey string   `json:"mediaObjectKey"`
	MediaURL       *string  `json:"mediaUrl,omitempty"`
	MimeType       string   `json:"mimeType"`
	SizeBytes      *int64   `json:"sizeBytes,omitempty"`
	DurationSec    *float64 `json:"durationSec,omitempty"`
}

type ConfirmVideoThumbnailInput struct {
	ThumbnailObjectKey string  `json:"thumbnailObjectKey"`
	ThumbnailURL       *string `json:"thumbnailUrl,omitempty"`
}

type TrackVideoEventInput struct {
	ProductID          string   `json:"productId,omitempty"`
	Source             string   `json:"source,omitempty"`
	AnonymousSessionID string   `json:"anonymousSessionId,omitempty"`
	ClientEventID      string   `json:"clientEventId,omitempty"`
	WatchTimeSec       *float64 `json:"watchTimeSec,omitempty"`
}

type CreateVideoCommentInput struct {
	Text            string `json:"text"`
	ClientCommentID string `json:"clientCommentId,omitempty"`
}

func NewVideoService(repo repository.VideoRepository, productRepo repository.ProductRepository, redisService *RedisService, eventPublisher events.ProductEventPublisher, mediaPublicBaseURL string) *VideoService {
	return &VideoService{
		repo:               repo,
		productRepo:        productRepo,
		redis:              redisService,
		events:             eventPublisher,
		mediaPublicBaseURL: strings.TrimRight(mediaPublicBaseURL, "/"),
		cacheTTL:           45 * time.Second,
		cacheKeySet:        "product-videos:feed:v1:keys",
	}
}

func (s *VideoService) CreateVideo(ctx context.Context, user domain.UserContext, input CreateVideoInput) (domain.ProductVideoResponse, error) {
	if strings.TrimSpace(input.SellerID) != "" && !isUUIDString(input.SellerID) {
		return domain.ProductVideoResponse{}, validationError("sellerId must be a UUID")
	}
	if strings.TrimSpace(input.Title) == "" || len(strings.TrimSpace(input.Title)) < 3 || len(strings.TrimSpace(input.Title)) > 120 {
		return domain.ProductVideoResponse{}, validationError("title must be between 3 and 120 characters")
	}
	if input.Description != nil && len(strings.TrimSpace(*input.Description)) > 1000 {
		return domain.ProductVideoResponse{}, validationError("description must be at most 1000 characters")
	}
	if len(input.Products) == 0 {
		return domain.ProductVideoResponse{}, validationError("products must contain at least 1 elements")
	}
	sellerID, err := resolveVideoSellerID(user, input.SellerID)
	if err != nil {
		return domain.ProductVideoResponse{}, err
	}
	products, err := s.buildProductTags(ctx, sellerID, input.Products)
	if err != nil {
		return domain.ProductVideoResponse{}, err
	}
	created, err := s.repo.CreateVideo(ctx, repository.CreateVideoPayload{
		VideoID:     uuid.NewString(),
		SellerID:    sellerID,
		Title:       strings.TrimSpace(input.Title),
		Description: trimStringPtr(input.Description),
		Status:      domain.ProductVideoStatusDraft,
		Products:    products,
	})
	if err != nil {
		return domain.ProductVideoResponse{}, err
	}
	return s.ToVideoResponse(created), nil
}

func (s *VideoService) ListManagedVideos(ctx context.Context, user domain.UserContext, query domain.ListProductVideosQuery) (domain.PaginatedVideos, error) {
	normalized := normalizeVideoQuery(query)
	sellerID := ""
	if domain.IsSeller(user.Role) {
		sellerID = user.UserID
	}
	items, total, err := s.repo.ListManaged(ctx, normalized, sellerID)
	if err != nil {
		return domain.PaginatedVideos{}, err
	}
	return s.paginatedVideos(items, normalized, total), nil
}

func (s *VideoService) UpdateVideo(ctx context.Context, user domain.UserContext, videoID string, input UpdateVideoInput) (domain.ProductVideoResponse, error) {
	existing, err := s.requireVideo(ctx, videoID)
	if err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if err := assertCanManageVideo(user, *existing); err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if err := assertVideoEditable(*existing); err != nil {
		return domain.ProductVideoResponse{}, err
	}
	set := bson.M{}
	if input.Title != nil {
		title := strings.TrimSpace(*input.Title)
		if len(title) < 3 || len(title) > 120 {
			return domain.ProductVideoResponse{}, validationError("title must be between 3 and 120 characters")
		}
		set["title"] = title
	}
	if input.Description != nil {
		if len(strings.TrimSpace(*input.Description)) > 1000 {
			return domain.ProductVideoResponse{}, validationError("description must be at most 1000 characters")
		}
		set["description"] = trimStringPtr(input.Description)
	}
	if input.Products != nil {
		if len(input.Products) == 0 {
			return domain.ProductVideoResponse{}, validationError("products must contain at least 1 elements")
		}
		products, err := s.buildProductTags(ctx, existing.SellerID, input.Products)
		if err != nil {
			return domain.ProductVideoResponse{}, err
		}
		set["products"] = products
	}
	updated, err := s.repo.UpdateByVideoID(ctx, existing.VideoID, set)
	if err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if updated == nil {
		return domain.ProductVideoResponse{}, videoNotFound()
	}
	s.invalidateFeedCache(ctx)
	return s.ToVideoResponse(*updated), nil
}

func (s *VideoService) ConfirmMedia(ctx context.Context, user domain.UserContext, videoID string, input ConfirmVideoMediaInput) (domain.ProductVideoResponse, error) {
	existing, err := s.requireVideo(ctx, videoID)
	if err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if err := assertCanManageVideo(user, *existing); err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if err := assertVideoEditable(*existing); err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if !isMediaObjectKey(input.MediaObjectKey) {
		return domain.ProductVideoResponse{}, validationError("mediaObjectKey is invalid")
	}
	if input.MediaURL != nil && len(*input.MediaURL) > 1000 {
		return domain.ProductVideoResponse{}, validationError("mediaUrl must be at most 1000 characters")
	}
	if input.MimeType != "video/mp4" && input.MimeType != "video/webm" {
		return domain.ProductVideoResponse{}, validationError("mimeType is invalid")
	}
	if input.SizeBytes != nil && (*input.SizeBytes < 1 || *input.SizeBytes > 50*1024*1024) {
		return domain.ProductVideoResponse{}, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, "Video must be 50MB or smaller", nil)
	}
	if input.DurationSec != nil && (*input.DurationSec < 1 || *input.DurationSec > 600) {
		return domain.ProductVideoResponse{}, validationError("durationSec must be between 1 and 600")
	}
	updated, err := s.repo.UpdateByVideoID(ctx, existing.VideoID, bson.M{
		"mediaObjectKey": strings.TrimSpace(input.MediaObjectKey),
		"mediaUrl":       trimStringPtr(input.MediaURL),
		"mimeType":       strings.ToLower(strings.TrimSpace(input.MimeType)),
		"sizeBytes":      input.SizeBytes,
		"durationSec":    input.DurationSec,
		"status":         domain.ProductVideoStatusProcessing,
	})
	if err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if updated == nil {
		return domain.ProductVideoResponse{}, videoNotFound()
	}
	s.invalidateFeedCache(ctx)
	return s.ToVideoResponse(*updated), nil
}

func (s *VideoService) ConfirmThumbnail(ctx context.Context, user domain.UserContext, videoID string, input ConfirmVideoThumbnailInput) (domain.ProductVideoResponse, error) {
	existing, err := s.requireVideo(ctx, videoID)
	if err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if err := assertCanManageVideo(user, *existing); err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if err := assertVideoEditable(*existing); err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if !isMediaObjectKey(input.ThumbnailObjectKey) {
		return domain.ProductVideoResponse{}, validationError("thumbnailObjectKey is invalid")
	}
	if input.ThumbnailURL != nil && len(*input.ThumbnailURL) > 1000 {
		return domain.ProductVideoResponse{}, validationError("thumbnailUrl must be at most 1000 characters")
	}
	updated, err := s.repo.UpdateByVideoID(ctx, existing.VideoID, bson.M{
		"thumbnailObjectKey": strings.TrimSpace(input.ThumbnailObjectKey),
		"thumbnailUrl":       trimStringPtr(input.ThumbnailURL),
	})
	if err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if updated == nil {
		return domain.ProductVideoResponse{}, videoNotFound()
	}
	s.invalidateFeedCache(ctx)
	return s.ToVideoResponse(*updated), nil
}

func (s *VideoService) SubmitReview(ctx context.Context, user domain.UserContext, videoID string) (domain.ProductVideoResponse, error) {
	existing, err := s.requireVideo(ctx, videoID)
	if err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if err := assertCanManageVideo(user, *existing); err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if err := assertReadyForPublish(*existing); err != nil {
		return domain.ProductVideoResponse{}, err
	}
	now := time.Now().UTC()
	moderation := existing.Moderation
	moderation.SubmittedAt = &now
	updated, err := s.repo.UpdateByVideoID(ctx, existing.VideoID, bson.M{"status": domain.ProductVideoStatusReviewPending, "moderation": moderation})
	if err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if updated == nil {
		return domain.ProductVideoResponse{}, videoNotFound()
	}
	s.invalidateFeedCache(ctx)
	return s.ToVideoResponse(*updated), nil
}

func (s *VideoService) PublishVideo(ctx context.Context, user domain.UserContext, videoID string) (domain.ProductVideoResponse, error) {
	if !domain.IsStaff(user.Role) {
		return domain.ProductVideoResponse{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Only staff can publish videos after review", nil)
	}
	existing, err := s.requireVideo(ctx, videoID)
	if err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if err := assertReadyForPublish(*existing); err != nil {
		return domain.ProductVideoResponse{}, err
	}
	publishedAt := existing.PublishedAt
	if publishedAt == nil {
		now := time.Now().UTC()
		publishedAt = &now
	}
	updated, err := s.repo.UpdateByVideoID(ctx, existing.VideoID, bson.M{"status": domain.ProductVideoStatusPublished, "publishedAt": publishedAt, "hiddenAt": nil})
	if err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if updated == nil {
		return domain.ProductVideoResponse{}, videoNotFound()
	}
	s.invalidateFeedCache(ctx)
	return s.ToVideoResponse(*updated), nil
}

func (s *VideoService) UnpublishVideo(ctx context.Context, user domain.UserContext, videoID string) (domain.ProductVideoResponse, error) {
	existing, err := s.requireVideo(ctx, videoID)
	if err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if err := assertCanManageVideo(user, *existing); err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if existing.Status != domain.ProductVideoStatusPublished {
		return domain.ProductVideoResponse{}, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, "Only published videos can be unpublished", nil)
	}
	now := time.Now().UTC()
	updated, err := s.repo.UpdateByVideoID(ctx, existing.VideoID, bson.M{"status": domain.ProductVideoStatusHidden, "hiddenAt": now})
	if err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if updated == nil {
		return domain.ProductVideoResponse{}, videoNotFound()
	}
	s.invalidateFeedCache(ctx)
	return s.ToVideoResponse(*updated), nil
}

func (s *VideoService) ArchiveVideo(ctx context.Context, user domain.UserContext, videoID string) (domain.ProductVideoResponse, error) {
	existing, err := s.requireVideo(ctx, videoID)
	if err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if err := assertCanManageVideo(user, *existing); err != nil {
		return domain.ProductVideoResponse{}, err
	}
	now := time.Now().UTC()
	updated, err := s.repo.UpdateByVideoID(ctx, existing.VideoID, bson.M{"status": domain.ProductVideoStatusArchived, "archivedAt": now})
	if err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if updated == nil {
		return domain.ProductVideoResponse{}, videoNotFound()
	}
	s.invalidateFeedCache(ctx)
	return s.ToVideoResponse(*updated), nil
}

func (s *VideoService) ListFeed(ctx context.Context, query domain.ListProductVideosQuery) (domain.PaginatedVideos, error) {
	normalized := normalizeVideoQuery(query)
	cacheKey := buildVideoFeedCacheKey(normalized)
	if cached, ok := s.readFeedCache(ctx, cacheKey); ok {
		return cached, nil
	}
	items, total, err := s.repo.ListFeed(ctx, normalized)
	if err != nil {
		return domain.PaginatedVideos{}, err
	}
	response := s.paginatedVideos(items, normalized, total)
	s.writeFeedCache(ctx, cacheKey, response)
	return response, nil
}

func (s *VideoService) GetPublicVideo(ctx context.Context, videoID string) (domain.ProductVideoResponse, error) {
	video, err := s.repo.FindPublishedByVideoID(ctx, strings.TrimSpace(videoID))
	if err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if video == nil {
		return domain.ProductVideoResponse{}, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Video not found", nil)
	}
	return s.ToVideoResponse(*video), nil
}

func (s *VideoService) ListReviewQueue(ctx context.Context, user domain.UserContext, query domain.ListProductVideosQuery) (domain.PaginatedVideos, error) {
	if !domain.IsStaff(user.Role) {
		return domain.PaginatedVideos{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Only staff can review videos", nil)
	}
	normalized := normalizeVideoQuery(query)
	if normalized.Status == "" {
		normalized.Status = domain.ProductVideoStatusReviewPending
	}
	items, total, err := s.repo.ListManaged(ctx, normalized, "")
	if err != nil {
		return domain.PaginatedVideos{}, err
	}
	return s.paginatedVideos(items, normalized, total), nil
}

func (s *VideoService) ApproveVideo(ctx context.Context, user domain.UserContext, videoID string) (domain.ProductVideoResponse, error) {
	if !domain.IsStaff(user.Role) {
		return domain.ProductVideoResponse{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Only staff can approve videos", nil)
	}
	existing, err := s.requireVideo(ctx, videoID)
	if err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if err := assertReadyForPublish(*existing); err != nil {
		return domain.ProductVideoResponse{}, err
	}
	now := time.Now().UTC()
	publishedAt := existing.PublishedAt
	if publishedAt == nil {
		publishedAt = &now
	}
	moderation := existing.Moderation
	moderation.ReviewedAt = &now
	moderation.ReviewedBy = &user.UserID
	moderation.RejectionReason = nil
	updated, err := s.repo.UpdateByVideoID(ctx, existing.VideoID, bson.M{
		"status":      domain.ProductVideoStatusPublished,
		"publishedAt": publishedAt,
		"hiddenAt":    nil,
		"moderation":  moderation,
	})
	if err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if updated == nil {
		return domain.ProductVideoResponse{}, videoNotFound()
	}
	s.invalidateFeedCache(ctx)
	return s.ToVideoResponse(*updated), nil
}

func (s *VideoService) RejectVideo(ctx context.Context, user domain.UserContext, videoID string, reason string) (domain.ProductVideoResponse, error) {
	if !domain.IsStaff(user.Role) {
		return domain.ProductVideoResponse{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Only staff can reject videos", nil)
	}
	existing, err := s.requireVideo(ctx, videoID)
	if err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if existing.Status == domain.ProductVideoStatusArchived || existing.Status == domain.ProductVideoStatusPublished {
		return domain.ProductVideoResponse{}, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, "Published or archived videos cannot be rejected", nil)
	}
	now := time.Now().UTC()
	trimmedReason := strings.TrimSpace(reason)
	if trimmedReason == "" {
		trimmedReason = "Video content did not pass review"
	}
	moderation := existing.Moderation
	moderation.ReviewedAt = &now
	moderation.ReviewedBy = &user.UserID
	moderation.RejectionReason = &trimmedReason
	updated, err := s.repo.UpdateByVideoID(ctx, existing.VideoID, bson.M{"status": domain.ProductVideoStatusRejected, "moderation": moderation})
	if err != nil {
		return domain.ProductVideoResponse{}, err
	}
	if updated == nil {
		return domain.ProductVideoResponse{}, videoNotFound()
	}
	s.invalidateFeedCache(ctx)
	return s.ToVideoResponse(*updated), nil
}

func (s *VideoService) TrackEvent(ctx context.Context, videoID string, eventType string, input TrackVideoEventInput) (map[string]bool, error) {
	if err := validateTrackVideoEventInput(input); err != nil {
		return nil, err
	}
	video, err := s.repo.FindPublishedByVideoID(ctx, strings.TrimSpace(videoID))
	if err != nil {
		return nil, err
	}
	if video == nil {
		return nil, videoNotFound()
	}
	increments := map[string]int64{}
	switch eventType {
	case "view-started":
		increments["viewStartedCount"] = 1
	case "view-qualified":
		increments["qualifiedViewCount"] = 1
	case "product-clicked":
		increments["productClickCount"] = 1
	case "add-to-cart":
		increments["addToCartCount"] = 1
	default:
		return nil, validationError("Invalid video event")
	}
	eventKey := buildVideoEventKey(video.VideoID, eventType, input)
	accepted, err := s.repo.IncrementMetricsOnce(ctx, video.VideoID, eventKey, increments)
	if err != nil {
		return nil, err
	}
	if accepted && s.events != nil {
		_ = s.events.PublishVideoAnalyticsEvent(ctx, "video."+strings.ReplaceAll(eventType, "-", "_"), buildAnalyticsVideoPayload(*video, input), eventKey)
	}
	return map[string]bool{"accepted": true}, nil
}

func (s *VideoService) ListComments(ctx context.Context, videoID string, query domain.ListVideoCommentsQuery) (domain.PaginatedVideoComments, error) {
	normalized := normalizeVideoCommentQuery(query)
	video, err := s.repo.FindPublishedByVideoID(ctx, strings.TrimSpace(videoID))
	if err != nil {
		return domain.PaginatedVideoComments{}, err
	}
	if video == nil {
		return domain.PaginatedVideoComments{}, videoNotFound()
	}
	items, total, err := s.repo.ListComments(ctx, video.VideoID, normalized)
	if err != nil {
		return domain.PaginatedVideoComments{}, err
	}
	responses := make([]domain.VideoCommentResponse, 0, len(items))
	for _, item := range items {
		responses = append(responses, s.ToVideoCommentResponse(item))
	}
	return domain.PaginatedVideoComments{Items: responses, Pagination: buildPagination(normalized.Page, normalized.PageSize, total)}, nil
}

func (s *VideoService) CreateComment(ctx context.Context, user domain.UserContext, videoID string, input CreateVideoCommentInput) (domain.VideoCommentResponse, error) {
	if !domain.IsKnownRole(user.Role) {
		return domain.VideoCommentResponse{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient permission", nil)
	}
	video, err := s.repo.FindPublishedByVideoID(ctx, strings.TrimSpace(videoID))
	if err != nil {
		return domain.VideoCommentResponse{}, err
	}
	if video == nil {
		return domain.VideoCommentResponse{}, videoNotFound()
	}
	text := strings.TrimSpace(input.Text)
	if len(text) < 1 || len(text) > 1000 {
		return domain.VideoCommentResponse{}, validationError("text must be between 1 and 1000 characters")
	}
	safetyDecision := ValidateChatMessage(text)
	if !safetyDecision.Allowed {
		return domain.VideoCommentResponse{}, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeChatMessageBlocked, safetyDecision.Reason, map[string]any{
			"ruleId": safetyDecision.RuleID,
			"score":  safetyDecision.Score,
		})
	}
	clientCommentID := strings.TrimSpace(input.ClientCommentID)
	if len(clientCommentID) > 128 {
		return domain.VideoCommentResponse{}, validationError("clientCommentId must be at most 128 characters")
	}
	comment, created, err := s.repo.CreateComment(ctx, repository.CreateVideoCommentPayload{
		CommentID:       uuid.NewString(),
		VideoID:         video.VideoID,
		UserID:          user.UserID,
		UserRole:        user.Role,
		Text:            text,
		ClientCommentID: clientCommentID,
	})
	if err != nil {
		return domain.VideoCommentResponse{}, err
	}
	if created {
		if err := s.repo.IncrementCommentCount(ctx, video.VideoID); err != nil {
			return domain.VideoCommentResponse{}, err
		}
	}
	return s.ToVideoCommentResponse(comment), nil
}

func (s *VideoService) paginatedVideos(items []domain.ProductVideo, query domain.ListProductVideosQuery, total int64) domain.PaginatedVideos {
	responses := make([]domain.ProductVideoResponse, 0, len(items))
	for _, item := range items {
		responses = append(responses, s.ToVideoResponse(item))
	}
	return domain.PaginatedVideos{Items: responses, Pagination: buildPagination(query.Page, query.PageSize, total)}
}

func (s *VideoService) requireVideo(ctx context.Context, videoID string) (*domain.ProductVideo, error) {
	video, err := s.repo.FindByVideoID(ctx, strings.TrimSpace(videoID), false)
	if err != nil {
		return nil, err
	}
	if video == nil {
		return nil, videoNotFound()
	}
	return video, nil
}

func (s *VideoService) buildProductTags(ctx context.Context, sellerID string, inputs []VideoProductInput) ([]domain.VideoProductTag, error) {
	normalized := make([]VideoProductInput, 0, len(inputs))
	seen := map[string]struct{}{}
	ids := make([]string, 0, len(inputs))
	for index, input := range inputs {
		productID := strings.TrimSpace(input.ProductID)
		if productID == "" || len(productID) > 64 {
			return nil, validationError("productId is required")
		}
		if input.SortOrder != nil && *input.SortOrder < 1 {
			return nil, validationError("sortOrder must be at least 1")
		}
		if err := validateTagPosition(input.TagPosition); err != nil {
			return nil, err
		}
		if _, ok := seen[productID]; ok {
			return nil, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, "Duplicate product in video", nil)
		}
		seen[productID] = struct{}{}
		if input.SortOrder == nil {
			sortOrder := index + 1
			input.SortOrder = &sortOrder
		}
		input.ProductID = productID
		normalized = append(normalized, input)
		ids = append(ids, productID)
	}
	products, err := s.productRepo.FindByIDsOrdered(ctx, ids)
	if err != nil {
		return nil, err
	}
	if len(products) != len(ids) {
		return nil, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, "One or more products do not exist", nil)
	}
	byID := map[string]domain.Product{}
	for _, product := range products {
		byID[product.ID] = product
	}
	tags := make([]domain.VideoProductTag, 0, len(normalized))
	for _, input := range normalized {
		product, ok := byID[input.ProductID]
		if !ok {
			return nil, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, "One or more products do not exist", nil)
		}
		if product.SellerID != sellerID {
			return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Seller can only attach own products to video", nil)
		}
		var sku *string
		currency := "VND"
		if len(product.Variants) > 0 {
			chosen := product.Variants[0]
			for _, variant := range product.Variants {
				if variant.IsDefault {
					chosen = variant
					break
				}
			}
			sku = &chosen.SKU
			currency = chosen.Currency
		}
		var image *string
		if len(product.Images) > 0 {
			image = resolveMediaURL(nil, &product.Images[0], s.mediaPublicBaseURL)
		}
		tags = append(tags, domain.VideoProductTag{
			ProductID:        product.ID,
			SKU:              sku,
			NameSnapshot:     product.Name,
			ImageSnapshot:    image,
			PriceSnapshot:    product.MinPrice,
			CurrencySnapshot: currency,
			StatusSnapshot:   string(product.Status),
			SortOrder:        *input.SortOrder,
			TagPosition:      input.TagPosition,
		})
	}
	return tags, nil
}

func (s *VideoService) ToVideoResponse(video domain.ProductVideo) domain.ProductVideoResponse {
	metrics := video.MetricsSnapshot
	qualifiedViews := metrics.QualifiedViewCount
	productClicks := metrics.ProductClickCount
	addToCart := metrics.AddToCartCount
	ctr := float64(0)
	if qualifiedViews > 0 {
		ctr = roundRate(float64(productClicks) / float64(qualifiedViews))
	}
	addToCartRate := float64(0)
	if productClicks > 0 {
		addToCartRate = roundRate(float64(addToCart) / float64(productClicks))
	}
	products := make([]domain.VideoProductResponse, 0, len(video.Products))
	for _, product := range video.Products {
		image := resolveMediaURL(product.ImageSnapshot, product.ImageSnapshot, s.mediaPublicBaseURL)
		products = append(products, domain.VideoProductResponse{
			ProductID:   product.ProductID,
			SKU:         product.SKU,
			Name:        product.NameSnapshot,
			Image:       image,
			Price:       product.PriceSnapshot,
			Currency:    product.CurrencySnapshot,
			Status:      product.StatusSnapshot,
			SortOrder:   product.SortOrder,
			TagPosition: product.TagPosition,
		})
	}
	return domain.ProductVideoResponse{
		VideoID:            video.VideoID,
		SellerID:           video.SellerID,
		Title:              video.Title,
		Description:        video.Description,
		Status:             video.Status,
		MediaObjectKey:     video.MediaObjectKey,
		MediaURL:           resolveMediaURL(video.MediaURL, video.MediaObjectKey, s.mediaPublicBaseURL),
		ThumbnailObjectKey: video.ThumbnailObjectKey,
		ThumbnailURL:       resolveMediaURL(video.ThumbnailURL, video.ThumbnailObjectKey, s.mediaPublicBaseURL),
		MimeType:           video.MimeType,
		SizeBytes:          video.SizeBytes,
		DurationSec:        video.DurationSec,
		Products:           products,
		Seller: domain.VideoSellerResponse{
			SellerID:   video.SellerID,
			SellerCode: ToDisplayCode(video.SellerID, "SEL"),
			ShopName:   "Shop " + ToDisplayCode(video.SellerID, "SEL"),
		},
		Metrics: domain.VideoMetricsResponse{
			ViewStartedCount:   metrics.ViewStartedCount,
			QualifiedViewCount: qualifiedViews,
			ProductClickCount:  productClicks,
			AddToCartCount:     addToCart,
			CommentCount:       metrics.CommentCount,
			CTR:                ctr,
			AddToCartRate:      addToCartRate,
			LastAggregatedAt:   formatTimePtr(metrics.LastAggregatedAt),
		},
		PublishedAt: formatTimePtr(video.PublishedAt),
		HiddenAt:    formatTimePtr(video.HiddenAt),
		ArchivedAt:  formatTimePtr(video.ArchivedAt),
		CreatedAt:   timefmt.ISO(video.CreatedAt),
		UpdatedAt:   timefmt.ISO(video.UpdatedAt),
	}
}

func (s *VideoService) ToVideoCommentResponse(comment domain.VideoComment) domain.VideoCommentResponse {
	return domain.VideoCommentResponse{
		CommentID:       comment.CommentID,
		VideoID:         comment.VideoID,
		UserID:          comment.UserID,
		UserRole:        comment.UserRole,
		Text:            comment.Text,
		Status:          comment.Status,
		ClientCommentID: comment.ClientCommentID,
		CreatedAt:       timefmt.ISO(comment.CreatedAt),
		UpdatedAt:       timefmt.ISO(comment.UpdatedAt),
	}
}

func (s *VideoService) readFeedCache(ctx context.Context, key string) (domain.PaginatedVideos, bool) {
	if s.redis == nil {
		return domain.PaginatedVideos{}, false
	}
	client := s.redis.Client()
	if client == nil {
		return domain.PaginatedVideos{}, false
	}
	raw, err := client.Get(ctx, key).Result()
	if err != nil || raw == "" {
		return domain.PaginatedVideos{}, false
	}
	var value domain.PaginatedVideos
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		return domain.PaginatedVideos{}, false
	}
	return value, true
}

func (s *VideoService) writeFeedCache(ctx context.Context, key string, value domain.PaginatedVideos) {
	if s.redis == nil {
		return
	}
	client := s.redis.Client()
	if client == nil {
		return
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return
	}
	_ = client.Set(ctx, key, raw, s.cacheTTL).Err()
	_ = client.SAdd(ctx, s.cacheKeySet, key).Err()
}

func (s *VideoService) invalidateFeedCache(ctx context.Context) {
	if s.redis == nil {
		return
	}
	client := s.redis.Client()
	if client == nil {
		return
	}
	keys, err := client.SMembers(ctx, s.cacheKeySet).Result()
	if err == nil && len(keys) > 0 {
		_ = client.Del(ctx, keys...).Err()
	}
	_ = client.Del(ctx, s.cacheKeySet).Err()
}

func normalizeVideoQuery(query domain.ListProductVideosQuery) domain.ListProductVideosQuery {
	if query.Page < 1 {
		query.Page = 1
	}
	if query.PageSize < 1 {
		query.PageSize = 20
	}
	if query.PageSize > 100 {
		query.PageSize = 100
	}
	query.ProductID = strings.TrimSpace(query.ProductID)
	query.SellerID = strings.TrimSpace(query.SellerID)
	query.Search = strings.TrimSpace(query.Search)
	return query
}

func normalizeVideoCommentQuery(query domain.ListVideoCommentsQuery) domain.ListVideoCommentsQuery {
	if query.Page < 1 {
		query.Page = 1
	}
	if query.PageSize < 1 {
		query.PageSize = 20
	}
	if query.PageSize > 100 {
		query.PageSize = 100
	}
	return query
}

func buildVideoFeedCacheKey(query domain.ListProductVideosQuery) string {
	params := url.Values{}
	params.Set("page", strconv.Itoa(query.Page))
	params.Set("pageSize", strconv.Itoa(query.PageSize))
	if query.ProductID != "" {
		params.Set("productId", query.ProductID)
	}
	if query.SellerID != "" {
		params.Set("sellerId", query.SellerID)
	}
	if query.Search != "" {
		params.Set("search", query.Search)
	}
	return "product-videos:feed:v1:" + params.Encode()
}

func formatTimePtr(value *time.Time) *string {
	if value == nil {
		return nil
	}
	out := timefmt.ISO(*value)
	return &out
}

func roundRate(value float64) float64 {
	return math.Round(value*10000) / 10000
}

func resolveVideoSellerID(user domain.UserContext, requested string) (string, error) {
	requested = strings.TrimSpace(requested)
	if domain.IsSeller(user.Role) {
		if requested != "" && requested != user.UserID {
			return "", httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Seller cannot create videos for another seller", nil)
		}
		return user.UserID, nil
	}
	if domain.IsStaff(user.Role) {
		if requested == "" {
			return "", httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, "sellerId is required for staff-created videos", nil)
		}
		return requested, nil
	}
	return "", httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Role cannot create videos", nil)
}

func assertCanManageVideo(user domain.UserContext, video domain.ProductVideo) error {
	if domain.IsStaff(user.Role) {
		return nil
	}
	if domain.IsSeller(user.Role) && video.SellerID == user.UserID {
		return nil
	}
	if domain.IsBuyer(user.Role) {
		return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Buyer cannot manage videos", nil)
	}
	return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient permission", nil)
}

func assertVideoEditable(video domain.ProductVideo) error {
	if video.Status == domain.ProductVideoStatusArchived || video.Status == domain.ProductVideoStatusReviewPending {
		return httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, "Video cannot be edited in its current status", nil)
	}
	return nil
}

func assertReadyForPublish(video domain.ProductVideo) error {
	if video.MediaObjectKey == nil || video.MimeType == nil || (*video.MimeType != "video/mp4" && *video.MimeType != "video/webm") {
		return httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, "Video media is required before publishing", nil)
	}
	if len(video.Products) == 0 {
		return httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, "At least one product is required before publishing", nil)
	}
	for _, product := range video.Products {
		if product.StatusSnapshot != string(domain.ProductStatusActive) {
			return httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, "Only active products can be published in video", nil)
		}
	}
	return nil
}

func videoNotFound() error {
	return httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Video not found", nil)
}

func isMediaObjectKey(value string) bool {
	trimmed := strings.TrimSpace(value)
	return len(trimmed) >= 2 && len(trimmed) <= 1024 && objectKeyRegex.MatchString(trimmed)
}

func validateTagPosition(position *domain.VideoProductTagPosition) error {
	if position == nil {
		return nil
	}
	if position.X != nil && (*position.X < 0 || *position.X > 100) {
		return validationError("tagPosition.x must be between 0 and 100")
	}
	if position.Y != nil && (*position.Y < 0 || *position.Y > 100) {
		return validationError("tagPosition.y must be between 0 and 100")
	}
	if position.StartSec != nil && *position.StartSec < 0 {
		return validationError("tagPosition.startSec must be at least 0")
	}
	if position.EndSec != nil && *position.EndSec < 0 {
		return validationError("tagPosition.endSec must be at least 0")
	}
	return nil
}

func validateTrackVideoEventInput(input TrackVideoEventInput) error {
	if len(strings.TrimSpace(input.Source)) > 80 {
		return validationError("source must be at most 80 characters")
	}
	if len(strings.TrimSpace(input.AnonymousSessionID)) > 120 {
		return validationError("anonymousSessionId must be at most 120 characters")
	}
	if len(strings.TrimSpace(input.ClientEventID)) > 120 {
		return validationError("clientEventId must be at most 120 characters")
	}
	if input.WatchTimeSec != nil && *input.WatchTimeSec < 0 {
		return validationError("watchTimeSec must be at least 0")
	}
	return nil
}

func buildVideoEventKey(videoID string, eventType string, input TrackVideoEventInput) string {
	if strings.TrimSpace(input.ClientEventID) != "" {
		return truncateString(eventType+":"+strings.TrimSpace(input.ClientEventID), 180)
	}
	sessionID := strings.TrimSpace(input.AnonymousSessionID)
	if sessionID == "" {
		sessionID = "anonymous"
	}
	productID := strings.TrimSpace(input.ProductID)
	if productID == "" {
		productID = "no-product"
	}
	watchBucket := "na"
	if input.WatchTimeSec != nil {
		watchBucket = strconv.Itoa(int(math.Floor(*input.WatchTimeSec/3) * 3))
	}
	return truncateString(eventType+":"+videoID+":"+sessionID+":"+productID+":"+watchBucket, 180)
}

func buildAnalyticsVideoPayload(video domain.ProductVideo, input TrackVideoEventInput) map[string]any {
	productID := strings.TrimSpace(input.ProductID)
	if productID == "" && len(video.Products) > 0 {
		productID = video.Products[0].ProductID
	}
	source := strings.TrimSpace(input.Source)
	if source == "" {
		source = "buyer_video_feed"
	}
	var watchTime any
	if input.WatchTimeSec != nil {
		watchTime = *input.WatchTimeSec
	}
	return map[string]any{
		"videoId":            video.VideoID,
		"sellerId":           video.SellerID,
		"productId":          nullableString(productID),
		"source":             source,
		"anonymousSessionId": strings.TrimSpace(input.AnonymousSessionID),
		"clientEventId":      strings.TrimSpace(input.ClientEventID),
		"watchTimeSec":       watchTime,
		"video": map[string]any{
			"videoId":  video.VideoID,
			"sellerId": video.SellerID,
			"title":    video.Title,
			"status":   video.Status,
		},
		"actor": map[string]any{
			"anonymousSessionId": strings.TrimSpace(input.AnonymousSessionID),
		},
	}
}

func nullableString(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func truncateString(value string, max int) string {
	if len(value) <= max {
		return value
	}
	return value[:max]
}
