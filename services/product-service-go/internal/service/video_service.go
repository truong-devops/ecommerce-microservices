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

	"product-service-go/internal/domain"
	"product-service-go/internal/httpx"
	"product-service-go/internal/repository"
)

type VideoService struct {
	repo               repository.VideoRepository
	redis              *RedisService
	mediaPublicBaseURL string
	cacheTTL           time.Duration
	cacheKeySet        string
}

func NewVideoService(repo repository.VideoRepository, redisService *RedisService, mediaPublicBaseURL string) *VideoService {
	return &VideoService{
		repo:               repo,
		redis:              redisService,
		mediaPublicBaseURL: strings.TrimRight(mediaPublicBaseURL, "/"),
		cacheTTL:           45 * time.Second,
		cacheKeySet:        "product-videos:feed:v1:keys",
	}
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

func (s *VideoService) paginatedVideos(items []domain.ProductVideo, query domain.ListProductVideosQuery, total int64) domain.PaginatedVideos {
	responses := make([]domain.ProductVideoResponse, 0, len(items))
	for _, item := range items {
		responses = append(responses, s.ToVideoResponse(item))
	}
	return domain.PaginatedVideos{Items: responses, Pagination: buildPagination(query.Page, query.PageSize, total)}
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
			CTR:                ctr,
			AddToCartRate:      addToCartRate,
			LastAggregatedAt:   formatTimePtr(metrics.LastAggregatedAt),
		},
		PublishedAt: formatTimePtr(video.PublishedAt),
		HiddenAt:    formatTimePtr(video.HiddenAt),
		ArchivedAt:  formatTimePtr(video.ArchivedAt),
		CreatedAt:   video.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:   video.UpdatedAt.UTC().Format(time.RFC3339),
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
	out := value.UTC().Format(time.RFC3339)
	return &out
}

func roundRate(value float64) float64 {
	return math.Round(value*10000) / 10000
}
