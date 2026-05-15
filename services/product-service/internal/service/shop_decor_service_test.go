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

type fakeShopDecorRepo struct {
	decor *domain.ShopDecor
}

func (r *fakeShopDecorRepo) EnsureIndexes(context.Context) error { return nil }
func (r *fakeShopDecorRepo) FindBySellerID(context.Context, string) (*domain.ShopDecor, error) {
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
