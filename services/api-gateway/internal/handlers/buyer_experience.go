package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"api-gateway/internal/middleware"
	apperrors "api-gateway/pkg/errors"
	"api-gateway/pkg/response"

	"github.com/go-chi/chi/v5"
)

const fallbackProductImage = "https://picsum.photos/seed/product-fallback/800/800"

type BuyerExperienceHandler struct {
	productBaseURL string
	client         *http.Client
}

type upstreamEnvelope struct {
	Success bool            `json:"success"`
	Data    json.RawMessage `json:"data"`
	Meta    struct {
		Pagination pagination `json:"pagination"`
	} `json:"meta"`
	Error struct {
		Message string `json:"message"`
	} `json:"error"`
}

type backendProduct struct {
	ID          string           `json:"id"`
	SellerID    string           `json:"sellerId"`
	SellerCode  string           `json:"sellerCode"`
	Name        string           `json:"name"`
	Slug        string           `json:"slug"`
	Description *string          `json:"description"`
	CategoryID  string           `json:"categoryId"`
	Brand       *string          `json:"brand"`
	Status      string           `json:"status"`
	Attributes  map[string]any   `json:"attributes"`
	Images      []string         `json:"images"`
	MinPrice    float64          `json:"minPrice"`
	Variants    []productVariant `json:"variants"`
}

type productVariant struct {
	SKU            string         `json:"sku"`
	Name           string         `json:"name"`
	Price          float64        `json:"price"`
	Currency       string         `json:"currency"`
	CompareAtPrice *float64       `json:"compareAtPrice"`
	IsDefault      bool           `json:"isDefault"`
	Metadata       map[string]any `json:"metadata"`
}

type pagination struct {
	Page       int   `json:"page"`
	PageSize   int   `json:"pageSize"`
	TotalItems int64 `json:"totalItems"`
	TotalPages int64 `json:"totalPages"`
}

type productSearchItem struct {
	ID              string   `json:"id"`
	Title           string   `json:"title"`
	Slug            string   `json:"slug"`
	CategoryID      string   `json:"categoryId"`
	Brand           *string  `json:"brand"`
	Image           string   `json:"image"`
	Price           float64  `json:"price"`
	Currency        string   `json:"currency"`
	CompareAtPrice  *float64 `json:"compareAtPrice"`
	DiscountPercent int      `json:"discountPercent"`
}

func NewBuyerExperienceHandler(productBaseURL string, timeout time.Duration) *BuyerExperienceHandler {
	return &BuyerExperienceHandler{
		productBaseURL: strings.TrimRight(productBaseURL, "/"),
		client:         &http.Client{Timeout: timeout},
	}
}

func (h *BuyerExperienceHandler) Home(w http.ResponseWriter, r *http.Request) {
	products, _, ok := h.listProducts(r.Context(), "page=1&pageSize=100&sortBy=createdAt&sortOrder=DESC", w, r)
	if !ok {
		return
	}

	response.Success(w, http.StatusOK, buildHomeSections(products), middleware.RequestIDFromContext(r.Context()))
}

func (h *BuyerExperienceHandler) Products(w http.ResponseWriter, r *http.Request) {
	query := sanitizeProductQuery(r.URL.Query())
	products, page, ok := h.listProducts(r.Context(), query.Encode(), w, r)
	if !ok {
		return
	}

	items := make([]productSearchItem, 0, len(products))
	for _, product := range products {
		items = append(items, toProductSearchItem(product))
	}
	if page.Page == 0 {
		page = pagination{Page: 1, PageSize: len(items), TotalItems: int64(len(items)), TotalPages: 1}
	}

	response.Success(w, http.StatusOK, map[string]any{"items": items, "pagination": page}, middleware.RequestIDFromContext(r.Context()))
}

func (h *BuyerExperienceHandler) ProductDetail(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "productId"))
	if id == "" {
		response.Error(w, http.StatusBadRequest, apperrors.CodeBadRequest, "Invalid product identifier", middleware.RequestIDFromContext(r.Context()))
		return
	}

	var product backendProduct
	if !h.fetchData(r.Context(), "/api/v1/products/"+url.PathEscape(id), &product, w, r) {
		return
	}

	item := toProductSearchItem(product)
	images := product.Images
	if len(images) == 0 {
		images = []string{fallbackProductImage}
	}
	description := "Product description is being updated."
	if product.Description != nil && strings.TrimSpace(*product.Description) != "" {
		description = strings.TrimSpace(*product.Description)
	}

	var defaultSKU *string
	if variant := defaultVariant(product); variant != nil && strings.TrimSpace(variant.SKU) != "" {
		value := strings.TrimSpace(variant.SKU)
		defaultSKU = &value
	}

	response.Success(w, http.StatusOK, map[string]any{
		"id": item.ID, "title": item.Title, "slug": item.Slug, "categoryId": item.CategoryID, "brand": item.Brand,
		"image": item.Image, "images": images, "price": item.Price, "currency": item.Currency,
		"compareAtPrice": item.CompareAtPrice, "discountPercent": item.DiscountPercent, "sellerId": product.SellerID,
		"sellerCode": product.SellerCode, "description": description, "status": product.Status, "variants": product.Variants,
		"defaultSku": defaultSKU, "stock": extractStock(product.Attributes), "attributes": product.Attributes,
	}, middleware.RequestIDFromContext(r.Context()))
}

func (h *BuyerExperienceHandler) Shop(w http.ResponseWriter, r *http.Request) {
	sellerID := strings.TrimSpace(chi.URLParam(r, "sellerId"))
	if sellerID == "" {
		response.Error(w, http.StatusBadRequest, apperrors.CodeBadRequest, "Invalid seller identifier", middleware.RequestIDFromContext(r.Context()))
		return
	}

	var shop map[string]any
	if !h.fetchData(r.Context(), "/api/v1/shops/"+url.PathEscape(sellerID)+"/decor", &shop, w, r) {
		return
	}
	response.Success(w, http.StatusOK, shop, middleware.RequestIDFromContext(r.Context()))
}

func (h *BuyerExperienceHandler) listProducts(ctx context.Context, rawQuery string, w http.ResponseWriter, r *http.Request) ([]backendProduct, pagination, bool) {
	path := "/api/v1/products"
	if rawQuery != "" {
		path += "?" + rawQuery
	}

	var data []backendProduct
	var envelope upstreamEnvelope
	if !h.request(ctx, path, &envelope, w, r) {
		return nil, pagination{}, false
	}
	if err := json.Unmarshal(envelope.Data, &data); err != nil {
		response.Error(w, http.StatusBadGateway, apperrors.CodeBadGateway, "Invalid product service response", middleware.RequestIDFromContext(r.Context()))
		return nil, pagination{}, false
	}

	return data, envelope.Meta.Pagination, true
}

func (h *BuyerExperienceHandler) fetchData(ctx context.Context, path string, target any, w http.ResponseWriter, r *http.Request) bool {
	var envelope upstreamEnvelope
	if !h.request(ctx, path, &envelope, w, r) {
		return false
	}
	if err := json.Unmarshal(envelope.Data, target); err != nil {
		response.Error(w, http.StatusBadGateway, apperrors.CodeBadGateway, "Invalid product service response", middleware.RequestIDFromContext(r.Context()))
		return false
	}
	return true
}

func (h *BuyerExperienceHandler) request(ctx context.Context, path string, target *upstreamEnvelope, w http.ResponseWriter, r *http.Request) bool {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, h.productBaseURL+path, nil)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, apperrors.CodeInternalServer, "Cannot build upstream request", middleware.RequestIDFromContext(r.Context()))
		return false
	}

	upstreamResponse, err := h.client.Do(req)
	if err != nil {
		response.Error(w, http.StatusBadGateway, apperrors.CodeBadGateway, "Product service unavailable", middleware.RequestIDFromContext(r.Context()))
		return false
	}
	defer upstreamResponse.Body.Close()

	if err := json.NewDecoder(upstreamResponse.Body).Decode(target); err != nil {
		response.Error(w, http.StatusBadGateway, apperrors.CodeBadGateway, "Invalid product service response", middleware.RequestIDFromContext(r.Context()))
		return false
	}
	if upstreamResponse.StatusCode < 200 || upstreamResponse.StatusCode >= 300 || !target.Success {
		status := upstreamResponse.StatusCode
		if status < 400 || status > 499 {
			status = http.StatusBadGateway
		}
		message := target.Error.Message
		if message == "" {
			message = "Product service request failed"
		}
		response.Error(w, status, apperrors.CodeBadGateway, message, middleware.RequestIDFromContext(r.Context()))
		return false
	}
	return true
}

func sanitizeProductQuery(input url.Values) url.Values {
	output := url.Values{}
	for _, key := range []string{"search", "categoryId", "brand", "sellerId"} {
		if value := strings.TrimSpace(input.Get(key)); value != "" {
			output.Set(key, value)
		}
	}
	for _, key := range []string{"page", "pageSize"} {
		value, err := strconv.Atoi(input.Get(key))
		if err == nil && value > 0 {
			if key == "pageSize" && value > 100 {
				value = 100
			}
			output.Set(key, strconv.Itoa(value))
		}
	}
	if value := input.Get("sortBy"); value == "createdAt" || value == "updatedAt" || value == "name" || value == "minPrice" {
		output.Set("sortBy", value)
	}
	if value := input.Get("sortOrder"); value == "ASC" || value == "DESC" {
		output.Set("sortOrder", value)
	}
	return output
}

func toProductSearchItem(product backendProduct) productSearchItem {
	variant := defaultVariant(product)
	price := product.MinPrice
	currency := "USD"
	var compareAtPrice *float64
	if variant != nil {
		price = variant.Price
		if strings.TrimSpace(variant.Currency) != "" {
			currency = strings.ToUpper(strings.TrimSpace(variant.Currency))
		}
		if variant.CompareAtPrice != nil && *variant.CompareAtPrice > price {
			compareAtPrice = variant.CompareAtPrice
		}
	}
	image := fallbackProductImage
	if len(product.Images) > 0 && strings.TrimSpace(product.Images[0]) != "" {
		image = product.Images[0]
	}
	title := strings.TrimSpace(product.Name)
	if title == "" {
		title = product.ID
	}
	return productSearchItem{
		ID: product.ID, Title: title, Slug: strings.TrimSpace(product.Slug), CategoryID: strings.TrimSpace(product.CategoryID),
		Brand: product.Brand, Image: image, Price: price, Currency: currency, CompareAtPrice: compareAtPrice,
		DiscountPercent: discountPercent(price, compareAtPrice),
	}
}

func defaultVariant(product backendProduct) *productVariant {
	for i := range product.Variants {
		if product.Variants[i].IsDefault {
			return &product.Variants[i]
		}
	}
	if len(product.Variants) > 0 {
		return &product.Variants[0]
	}
	return nil
}

func discountPercent(price float64, compareAtPrice *float64) int {
	if compareAtPrice == nil || *compareAtPrice <= price || *compareAtPrice <= 0 {
		return 0
	}
	return int(math.Round((*compareAtPrice - price) / *compareAtPrice * 100))
}

func extractStock(attributes map[string]any) any {
	for _, key := range []string{"availableStock", "availableQuantity", "stock", "inventory", "quantity"} {
		value, ok := attributes[key]
		if !ok {
			continue
		}
		switch stock := value.(type) {
		case float64:
			if stock >= 0 {
				return int(stock)
			}
		case int:
			if stock >= 0 {
				return stock
			}
		}
	}
	return nil
}

func buildHomeSections(products []backendProduct) map[string]any {
	keywords := make([]string, 0, 6)
	categories := make([]map[string]any, 0, 12)
	flashSale := make([]map[string]any, 0, 6)
	topSearch := make([]map[string]any, 0, 6)
	recommendations := make([]map[string]any, 0, len(products))
	seenKeyword := map[string]bool{}
	seenCategory := map[string]bool{}
	soldLabels := []string{"Hot sale", "Fast moving", "Trending", "Best choice", "Almost gone", "Top pick"}

	for index, product := range products {
		item := toProductSearchItem(product)
		categoryID := item.CategoryID
		if categoryID == "" {
			categoryID = "uncategorized"
		}
		if !seenCategory[categoryID] && len(categories) < 12 {
			seenCategory[categoryID] = true
			categories = append(categories, map[string]any{"id": categoryID, "label": strings.ReplaceAll(strings.Title(categoryID), "-", " "), "icon": item.Image})
		}
		if index < 6 {
			flashSale = append(flashSale, map[string]any{"id": item.ID, "name": item.Title, "price": item.Price, "discountPercent": item.DiscountPercent, "soldLabel": soldLabels[index], "image": item.Image})
			topSearch = append(topSearch, map[string]any{"id": "top-" + item.ID, "name": item.Title, "soldPerMonth": fmt.Sprintf("%dk / month", (index+3)*9), "image": item.Image})
		}
		recommendations = append(recommendations, map[string]any{"id": item.ID, "title": item.Title, "categoryId": categoryID, "price": item.Price, "sold": fmt.Sprintf("%dk+", (index+2)*2), "discountPercent": item.DiscountPercent, "image": item.Image})
		parts := strings.Fields(strings.ToLower(item.Title))
		if len(parts) > 2 {
			parts = parts[:2]
		}
		keyword := strings.Join(parts, " ")
		if keyword != "" && !seenKeyword[keyword] && len(keywords) < 6 {
			seenKeyword[keyword] = true
			keywords = append(keywords, keyword)
		}
	}

	return map[string]any{
		"keywords": keywords, "categories": categories, "flashSaleItems": flashSale,
		"mallDeals": []any{}, "topSearchItems": topSearch, "recommendationProducts": recommendations,
	}
}
