package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"product-service/internal/domain"
	"product-service/internal/events"
	"product-service/internal/httpx"
	"product-service/internal/middleware"
	"product-service/internal/repository"
	"product-service/internal/search"
	"product-service/internal/timefmt"
)

type ProductService struct {
	repo               repository.ProductRepository
	search             *search.ProductSearchClient
	events             events.ProductEventPublisher
	mediaPublicBaseURL string
	cache              jsonCacheStore
}

type ProductVariantInput struct {
	SKU            string         `json:"sku"`
	Name           string         `json:"name"`
	Price          float64        `json:"price"`
	Currency       string         `json:"currency"`
	InitialStock   *int           `json:"initialStock,omitempty"`
	CompareAtPrice *float64       `json:"compareAtPrice,omitempty"`
	IsDefault      *bool          `json:"isDefault,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
}

type CreateProductInput struct {
	SellerID    string                `json:"sellerId,omitempty"`
	Name        string                `json:"name"`
	Slug        string                `json:"slug,omitempty"`
	Description *string               `json:"description,omitempty"`
	CategoryID  string                `json:"categoryId"`
	Brand       *string               `json:"brand,omitempty"`
	Attributes  map[string]any        `json:"attributes,omitempty"`
	Images      []string              `json:"images,omitempty"`
	Variants    []ProductVariantInput `json:"variants"`
	Status      domain.ProductStatus  `json:"status,omitempty"`
}

type UpdateProductInput struct {
	SellerID    string                `json:"sellerId,omitempty"`
	Name        *string               `json:"name,omitempty"`
	Slug        *string               `json:"slug,omitempty"`
	Description *string               `json:"description,omitempty"`
	CategoryID  *string               `json:"categoryId,omitempty"`
	Brand       *string               `json:"brand,omitempty"`
	Attributes  map[string]any        `json:"attributes,omitempty"`
	Images      []string              `json:"images,omitempty"`
	Variants    []ProductVariantInput `json:"variants,omitempty"`
	Status      domain.ProductStatus  `json:"status,omitempty"`
}

type UpdateProductStatusInput struct {
	Status domain.ProductStatus `json:"status"`
	Reason string               `json:"reason,omitempty"`
}

func NewProductService(repo repository.ProductRepository, searchClient *search.ProductSearchClient, eventPublisher events.ProductEventPublisher, mediaPublicBaseURL string) *ProductService {
	return &ProductService{
		repo:               repo,
		search:             searchClient,
		events:             eventPublisher,
		mediaPublicBaseURL: strings.TrimRight(mediaPublicBaseURL, "/"),
	}
}

type jsonCacheStore interface {
	GetJSON(ctx context.Context, key string, dest any) error
	SetJSON(ctx context.Context, key string, value any, ttl time.Duration) error
	AddToSet(ctx context.Context, setKey string, ttl time.Duration, members ...string) error
	SetMembers(ctx context.Context, setKey string) ([]string, error)
	Delete(ctx context.Context, keys ...string) error
}

const (
	productListCacheTTL   = 60 * time.Second
	productDetailCacheTTL = 5 * time.Minute
	productCacheSetTTL    = 30 * time.Minute
	productCacheKeySet    = "cache:product:keys:v1"
)

func (s *ProductService) WithCache(cache jsonCacheStore) *ProductService {
	s.cache = cache
	return s
}

func (s *ProductService) CreateProduct(ctx context.Context, r *http.Request, user domain.UserContext, input CreateProductInput) (domain.ProductResponse, error) {
	if err := validateCreateProduct(input); err != nil {
		return domain.ProductResponse{}, err
	}
	sellerID, err := resolveSellerIDForCreate(user, input.SellerID)
	if err != nil {
		return domain.ProductResponse{}, err
	}
	status, err := resolveCreateStatus(user, input.Status)
	if err != nil {
		return domain.ProductResponse{}, err
	}
	slug := normalizeSlug(input.Slug)
	if slug == "" {
		slug = normalizeSlug(input.Name)
	}
	slug, err = s.nextAvailableSlug(ctx, sellerID, slug, "")
	if err != nil {
		return domain.ProductResponse{}, err
	}
	variants, err := normalizeVariants(input.Variants)
	if err != nil {
		return domain.ProductResponse{}, err
	}
	variants, err = s.nextAvailableCreateSKUs(ctx, sellerID, variants)
	if err != nil {
		return domain.ProductResponse{}, err
	}
	description := trimStringPtr(input.Description)
	brand := trimStringPtr(input.Brand)
	attrs := input.Attributes
	if attrs == nil {
		attrs = map[string]any{}
	}
	created, err := s.repo.Create(ctx, repository.CreateProductPayload{
		SellerID:    sellerID,
		Name:        strings.TrimSpace(input.Name),
		Slug:        slug,
		Description: description,
		CategoryID:  strings.TrimSpace(input.CategoryID),
		Brand:       brand,
		Status:      status,
		Attributes:  attrs,
		Images:      normalizeImagesForStorage(input.Images, s.mediaPublicBaseURL),
		Variants:    variants,
		MinPrice:    computeMinPrice(variants),
	})
	if err != nil {
		return domain.ProductResponse{}, err
	}
	response := s.ToProductResponse(created)
	if s.search != nil {
		_ = s.search.IndexProduct(ctx, response)
	}
	if s.events != nil {
		_ = s.events.PublishProductCreated(ctx, response, user, middleware.RequestIDFromContext(r.Context()))
	}
	s.invalidateProductCache(ctx)
	return response, nil
}

func (s *ProductService) ListPublicProducts(ctx context.Context, query domain.ListProductsQuery) (domain.PaginatedProducts, error) {
	normalized := normalizeProductQuery(query)
	cacheKey := productListCacheKey(normalized)
	var cached domain.PaginatedProducts
	if s.readCache(ctx, cacheKey, &cached) {
		return cached, nil
	}
	if s.search != nil {
		if result, err := s.search.SearchProducts(ctx, normalized, domain.ProductStatusActive, ""); err == nil && result != nil {
			docs, err := s.repo.FindByIDsOrdered(ctx, result.IDs)
			if err != nil {
				return domain.PaginatedProducts{}, err
			}
			response := s.paginatedProducts(docs, normalized, result.TotalItems)
			s.writeTrackedCache(ctx, productCacheKeySet, cacheKey, response, productListCacheTTL)
			return response, nil
		}
	}
	items, total, err := s.repo.List(ctx, normalized, repository.ProductListFixed{Status: domain.ProductStatusActive})
	if err != nil {
		return domain.PaginatedProducts{}, err
	}
	response := s.paginatedProducts(items, normalized, total)
	s.writeTrackedCache(ctx, productCacheKeySet, cacheKey, response, productListCacheTTL)
	return response, nil
}

func (s *ProductService) ListManagedProducts(ctx context.Context, user domain.UserContext, query domain.ListProductsQuery) (domain.PaginatedProducts, error) {
	normalized := normalizeProductQuery(query)
	sellerID := normalized.SellerID
	if domain.IsSeller(user.Role) {
		sellerID = user.UserID
	}
	if s.search != nil {
		if result, err := s.search.SearchProducts(ctx, normalized, normalized.Status, sellerID); err == nil && result != nil {
			docs, err := s.repo.FindByIDsOrdered(ctx, result.IDs)
			if err != nil {
				return domain.PaginatedProducts{}, err
			}
			return s.paginatedProducts(docs, normalized, result.TotalItems), nil
		}
	}
	items, total, err := s.repo.List(ctx, normalized, repository.ProductListFixed{SellerID: sellerID})
	if err != nil {
		return domain.PaginatedProducts{}, err
	}
	return s.paginatedProducts(items, normalized, total), nil
}

func (s *ProductService) GetPublicProductByID(ctx context.Context, id string) (domain.ProductResponse, error) {
	trimmedID := strings.TrimSpace(id)
	cacheKey := productDetailCacheKey(trimmedID)
	var cached domain.ProductResponse
	if s.readCache(ctx, cacheKey, &cached) {
		return cached, nil
	}
	product, err := s.repo.FindByID(ctx, trimmedID, false)
	if err != nil {
		return domain.ProductResponse{}, err
	}
	if product == nil || product.Status != domain.ProductStatusActive {
		return domain.ProductResponse{}, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeProductNotFound, "Product not found", nil)
	}
	response := s.ToProductResponse(*product)
	s.writeTrackedCache(ctx, productCacheKeySet, cacheKey, response, productDetailCacheTTL)
	return response, nil
}

func (s *ProductService) UpdateProduct(ctx context.Context, r *http.Request, user domain.UserContext, id string, input UpdateProductInput) (domain.ProductResponse, error) {
	existing, err := s.requireProduct(ctx, id)
	if err != nil {
		return domain.ProductResponse{}, err
	}
	if err := assertCanManageProduct(user, *existing); err != nil {
		return domain.ProductResponse{}, err
	}
	if input.Status != "" && input.Status != domain.ProductStatusDraft {
		return domain.ProductResponse{}, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, "Use status endpoint to update product status", nil)
	}
	payload := repository.UpdateProductPayload{}
	if input.SellerID != "" {
		if !isUUIDString(input.SellerID) {
			return domain.ProductResponse{}, validationError("sellerId must be a UUID")
		}
		if input.SellerID != existing.SellerID && !domain.IsStaff(user.Role) {
			return domain.ProductResponse{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Seller cannot reassign product owner", nil)
		}
		if domain.IsStaff(user.Role) {
			payload.SellerID = &input.SellerID
		}
	}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" || len(name) > 255 {
			return domain.ProductResponse{}, validationError("name must be between 1 and 255 characters")
		}
		payload.Name = &name
	}
	if input.Slug != nil || input.Name != nil {
		source := existing.Name
		if input.Name != nil {
			source = *input.Name
		}
		if input.Slug != nil {
			source = *input.Slug
		}
		slug := normalizeSlug(source)
		if slug == "" || len(slug) > 255 {
			return domain.ProductResponse{}, validationError("slug is invalid")
		}
		targetSellerID := existing.SellerID
		if payload.SellerID != nil {
			targetSellerID = *payload.SellerID
		}
		if found, err := s.repo.FindBySlug(ctx, targetSellerID, slug, existing.ID); err != nil {
			return domain.ProductResponse{}, err
		} else if found != nil {
			return domain.ProductResponse{}, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeProductSlugExists, "Product slug already exists", nil)
		}
		payload.Slug = &slug
	}
	if input.Description != nil {
		if len(strings.TrimSpace(*input.Description)) > 5000 {
			return domain.ProductResponse{}, validationError("description must be at most 5000 characters")
		}
		desc := trimStringPtr(input.Description)
		payload.Description = &desc
	}
	if input.CategoryID != nil {
		categoryID := strings.TrimSpace(*input.CategoryID)
		if categoryID == "" || len(categoryID) > 64 {
			return domain.ProductResponse{}, validationError("categoryId must be between 1 and 64 characters")
		}
		payload.CategoryID = &categoryID
	}
	if input.Brand != nil {
		if len(strings.TrimSpace(*input.Brand)) > 128 {
			return domain.ProductResponse{}, validationError("brand must be at most 128 characters")
		}
		brand := trimStringPtr(input.Brand)
		payload.Brand = &brand
	}
	if input.Attributes != nil {
		payload.Attributes = input.Attributes
	}
	if input.Images != nil {
		if err := validateImages(input.Images); err != nil {
			return domain.ProductResponse{}, err
		}
		images := normalizeImagesForStorage(input.Images, s.mediaPublicBaseURL)
		payload.Images = &images
	}
	if input.Status == domain.ProductStatusDraft {
		status := domain.ProductStatusDraft
		payload.Status = &status
	}
	if input.Variants != nil {
		variants, err := normalizeVariants(input.Variants)
		if err != nil {
			return domain.ProductResponse{}, err
		}
		targetSellerID := existing.SellerID
		if payload.SellerID != nil {
			targetSellerID = *payload.SellerID
		}
		if err := s.assertSKUsAvailable(ctx, targetSellerID, variants, existing.ID); err != nil {
			return domain.ProductResponse{}, err
		}
		minPrice := computeMinPrice(variants)
		payload.Variants = &variants
		payload.MinPrice = &minPrice
	}
	updated, err := s.repo.UpdateByID(ctx, existing.ID, payload)
	if err != nil {
		return domain.ProductResponse{}, err
	}
	if updated == nil {
		return domain.ProductResponse{}, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeProductNotFound, "Product not found", nil)
	}
	response := s.ToProductResponse(*updated)
	if s.search != nil {
		_ = s.search.IndexProduct(ctx, response)
	}
	if s.events != nil {
		_ = s.events.PublishProductUpdated(ctx, response, user, middleware.RequestIDFromContext(r.Context()))
	}
	s.invalidateProductCache(ctx)
	return response, nil
}

func (s *ProductService) UpdateProductStatus(ctx context.Context, r *http.Request, user domain.UserContext, id string, input UpdateProductStatusInput) (domain.ProductResponse, error) {
	if !domain.IsStaff(user.Role) {
		return domain.ProductResponse{}, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Only admin or moderator can update status", nil)
	}
	if !isProductStatus(input.Status) {
		return domain.ProductResponse{}, validationError("status is invalid")
	}
	if len(strings.TrimSpace(input.Reason)) > 500 {
		return domain.ProductResponse{}, validationError("reason must be at most 500 characters")
	}
	if _, err := s.requireProduct(ctx, id); err != nil {
		return domain.ProductResponse{}, err
	}
	status := input.Status
	updated, err := s.repo.UpdateByID(ctx, id, repository.UpdateProductPayload{Status: &status})
	if err != nil {
		return domain.ProductResponse{}, err
	}
	if updated == nil {
		return domain.ProductResponse{}, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeProductNotFound, "Product not found", nil)
	}
	response := s.ToProductResponse(*updated)
	if s.search != nil {
		_ = s.search.IndexProduct(ctx, response)
	}
	if s.events != nil {
		_ = s.events.PublishProductStatusChanged(ctx, response, user, middleware.RequestIDFromContext(r.Context()), strings.TrimSpace(input.Reason))
	}
	s.invalidateProductCache(ctx)
	return response, nil
}

func (s *ProductService) DeleteProduct(ctx context.Context, r *http.Request, user domain.UserContext, id string) (domain.ProductResponse, error) {
	existing, err := s.requireProduct(ctx, id)
	if err != nil {
		return domain.ProductResponse{}, err
	}
	if err := assertCanManageProduct(user, *existing); err != nil {
		return domain.ProductResponse{}, err
	}
	deleted, err := s.repo.SoftDelete(ctx, existing.ID)
	if err != nil {
		return domain.ProductResponse{}, err
	}
	if deleted == nil {
		return domain.ProductResponse{}, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeProductNotFound, "Product not found", nil)
	}
	response := s.ToProductResponse(*deleted)
	if s.search != nil {
		_ = s.search.DeleteProduct(ctx, response.ID)
	}
	if s.events != nil {
		_ = s.events.PublishProductDeleted(ctx, response, user, middleware.RequestIDFromContext(r.Context()))
	}
	s.invalidateProductCache(ctx)
	return response, nil
}

func (s *ProductService) readCache(ctx context.Context, key string, dest any) bool {
	if s.cache == nil || key == "" {
		return false
	}
	return s.cache.GetJSON(ctx, key, dest) == nil
}

func (s *ProductService) writeTrackedCache(ctx context.Context, setKey string, key string, value any, ttl time.Duration) {
	if s.cache == nil || key == "" {
		return
	}
	if err := s.cache.SetJSON(ctx, key, value, ttl); err != nil {
		return
	}
	_ = s.cache.AddToSet(ctx, setKey, productCacheSetTTL, key)
}

func (s *ProductService) invalidateProductCache(ctx context.Context) {
	if s.cache == nil {
		return
	}
	keys, err := s.cache.SetMembers(ctx, productCacheKeySet)
	if err != nil {
		return
	}
	if len(keys) > 0 {
		_ = s.cache.Delete(ctx, keys...)
	}
	_ = s.cache.Delete(ctx, productCacheKeySet)
}

func (s *ProductService) requireProduct(ctx context.Context, id string) (*domain.Product, error) {
	product, err := s.repo.FindByID(ctx, strings.TrimSpace(id), false)
	if err != nil {
		return nil, err
	}
	if product == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeProductNotFound, "Product not found", nil)
	}
	return product, nil
}

func (s *ProductService) assertSKUsAvailable(ctx context.Context, sellerID string, variants []domain.ProductVariant, excludeID string) error {
	skus := make([]string, 0, len(variants))
	for _, variant := range variants {
		skus = append(skus, variant.SKU)
	}
	if duplicate := findDuplicate(skus); duplicate != "" {
		return httpx.NewAppError(http.StatusConflict, domain.ErrorCodeProductSKUConflict, "Duplicate SKU in payload: "+duplicate, nil)
	}
	existing, err := s.repo.FindFirstBySKUs(ctx, sellerID, skus, excludeID)
	if err != nil {
		return err
	}
	if existing != nil {
		return httpx.NewAppError(http.StatusConflict, domain.ErrorCodeProductSKUConflict, "One or more SKUs already exist", nil)
	}
	return nil
}

func (s *ProductService) nextAvailableSlug(ctx context.Context, sellerID string, baseSlug string, excludeID string) (string, error) {
	baseSlug = normalizeSlug(baseSlug)
	if baseSlug == "" || len(baseSlug) > 255 {
		return "", validationError("slug is invalid")
	}
	for i := 0; i < 1000; i++ {
		candidate := baseSlug
		if i > 0 {
			candidate = trimSlugForSuffix(baseSlug, i+1)
		}
		found, err := s.repo.FindBySlug(ctx, sellerID, candidate, excludeID)
		if err != nil {
			return "", err
		}
		if found == nil {
			return candidate, nil
		}
	}
	return "", httpx.NewAppError(http.StatusConflict, domain.ErrorCodeProductSlugExists, "Product slug already exists", nil)
}

func (s *ProductService) nextAvailableCreateSKUs(ctx context.Context, sellerID string, variants []domain.ProductVariant) ([]domain.ProductVariant, error) {
	used := map[string]struct{}{}
	inputSKUs := make([]string, 0, len(variants))
	for _, variant := range variants {
		inputSKUs = append(inputSKUs, variant.SKU)
	}
	if duplicate := findDuplicate(inputSKUs); duplicate != "" {
		return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeProductSKUConflict, "Duplicate SKU in payload: "+duplicate, nil)
	}
	for i := range variants {
		baseSKU := variants[i].SKU
		for attempt := 0; attempt < 1000; attempt++ {
			candidate := baseSKU
			if attempt > 0 {
				candidate = trimSKUForSuffix(baseSKU, attempt+1)
			}
			if _, ok := used[candidate]; ok {
				continue
			}
			found, err := s.repo.FindFirstBySKUs(ctx, sellerID, []string{candidate}, "")
			if err != nil {
				return nil, err
			}
			if found == nil {
				variants[i].SKU = candidate
				used[candidate] = struct{}{}
				break
			}
			if attempt == 999 {
				return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeProductSKUConflict, "One or more SKUs already exist", nil)
			}
		}
	}
	return variants, nil
}

func (s *ProductService) paginatedProducts(items []domain.Product, query domain.ListProductsQuery, total int64) domain.PaginatedProducts {
	responses := make([]domain.ProductResponse, 0, len(items))
	for _, item := range items {
		responses = append(responses, s.ToProductResponse(item))
	}
	return domain.PaginatedProducts{Items: responses, Pagination: buildPagination(query.Page, query.PageSize, total)}
}

func (s *ProductService) ToProductResponse(product domain.Product) domain.ProductResponse {
	var deletedAt *string
	if product.DeletedAt != nil {
		value := timefmt.ISO(*product.DeletedAt)
		deletedAt = &value
	}
	variants := make([]domain.ProductVariantResponse, 0, len(product.Variants))
	for _, variant := range product.Variants {
		metadata := variant.Metadata
		if metadata == nil {
			metadata = map[string]any{}
		}
		variants = append(variants, domain.ProductVariantResponse{
			SKU:            variant.SKU,
			Name:           variant.Name,
			Price:          variant.Price,
			Currency:       variant.Currency,
			InitialStock:   variant.InitialStock,
			CompareAtPrice: variant.CompareAtPrice,
			IsDefault:      variant.IsDefault,
			Metadata:       metadata,
		})
	}
	attrs := product.Attributes
	if attrs == nil {
		attrs = map[string]any{}
	}
	return domain.ProductResponse{
		ID:          product.ID,
		ProductCode: ToDisplayCode(product.ID, "PRD"),
		SellerID:    product.SellerID,
		SellerCode:  ToDisplayCode(product.SellerID, "SEL"),
		Name:        product.Name,
		Slug:        product.Slug,
		Description: product.Description,
		CategoryID:  product.CategoryID,
		Brand:       product.Brand,
		Status:      product.Status,
		Attributes:  attrs,
		Images:      resolveImagesForResponse(product.Images, s.mediaPublicBaseURL),
		Variants:    variants,
		MinPrice:    product.MinPrice,
		CreatedAt:   timefmt.ISO(product.CreatedAt),
		UpdatedAt:   timefmt.ISO(product.UpdatedAt),
		DeletedAt:   deletedAt,
	}
}

func validateCreateProduct(input CreateProductInput) error {
	if strings.TrimSpace(input.SellerID) != "" && !isUUIDString(input.SellerID) {
		return validationError("sellerId must be a UUID")
	}
	if trimmed := strings.TrimSpace(input.Name); trimmed == "" || len(trimmed) > 255 {
		return validationError("name must be between 1 and 255 characters")
	}
	if input.Slug != "" && (!slugRegex.MatchString(input.Slug) || len(input.Slug) > 255) {
		return validationError("slug is invalid")
	}
	if trimmed := strings.TrimSpace(input.CategoryID); trimmed == "" || len(trimmed) > 64 {
		return validationError("categoryId must be between 1 and 64 characters")
	}
	if input.Description != nil && len(strings.TrimSpace(*input.Description)) > 5000 {
		return validationError("description must be at most 5000 characters")
	}
	if input.Brand != nil && len(strings.TrimSpace(*input.Brand)) > 128 {
		return validationError("brand must be at most 128 characters")
	}
	if err := validateImages(input.Images); err != nil {
		return err
	}
	if len(input.Variants) == 0 {
		return validationError("variants must contain at least 1 elements")
	}
	if input.Status != "" && !isProductStatus(input.Status) {
		return validationError("status is invalid")
	}
	return nil
}

func resolveSellerIDForCreate(user domain.UserContext, requested string) (string, error) {
	requested = strings.TrimSpace(requested)
	if domain.IsSeller(user.Role) {
		if requested != "" && requested != user.UserID {
			return "", httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Seller cannot create products for another seller", nil)
		}
		return user.UserID, nil
	}
	if domain.IsStaff(user.Role) || user.Role == domain.RoleAdmin {
		if requested == "" {
			return "", httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "sellerId is required for staff-created products", nil)
		}
		return requested, nil
	}
	return "", httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Role cannot create products", nil)
}

func resolveCreateStatus(user domain.UserContext, requested domain.ProductStatus) (domain.ProductStatus, error) {
	if domain.IsSeller(user.Role) {
		if requested != "" && requested != domain.ProductStatusDraft {
			return "", httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Seller can only create draft products", nil)
		}
		return domain.ProductStatusDraft, nil
	}
	if requested == "" {
		return domain.ProductStatusDraft, nil
	}
	if !isProductStatus(requested) {
		return "", validationError("status is invalid")
	}
	return requested, nil
}

func assertCanManageProduct(user domain.UserContext, product domain.Product) error {
	if domain.IsStaff(user.Role) {
		return nil
	}
	if domain.IsSeller(user.Role) && product.SellerID == user.UserID {
		return nil
	}
	if domain.IsBuyer(user.Role) {
		return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Buyer cannot manage products", nil)
	}
	return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient permission", nil)
}

func normalizeProductQuery(query domain.ListProductsQuery) domain.ListProductsQuery {
	if query.Page < 1 {
		query.Page = 1
	}
	if query.PageSize < 1 {
		query.PageSize = 20
	}
	if query.PageSize > 100 {
		query.PageSize = 100
	}
	query.Search = strings.TrimSpace(query.Search)
	query.CategoryID = strings.TrimSpace(query.CategoryID)
	query.Brand = strings.TrimSpace(query.Brand)
	query.SellerID = strings.TrimSpace(query.SellerID)
	if query.SortOrder == "" {
		query.SortOrder = domain.SortOrderDesc
	}
	return query
}

func productListCacheKey(query domain.ListProductsQuery) string {
	payload, _ := json.Marshal(query)
	sum := sha256.Sum256(payload)
	return "cache:product:list:v1:" + hex.EncodeToString(sum[:])
}

func productDetailCacheKey(productID string) string {
	return "cache:product:detail:v1:" + strings.TrimSpace(productID)
}

func normalizeVariants(input []ProductVariantInput) ([]domain.ProductVariant, error) {
	variants := make([]domain.ProductVariant, 0, len(input))
	defaultCount := 0
	for _, variant := range input {
		sku := strings.ToUpper(strings.TrimSpace(variant.SKU))
		name := strings.TrimSpace(variant.Name)
		currencyRaw := strings.TrimSpace(variant.Currency)
		currency := strings.ToUpper(currencyRaw)
		if !skuRegex.MatchString(sku) || name == "" || len(name) > 255 || !currencyRegex.MatchString(currencyRaw) || variant.Price < 0 {
			return nil, validationError("variant is invalid")
		}
		initialStock := 0
		if variant.InitialStock != nil {
			if *variant.InitialStock < 0 {
				return nil, validationError("variant initialStock must be non-negative")
			}
			initialStock = *variant.InitialStock
		}
		isDefault := false
		if variant.IsDefault != nil {
			isDefault = *variant.IsDefault
		}
		if isDefault {
			defaultCount++
		}
		var compareAt *float64
		if variant.CompareAtPrice != nil {
			if *variant.CompareAtPrice < 0 {
				return nil, validationError("variant is invalid")
			}
			rounded := roundMoney(*variant.CompareAtPrice)
			compareAt = &rounded
		}
		metadata := variant.Metadata
		if metadata == nil {
			metadata = map[string]any{}
		}
		variants = append(variants, domain.ProductVariant{
			SKU:            sku,
			Name:           name,
			Price:          roundMoney(variant.Price),
			Currency:       currency,
			InitialStock:   initialStock,
			CompareAtPrice: compareAt,
			IsDefault:      isDefault,
			Metadata:       metadata,
		})
	}
	if len(variants) == 0 {
		return nil, validationError("variants must contain at least 1 elements")
	}
	if defaultCount == 0 {
		variants[0].IsDefault = true
	}
	if defaultCount > 1 {
		return nil, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, "Only one variant can be default", nil)
	}
	return variants, nil
}

func computeMinPrice(variants []domain.ProductVariant) float64 {
	if len(variants) == 0 {
		return 0
	}
	min := variants[0].Price
	for _, variant := range variants {
		if variant.Price < min {
			min = variant.Price
		}
	}
	return min
}

func buildPagination(page, pageSize int, total int64) domain.Pagination {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	totalPages := int64(1)
	if total > 0 {
		totalPages = int64(math.Ceil(float64(total) / float64(pageSize)))
	}
	return domain.Pagination{Page: page, PageSize: pageSize, TotalItems: total, TotalPages: totalPages}
}

func validationError(message string) error {
	return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, message, nil)
}

func normalizeSlug(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = regexp.MustCompile(`[^a-z0-9\s-]`).ReplaceAllString(value, "")
	value = regexp.MustCompile(`\s+`).ReplaceAllString(value, "-")
	value = regexp.MustCompile(`-+`).ReplaceAllString(value, "-")
	return strings.Trim(value, "-")
}

func roundMoney(value float64) float64 {
	return math.Round(value*100) / 100
}

func findDuplicate(values []string) string {
	seen := map[string]struct{}{}
	for _, value := range values {
		if _, ok := seen[value]; ok {
			return value
		}
		seen[value] = struct{}{}
	}
	return ""
}

func trimStringPtr(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func isProductStatus(status domain.ProductStatus) bool {
	return status == domain.ProductStatusDraft || status == domain.ProductStatusActive || status == domain.ProductStatusHidden || status == domain.ProductStatusArchived
}

func isUUIDString(value string) bool {
	return uuidValueRegex.MatchString(strings.TrimSpace(value))
}

func validateImages(images []string) error {
	for _, raw := range images {
		value := strings.TrimSpace(raw)
		if value == "" {
			return validationError("images contains invalid value")
		}
		lower := strings.ToLower(value)
		if (strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://")) && !strings.ContainsAny(value, " \t\r\n") {
			continue
		}
		if !isObjectKey(value) {
			return validationError("images contains invalid value")
		}
	}
	return nil
}

func isObjectKey(value string) bool {
	trimmed := strings.TrimSpace(value)
	return len(trimmed) >= 3 && len(trimmed) <= 1024 && objectKeyRegex.MatchString(trimmed)
}

func trimSlugForSuffix(base string, suffix int) string {
	value := normalizeSlug(base)
	suffixText := "-" + strconv.Itoa(suffix)
	limit := 255 - len(suffixText)
	if len(value) > limit {
		value = strings.TrimRight(value[:limit], "-")
	}
	if value == "" {
		value = "product"
	}
	return value + suffixText
}

func trimSKUForSuffix(base string, suffix int) string {
	value := strings.ToUpper(strings.TrimSpace(base))
	suffixText := "-" + strconv.Itoa(suffix)
	limit := 64 - len(suffixText)
	if len(value) > limit {
		value = strings.TrimRight(value[:limit], "._-")
	}
	if value == "" {
		value = "SKU"
	}
	return value + suffixText
}

var (
	slugRegex      = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	skuRegex       = regexp.MustCompile(`^[A-Z0-9._-]{1,64}$`)
	currencyRegex  = regexp.MustCompile(`^[A-Z]{3}$`)
	objectKeyRegex = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9/_\-.]+$`)
	uuidValueRegex = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`)
)

func normalizeImagesForStorage(images []string, mediaPublicBaseURL string) []string {
	out := make([]string, 0, len(images))
	for _, raw := range images {
		value := strings.TrimSpace(raw)
		if value == "" {
			continue
		}
		if isObjectKey(value) {
			out = append(out, value)
			continue
		}
		if objectKey := extractObjectKeyFromPublicURL(value, mediaPublicBaseURL); objectKey != "" {
			out = append(out, objectKey)
			continue
		}
		out = append(out, value)
	}
	return out
}

func resolveImagesForResponse(images []string, mediaPublicBaseURL string) []string {
	out := make([]string, 0, len(images))
	for _, raw := range images {
		value := strings.TrimSpace(raw)
		if value == "" {
			continue
		}
		if isObjectKey(value) {
			out = append(out, strings.TrimRight(mediaPublicBaseURL, "/")+"/"+value)
		} else {
			out = append(out, value)
		}
	}
	return out
}

func resolveMediaURL(urlValue *string, objectKey *string, mediaPublicBaseURL string) *string {
	if urlValue != nil && strings.TrimSpace(*urlValue) != "" {
		value := strings.TrimSpace(*urlValue)
		return &value
	}
	if objectKey == nil || strings.TrimSpace(*objectKey) == "" {
		return nil
	}
	key := strings.TrimSpace(*objectKey)
	if strings.HasPrefix(strings.ToLower(key), "http://") || strings.HasPrefix(strings.ToLower(key), "https://") {
		return &key
	}
	value := strings.TrimRight(mediaPublicBaseURL, "/") + "/" + key
	return &value
}

func extractObjectKeyFromPublicURL(value string, mediaPublicBaseURL string) string {
	imageURL, err := url.Parse(value)
	if err != nil || imageURL.Scheme == "" {
		return ""
	}
	baseURL, err := url.Parse(mediaPublicBaseURL)
	if err != nil {
		return ""
	}
	if imageURL.Scheme != baseURL.Scheme || imageURL.Host != baseURL.Host {
		return ""
	}
	basePath := strings.TrimRight(baseURL.Path, "/")
	imagePath := strings.TrimRight(imageURL.Path, "/")
	if basePath == "" || !strings.HasPrefix(imagePath, basePath+"/") {
		return ""
	}
	objectKey, err := url.PathUnescape(strings.TrimPrefix(imagePath, basePath+"/"))
	if err != nil || !isObjectKey(objectKey) {
		return ""
	}
	return objectKey
}

func ToDisplayCode(raw string, prefix string) string {
	source := strings.TrimSpace(raw)
	if source == "" {
		return prefix + "0000000"
	}
	normalized := regexp.MustCompile(`[^A-Z0-9]`).ReplaceAllString(strings.ToUpper(source), "")
	exactPattern := regexp.MustCompile("^" + prefix + `(\d{7})$`)
	if matches := exactPattern.FindStringSubmatch(normalized); len(matches) == 2 {
		return prefix + matches[1]
	}
	digits := regexp.MustCompile(`\D`).ReplaceAllString(normalized, "")
	if len(digits) >= 7 {
		return prefix + digits[len(digits)-7:]
	}
	return prefix + leftPadInt(stableHash(source), 7)
}

func stableHash(value string) int {
	const modulo = 10000000
	hash := 0
	for _, ch := range value {
		hash = (hash*31 + int(ch)) % modulo
	}
	return hash
}

func leftPadInt(value int, width int) string {
	out := strconv.Itoa(value)
	for len(out) < width {
		out = "0" + out
	}
	return out
}
