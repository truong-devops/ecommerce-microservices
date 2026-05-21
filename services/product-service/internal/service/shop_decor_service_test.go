package service

import (
	"context"
	"testing"
	"time"

	"product-service/internal/domain"
	"product-service/internal/repository"
)

func TestShopDecorDefaultAndAccentFallback(t *testing.T) {
	service := NewShopDecorService(&fakeShopDecorRepo{})

	result, err := service.GetPublicShopDecor(context.Background(), "seller-1")
	if err != nil {
		t.Fatalf("GetPublicShopDecor returned error: %v", err)
	}
	if result.ShopName != "Shop SELLER-1" {
		t.Fatalf("unexpected default shop name: %s", result.ShopName)
	}
	if result.AccentColor != "#ee4d2d" {
		t.Fatalf("unexpected accent color: %s", result.AccentColor)
	}
}

func TestShopDecorUpdateSanitizesInput(t *testing.T) {
	repo := &fakeShopDecorRepo{}
	service := NewShopDecorService(repo)
	color := "invalid"
	navItems := []string{" One ", "", "Two"}

	result, err := service.UpdateMyShopDecor(context.Background(), domain.UserContext{UserID: "seller-1", Role: domain.RoleSeller}, UpdateShopDecorInput{
		AccentColor: &color,
		NavItems:    navItems,
	})
	if err != nil {
		t.Fatalf("UpdateMyShopDecor returned error: %v", err)
	}
	if result.AccentColor != "#ee4d2d" {
		t.Fatalf("expected fallback accent, got %s", result.AccentColor)
	}
	if len(result.NavItems) != 2 || result.NavItems[0] != "One" || result.NavItems[1] != "Two" {
		t.Fatalf("nav items not sanitized: %#v", result.NavItems)
	}
}

func TestShopDecorCachesPublicDecor(t *testing.T) {
	repo := &fakeShopDecorRepo{}
	cache := newFakeJSONCache()
	service := NewShopDecorService(repo).WithCache(cache)

	first, err := service.GetPublicShopDecor(context.Background(), "seller-1")
	if err != nil {
		t.Fatalf("GetPublicShopDecor returned error: %v", err)
	}
	second, err := service.GetPublicShopDecor(context.Background(), "seller-1")
	if err != nil {
		t.Fatalf("GetPublicShopDecor second call returned error: %v", err)
	}
	if repo.findCalls != 1 {
		t.Fatalf("expected repository to be called once, got %d", repo.findCalls)
	}
	if second.ShopName != first.ShopName {
		t.Fatalf("unexpected cached shop decor: %+v", second)
	}
	if !cache.exists(shopDecorCacheKey("seller-1")) {
		t.Fatal("expected shop decor cache key to be written")
	}
}

func TestShopDecorUpdateInvalidatesCache(t *testing.T) {
	repo := &fakeShopDecorRepo{}
	cache := newFakeJSONCache()
	service := NewShopDecorService(repo).WithCache(cache)
	if _, err := service.GetPublicShopDecor(context.Background(), "seller-1"); err != nil {
		t.Fatalf("GetPublicShopDecor returned error: %v", err)
	}

	color := "#123456"
	if _, err := service.UpdateMyShopDecor(context.Background(), domain.UserContext{UserID: "seller-1", Role: domain.RoleSeller}, UpdateShopDecorInput{AccentColor: &color}); err != nil {
		t.Fatalf("UpdateMyShopDecor returned error: %v", err)
	}
	if cache.exists(shopDecorCacheKey("seller-1")) {
		t.Fatal("expected shop decor cache to be invalidated")
	}
}

type fakeShopDecorRepo struct {
	decor     *domain.ShopDecor
	findCalls int
}

func (r *fakeShopDecorRepo) EnsureIndexes(context.Context) error { return nil }
func (r *fakeShopDecorRepo) FindBySellerID(context.Context, string) (*domain.ShopDecor, error) {
	r.findCalls++
	return r.decor, nil
}
func (r *fakeShopDecorRepo) UpsertBySellerID(_ context.Context, sellerID string, payload repository.UpsertShopDecorPayload) (domain.ShopDecor, error) {
	now := time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)
	decor := domain.ShopDecor{
		SellerID:    sellerID,
		ShopName:    "Shop SELLER-1",
		AccentColor: "#ee4d2d",
		UpdatedAt:   now,
	}
	if payload.ShopName != nil {
		decor.ShopName = *payload.ShopName
	}
	if payload.AccentColor != nil {
		decor.AccentColor = *payload.AccentColor
	}
	if payload.NavItems != nil {
		decor.NavItems = *payload.NavItems
	}
	return decor, nil
}
