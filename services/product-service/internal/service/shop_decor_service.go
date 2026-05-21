package service

import (
	"context"
	"net/http"
	"regexp"
	"strings"
	"time"

	"product-service/internal/domain"
	"product-service/internal/httpx"
	"product-service/internal/repository"
	"product-service/internal/timefmt"
)

type ShopDecorService struct {
	repo  repository.ShopDecorRepository
	cache jsonCacheStore
}

type UpdateShopDecorInput struct {
	ShopName           *string  `json:"shopName,omitempty"`
	Slogan             *string  `json:"slogan,omitempty"`
	LogoURL            *string  `json:"logoUrl,omitempty"`
	BannerURL          *string  `json:"bannerUrl,omitempty"`
	AccentColor        *string  `json:"accentColor,omitempty"`
	NavItems           []string `json:"navItems,omitempty"`
	IntroTitle         *string  `json:"introTitle,omitempty"`
	IntroDescription   *string  `json:"introDescription,omitempty"`
	FeaturedCategories []string `json:"featuredCategories,omitempty"`
}

func NewShopDecorService(repo repository.ShopDecorRepository) *ShopDecorService {
	return &ShopDecorService{repo: repo}
}

const shopDecorCacheTTL = 10 * time.Minute

func (s *ShopDecorService) WithCache(cache jsonCacheStore) *ShopDecorService {
	s.cache = cache
	return s
}

func (s *ShopDecorService) GetPublicShopDecor(ctx context.Context, sellerID string) (domain.ShopDecorResponse, error) {
	sellerID = strings.TrimSpace(sellerID)
	cacheKey := shopDecorCacheKey(sellerID)
	var cached domain.ShopDecorResponse
	if s.readCache(ctx, cacheKey, &cached) {
		return cached, nil
	}
	found, err := s.repo.FindBySellerID(ctx, sellerID)
	if err != nil {
		return domain.ShopDecorResponse{}, err
	}
	if found == nil {
		response := buildDefaultDecor(sellerID)
		s.writeCache(ctx, cacheKey, response)
		return response, nil
	}
	response := toShopDecorResponse(*found)
	s.writeCache(ctx, cacheKey, response)
	return response, nil
}

func (s *ShopDecorService) GetMyShopDecor(ctx context.Context, user domain.UserContext) (domain.ShopDecorResponse, error) {
	return s.GetPublicShopDecor(ctx, user.UserID)
}

func (s *ShopDecorService) UpdateMyShopDecor(ctx context.Context, user domain.UserContext, input UpdateShopDecorInput) (domain.ShopDecorResponse, error) {
	if !domain.IsSeller(user.Role) && !domain.IsStaff(user.Role) {
		return domain.ShopDecorResponse{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Role is not allowed to update shop decor", nil)
	}
	payload := normalizeShopDecorPayload(input)
	if payload.ShopName == nil {
		existing, err := s.repo.FindBySellerID(ctx, user.UserID)
		if err != nil {
			return domain.ShopDecorResponse{}, err
		}
		if existing == nil {
			defaultDecor := buildDefaultDecor(user.UserID)
			payload.ShopName = &defaultDecor.ShopName
		}
	}
	updated, err := s.repo.UpsertBySellerID(ctx, user.UserID, payload)
	if err != nil {
		return domain.ShopDecorResponse{}, err
	}
	_ = s.deleteCache(ctx, shopDecorCacheKey(user.UserID))
	return toShopDecorResponse(updated), nil
}

func (s *ShopDecorService) readCache(ctx context.Context, key string, dest any) bool {
	if s.cache == nil || key == "" {
		return false
	}
	return s.cache.GetJSON(ctx, key, dest) == nil
}

func (s *ShopDecorService) writeCache(ctx context.Context, key string, value domain.ShopDecorResponse) {
	if s.cache == nil || key == "" {
		return
	}
	_ = s.cache.SetJSON(ctx, key, value, shopDecorCacheTTL)
}

func (s *ShopDecorService) deleteCache(ctx context.Context, key string) error {
	if s.cache == nil || key == "" {
		return nil
	}
	return s.cache.Delete(ctx, key)
}

func shopDecorCacheKey(sellerID string) string {
	return "cache:shop-decor:v1:" + strings.TrimSpace(sellerID)
}

func normalizeShopDecorPayload(input UpdateShopDecorInput) repository.UpsertShopDecorPayload {
	payload := repository.UpsertShopDecorPayload{}
	if input.ShopName != nil {
		value := truncate(strings.TrimSpace(*input.ShopName), 120)
		payload.ShopName = &value
	}
	if input.Slogan != nil {
		value := truncate(strings.TrimSpace(*input.Slogan), 240)
		payload.Slogan = &value
	}
	if input.LogoURL != nil {
		value := truncate(strings.TrimSpace(*input.LogoURL), 500)
		payload.LogoURL = &value
	}
	if input.BannerURL != nil {
		value := truncate(strings.TrimSpace(*input.BannerURL), 500)
		payload.BannerURL = &value
	}
	if input.AccentColor != nil {
		value := normalizeAccentColor(*input.AccentColor)
		payload.AccentColor = &value
	}
	if input.NavItems != nil {
		values := sanitizeStringList(input.NavItems, 8)
		payload.NavItems = &values
	}
	if input.IntroTitle != nil {
		value := truncate(strings.TrimSpace(*input.IntroTitle), 180)
		payload.IntroTitle = &value
	}
	if input.IntroDescription != nil {
		value := truncate(strings.TrimSpace(*input.IntroDescription), 500)
		payload.IntroDescription = &value
	}
	if input.FeaturedCategories != nil {
		values := sanitizeStringList(input.FeaturedCategories, 10)
		payload.FeaturedCategories = &values
	}
	return payload
}

func toShopDecorResponse(source domain.ShopDecor) domain.ShopDecorResponse {
	return domain.ShopDecorResponse{
		SellerID:           source.SellerID,
		SellerCode:         ToDisplayCode(source.SellerID, "SEL"),
		ShopName:           source.ShopName,
		Slogan:             source.Slogan,
		LogoURL:            source.LogoURL,
		BannerURL:          source.BannerURL,
		AccentColor:        normalizeAccentColor(source.AccentColor),
		NavItems:           sanitizeStringList(source.NavItems, 8),
		IntroTitle:         source.IntroTitle,
		IntroDescription:   source.IntroDescription,
		FeaturedCategories: sanitizeStringList(source.FeaturedCategories, 10),
		UpdatedAt:          timefmt.ISO(source.UpdatedAt),
	}
}

func buildDefaultDecor(sellerID string) domain.ShopDecorResponse {
	short := strings.ToUpper(truncate(sellerID, 8))
	return domain.ShopDecorResponse{
		SellerID:           sellerID,
		SellerCode:         ToDisplayCode(sellerID, "SEL"),
		ShopName:           "Shop " + short,
		Slogan:             "Official store with trusted products and fast support.",
		LogoURL:            "",
		BannerURL:          "",
		AccentColor:        "#ee4d2d",
		NavItems:           []string{"Tất Cả Sản Phẩm", "Sản phẩm mới", "Ưu đãi hôm nay", "Thông tin shop"},
		IntroTitle:         "Chào mừng bạn đến với shop của chúng tôi",
		IntroDescription:   "Theo dõi shop để nhận thêm voucher và cập nhật sản phẩm mới mỗi ngày.",
		FeaturedCategories: []string{"Best Seller", "Sản phẩm nổi bật", "Phụ kiện"},
		UpdatedAt:          timefmt.ISO(time.Now()),
	}
}

func normalizeAccentColor(value string) string {
	trimmed := strings.TrimSpace(value)
	if regexp.MustCompile(`^#[0-9a-fA-F]{6}$`).MatchString(trimmed) {
		return trimmed
	}
	return "#ee4d2d"
}

func sanitizeStringList(values []string, limit int) []string {
	out := []string{}
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		out = append(out, trimmed)
		if len(out) >= limit {
			break
		}
	}
	return out
}

func truncate(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit]
}
