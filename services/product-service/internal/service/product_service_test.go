package service

import (
	"context"
	"testing"
	"time"

	"product-service/internal/domain"
	"product-service/internal/repository"
)

func TestCreateProductSellerCreatesDraftAndNormalizesVariant(t *testing.T) {
	repo := &fakeProductRepo{}
	service := NewProductService(repo, nil, nil, "http://localhost:12030/ecommerce-media")

	result, err := service.CreateProduct(context.Background(), fakeRequest(), domain.UserContext{UserID: "seller-1", Role: domain.RoleSeller}, CreateProductInput{
		Name:       "Demo Product",
		CategoryID: "cat-1",
		Images:     []string{"http://localhost:12030/ecommerce-media/products/product-1/image.jpg"},
		Variants: []ProductVariantInput{{
			SKU:      " sku-1 ",
			Name:     "Default",
			Price:    123.456,
			Currency: "VND",
		}},
	})
	if err != nil {
		t.Fatalf("CreateProduct returned error: %v", err)
	}
	if result.Status != domain.ProductStatusDraft {
		t.Fatalf("expected draft status, got %s", result.Status)
	}
	if result.Slug != "demo-product" {
		t.Fatalf("expected generated slug, got %s", result.Slug)
	}
	if result.Variants[0].SKU != "SKU-1" || !result.Variants[0].IsDefault {
		t.Fatalf("variant was not normalized: %+v", result.Variants[0])
	}
	if repo.created.Images[0] != "products/product-1/image.jpg" {
		t.Fatalf("expected image object key storage, got %s", repo.created.Images[0])
	}
}

func TestCreateProductRejectsDuplicateSKUInPayload(t *testing.T) {
	service := NewProductService(&fakeProductRepo{}, nil, nil, "http://localhost:12030/ecommerce-media")

	_, err := service.CreateProduct(context.Background(), fakeRequest(), domain.UserContext{UserID: "seller-1", Role: domain.RoleSeller}, CreateProductInput{
		Name:       "Demo Product",
		CategoryID: "cat-1",
		Variants: []ProductVariantInput{
			{SKU: "SKU-1", Name: "One", Price: 1, Currency: "VND"},
			{SKU: "sku-1", Name: "Two", Price: 2, Currency: "VND"},
		},
	})
	if err == nil {
		t.Fatal("expected duplicate SKU error")
	}
}

func TestCreateProductChecksSlugAndSKUWithinSeller(t *testing.T) {
	repo := &fakeProductRepo{}
	service := NewProductService(repo, nil, nil, "http://localhost:12030/ecommerce-media")

	_, err := service.CreateProduct(context.Background(), fakeRequest(), domain.UserContext{UserID: "seller-2", Role: domain.RoleSeller}, CreateProductInput{
		Name:       "Shared Name",
		Slug:       "shared-name",
		CategoryID: "cat-1",
		Variants: []ProductVariantInput{{
			SKU:      "SHARED-001",
			Name:     "Default",
			Price:    10,
			Currency: "VND",
		}},
	})
	if err != nil {
		t.Fatalf("CreateProduct returned error: %v", err)
	}
	if repo.slugSellerID != "seller-2" {
		t.Fatalf("expected slug check to be scoped to seller-2, got %s", repo.slugSellerID)
	}
	if repo.skuSellerID != "seller-2" {
		t.Fatalf("expected SKU check to be scoped to seller-2, got %s", repo.skuSellerID)
	}
}

func TestCreateProductAutoSuffixesConflictingSlugAndSKU(t *testing.T) {
	repo := &fakeProductRepo{
		slugConflicts: map[string]bool{"seller-1/shared-name": true},
		skuConflicts:  map[string]bool{"seller-1/SHARED-001": true},
	}
	service := NewProductService(repo, nil, nil, "http://localhost:12030/ecommerce-media")

	result, err := service.CreateProduct(context.Background(), fakeRequest(), domain.UserContext{UserID: "seller-1", Role: domain.RoleSeller}, CreateProductInput{
		Name:       "Shared Name",
		Slug:       "shared-name",
		CategoryID: "cat-1",
		Variants: []ProductVariantInput{{
			SKU:      "SHARED-001",
			Name:     "Default",
			Price:    10,
			Currency: "VND",
		}},
	})
	if err != nil {
		t.Fatalf("CreateProduct returned error: %v", err)
	}
	if result.Slug != "shared-name-2" {
		t.Fatalf("expected auto-suffixed slug, got %s", result.Slug)
	}
	if result.Variants[0].SKU != "SHARED-001-2" {
		t.Fatalf("expected auto-suffixed SKU, got %s", result.Variants[0].SKU)
	}
}

type fakeProductRepo struct {
	created       repository.CreateProductPayload
	product       domain.Product
	slugSellerID  string
	skuSellerID   string
	slugConflicts map[string]bool
	skuConflicts  map[string]bool
}

func (r *fakeProductRepo) EnsureIndexes(context.Context) error { return nil }
func (r *fakeProductRepo) Create(_ context.Context, payload repository.CreateProductPayload) (domain.Product, error) {
	r.created = payload
	now := time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)
	return domain.Product{
		ID:          "000000000000000000000001",
		SellerID:    payload.SellerID,
		Name:        payload.Name,
		Slug:        payload.Slug,
		Description: payload.Description,
		CategoryID:  payload.CategoryID,
		Brand:       payload.Brand,
		Status:      payload.Status,
		Attributes:  payload.Attributes,
		Images:      payload.Images,
		Variants:    payload.Variants,
		MinPrice:    payload.MinPrice,
		CreatedAt:   now,
		UpdatedAt:   now,
	}, nil
}
func (r *fakeProductRepo) FindByID(context.Context, string, bool) (*domain.Product, error) {
	return &r.product, nil
}
func (r *fakeProductRepo) FindBySlug(_ context.Context, sellerID string, slug string, _ string) (*domain.Product, error) {
	r.slugSellerID = sellerID
	if r.slugConflicts != nil && r.slugConflicts[sellerID+"/"+slug] {
		return &domain.Product{ID: "000000000000000000000099", SellerID: sellerID}, nil
	}
	return nil, nil
}
func (r *fakeProductRepo) FindFirstBySKUs(_ context.Context, sellerID string, skus []string, _ string) (*domain.Product, error) {
	r.skuSellerID = sellerID
	for _, sku := range skus {
		if r.skuConflicts != nil && r.skuConflicts[sellerID+"/"+sku] {
			return &domain.Product{ID: "000000000000000000000098", SellerID: sellerID}, nil
		}
	}
	return nil, nil
}
func (r *fakeProductRepo) FindByIDsOrdered(context.Context, []string) ([]domain.Product, error) {
	return nil, nil
}
func (r *fakeProductRepo) List(context.Context, domain.ListProductsQuery, repository.ProductListFixed) ([]domain.Product, int64, error) {
	return nil, 0, nil
}
func (r *fakeProductRepo) UpdateByID(context.Context, string, repository.UpdateProductPayload) (*domain.Product, error) {
	return &r.product, nil
}
func (r *fakeProductRepo) SoftDelete(context.Context, string) (*domain.Product, error) {
	return &r.product, nil
}
