package service

import (
	"context"
	"encoding/json"
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

func TestListPublicProductsCachesRepositoryResult(t *testing.T) {
	now := time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)
	repo := &fakeProductRepo{
		listProducts: []domain.Product{{
			ID:         "000000000000000000000010",
			SellerID:   "seller-1",
			Name:       "Cached Product",
			Slug:       "cached-product",
			CategoryID: "cat-1",
			Status:     domain.ProductStatusActive,
			Variants:   []domain.ProductVariant{{SKU: "SKU-1", Name: "Default", Price: 10, Currency: "VND", IsDefault: true}},
			MinPrice:   10,
			CreatedAt:  now,
			UpdatedAt:  now,
		}},
		listTotal: 1,
	}
	cache := newFakeJSONCache()
	service := NewProductService(repo, nil, nil, "http://localhost:12030/ecommerce-media").WithCache(cache)
	query := domain.ListProductsQuery{Page: 1, PageSize: 20, CategoryID: "cat-1"}

	first, err := service.ListPublicProducts(context.Background(), query)
	if err != nil {
		t.Fatalf("ListPublicProducts returned error: %v", err)
	}
	second, err := service.ListPublicProducts(context.Background(), query)
	if err != nil {
		t.Fatalf("ListPublicProducts second call returned error: %v", err)
	}
	if repo.listCalls != 1 {
		t.Fatalf("expected repository to be called once, got %d", repo.listCalls)
	}
	if len(second.Items) != 1 || second.Items[0].ID != first.Items[0].ID {
		t.Fatalf("unexpected cached result: %+v", second)
	}
	if !cache.hasSetMember(productCacheKeySet, productListCacheKey(normalizeProductQuery(query))) {
		t.Fatal("expected list cache key to be tracked for invalidation")
	}
}

func TestGetPublicProductByIDCachesRepositoryResult(t *testing.T) {
	now := time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)
	repo := &fakeProductRepo{product: domain.Product{
		ID:         "000000000000000000000011",
		SellerID:   "seller-1",
		Name:       "Cached Detail",
		Slug:       "cached-detail",
		CategoryID: "cat-1",
		Status:     domain.ProductStatusActive,
		Variants:   []domain.ProductVariant{{SKU: "SKU-1", Name: "Default", Price: 10, Currency: "VND", IsDefault: true}},
		MinPrice:   10,
		CreatedAt:  now,
		UpdatedAt:  now,
	}}
	cache := newFakeJSONCache()
	service := NewProductService(repo, nil, nil, "http://localhost:12030/ecommerce-media").WithCache(cache)

	first, err := service.GetPublicProductByID(context.Background(), repo.product.ID)
	if err != nil {
		t.Fatalf("GetPublicProductByID returned error: %v", err)
	}
	second, err := service.GetPublicProductByID(context.Background(), repo.product.ID)
	if err != nil {
		t.Fatalf("GetPublicProductByID second call returned error: %v", err)
	}
	if repo.findByIDCalls != 1 {
		t.Fatalf("expected repository to be called once, got %d", repo.findByIDCalls)
	}
	if second.ID != first.ID {
		t.Fatalf("unexpected cached detail: %+v", second)
	}
	if !cache.hasSetMember(productCacheKeySet, productDetailCacheKey(repo.product.ID)) {
		t.Fatal("expected detail cache key to be tracked for invalidation")
	}
}

func TestUpdateProductInvalidatesTrackedProductCache(t *testing.T) {
	now := time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC)
	repo := &fakeProductRepo{product: domain.Product{
		ID:         "000000000000000000000012",
		SellerID:   "seller-1",
		Name:       "Cached Product",
		Slug:       "cached-product",
		CategoryID: "cat-1",
		Status:     domain.ProductStatusActive,
		Variants:   []domain.ProductVariant{{SKU: "SKU-1", Name: "Default", Price: 10, Currency: "VND", IsDefault: true}},
		MinPrice:   10,
		CreatedAt:  now,
		UpdatedAt:  now,
	}}
	cache := newFakeJSONCache()
	service := NewProductService(repo, nil, nil, "http://localhost:12030/ecommerce-media").WithCache(cache)
	if _, err := service.GetPublicProductByID(context.Background(), repo.product.ID); err != nil {
		t.Fatalf("GetPublicProductByID returned error: %v", err)
	}

	description := "Updated"
	if _, err := service.UpdateProduct(context.Background(), fakeRequest(), domain.UserContext{UserID: "seller-1", Role: domain.RoleSeller}, repo.product.ID, UpdateProductInput{Description: &description}); err != nil {
		t.Fatalf("UpdateProduct returned error: %v", err)
	}
	if cache.exists(productDetailCacheKey(repo.product.ID)) {
		t.Fatal("expected product detail cache to be invalidated")
	}
	if cache.exists(productCacheKeySet) {
		t.Fatal("expected product cache key set to be deleted")
	}
}

type fakeProductRepo struct {
	created       repository.CreateProductPayload
	product       domain.Product
	slugSellerID  string
	skuSellerID   string
	findByIDCalls int
	listCalls     int
	listProducts  []domain.Product
	listTotal     int64
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
	r.findByIDCalls++
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
	r.listCalls++
	return r.listProducts, r.listTotal, nil
}
func (r *fakeProductRepo) UpdateByID(context.Context, string, repository.UpdateProductPayload) (*domain.Product, error) {
	return &r.product, nil
}
func (r *fakeProductRepo) SoftDelete(context.Context, string) (*domain.Product, error) {
	return &r.product, nil
}

type fakeJSONCache struct {
	values map[string][]byte
	sets   map[string]map[string]struct{}
}

func newFakeJSONCache() *fakeJSONCache {
	return &fakeJSONCache{
		values: map[string][]byte{},
		sets:   map[string]map[string]struct{}{},
	}
}

func (c *fakeJSONCache) GetJSON(_ context.Context, key string, dest any) error {
	value, ok := c.values[key]
	if !ok {
		return context.Canceled
	}
	return json.Unmarshal(value, dest)
}

func (c *fakeJSONCache) SetJSON(_ context.Context, key string, value any, _ time.Duration) error {
	payload, err := json.Marshal(value)
	if err != nil {
		return err
	}
	c.values[key] = payload
	return nil
}

func (c *fakeJSONCache) AddToSet(_ context.Context, setKey string, _ time.Duration, members ...string) error {
	if _, ok := c.sets[setKey]; !ok {
		c.sets[setKey] = map[string]struct{}{}
	}
	for _, member := range members {
		c.sets[setKey][member] = struct{}{}
	}
	c.values[setKey] = []byte("tracked")
	return nil
}

func (c *fakeJSONCache) SetMembers(_ context.Context, setKey string) ([]string, error) {
	members := make([]string, 0, len(c.sets[setKey]))
	for member := range c.sets[setKey] {
		members = append(members, member)
	}
	return members, nil
}

func (c *fakeJSONCache) Delete(_ context.Context, keys ...string) error {
	for _, key := range keys {
		delete(c.values, key)
		delete(c.sets, key)
	}
	return nil
}

func (c *fakeJSONCache) hasSetMember(setKey string, member string) bool {
	_, ok := c.sets[setKey][member]
	return ok
}

func (c *fakeJSONCache) exists(key string) bool {
	_, ok := c.values[key]
	return ok
}
