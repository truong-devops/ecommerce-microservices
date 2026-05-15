package search

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"product-service-go/internal/config"
	"product-service-go/internal/domain"
)

type Result struct {
	IDs        []string
	TotalItems int64
}

type ProductSearchClient struct {
	enabled  bool
	baseURL  string
	index    string
	username string
	password string
	client   *http.Client
}

func NewProductSearchClient(cfg config.Config) *ProductSearchClient {
	return &ProductSearchClient{
		enabled:  cfg.SearchEnabled && cfg.OpenSearchURL != "",
		baseURL:  cfg.OpenSearchURL,
		index:    cfg.OpenSearchIndex,
		username: cfg.OpenSearchUsername,
		password: cfg.OpenSearchPassword,
		client:   &http.Client{Timeout: time.Duration(cfg.OpenSearchTimeoutMS) * time.Millisecond},
	}
}

func (c *ProductSearchClient) EnsureIndex(ctx context.Context) error {
	if !c.enabled {
		return nil
	}
	body := map[string]any{
		"mappings": map[string]any{
			"properties": map[string]any{
				"sellerId":    map[string]any{"type": "keyword"},
				"name":        map[string]any{"type": "text"},
				"slug":        map[string]any{"type": "keyword"},
				"description": map[string]any{"type": "text"},
				"categoryId":  map[string]any{"type": "keyword"},
				"brand":       map[string]any{"type": "keyword"},
				"status":      map[string]any{"type": "keyword"},
				"minPrice":    map[string]any{"type": "float"},
				"createdAt":   map[string]any{"type": "date"},
				"updatedAt":   map[string]any{"type": "date"},
				"variants": map[string]any{
					"type": "nested",
					"properties": map[string]any{
						"sku":  map[string]any{"type": "keyword"},
						"name": map[string]any{"type": "text"},
					},
				},
			},
		},
	}
	_, err := c.request(ctx, http.MethodPut, "/"+c.index, body)
	if err != nil {
		return nil
	}
	return nil
}

func (c *ProductSearchClient) IndexProduct(ctx context.Context, product domain.ProductResponse) error {
	if !c.enabled {
		return nil
	}
	variants := make([]map[string]string, 0, len(product.Variants))
	for _, variant := range product.Variants {
		variants = append(variants, map[string]string{"sku": variant.SKU, "name": variant.Name})
	}
	body := map[string]any{
		"sellerId":    product.SellerID,
		"name":        product.Name,
		"slug":        product.Slug,
		"description": product.Description,
		"categoryId":  product.CategoryID,
		"brand":       product.Brand,
		"status":      product.Status,
		"minPrice":    product.MinPrice,
		"variants":    variants,
		"createdAt":   product.CreatedAt,
		"updatedAt":   product.UpdatedAt,
	}
	_, err := c.request(ctx, http.MethodPut, fmt.Sprintf("/%s/_doc/%s", c.index, product.ID), body)
	return err
}

func (c *ProductSearchClient) DeleteProduct(ctx context.Context, productID string) error {
	if !c.enabled {
		return nil
	}
	_, err := c.request(ctx, http.MethodDelete, fmt.Sprintf("/%s/_doc/%s", c.index, productID), nil)
	return err
}

func (c *ProductSearchClient) SearchProducts(ctx context.Context, query domain.ListProductsQuery, forcedStatus domain.ProductStatus, forcedSellerID string) (*Result, error) {
	if !c.enabled {
		return nil, nil
	}
	page, pageSize := query.Page, query.PageSize
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	filters := []map[string]any{}
	status := forcedStatus
	if status == "" {
		status = query.Status
	}
	if status != "" {
		filters = append(filters, map[string]any{"term": map[string]any{"status": status}})
	}
	sellerID := forcedSellerID
	if sellerID == "" {
		sellerID = query.SellerID
	}
	if sellerID != "" {
		filters = append(filters, map[string]any{"term": map[string]any{"sellerId": sellerID}})
	}
	if query.CategoryID != "" {
		filters = append(filters, map[string]any{"term": map[string]any{"categoryId": query.CategoryID}})
	}
	if query.Brand != "" {
		filters = append(filters, map[string]any{"term": map[string]any{"brand": query.Brand}})
	}
	must := []map[string]any{{"match_all": map[string]any{}}}
	if query.Search != "" {
		must = []map[string]any{{
			"multi_match": map[string]any{
				"query":     query.Search,
				"fields":    []string{"name^3", "slug^2", "description", "brand", "variants.sku", "variants.name"},
				"fuzziness": "AUTO",
			},
		}}
	}
	sortField := "createdAt"
	if query.SortBy == "name" {
		sortField = "name.keyword"
	} else if query.SortBy == "minPrice" || query.SortBy == "updatedAt" {
		sortField = query.SortBy
	}
	sortOrder := "desc"
	if query.SortOrder == domain.SortOrderAsc {
		sortOrder = "asc"
	}
	body := map[string]any{
		"from":  (page - 1) * pageSize,
		"size":  pageSize,
		"query": map[string]any{"bool": map[string]any{"must": must, "filter": filters}},
		"sort":  []map[string]any{{sortField: sortOrder}},
	}
	raw, err := c.request(ctx, http.MethodPost, "/"+c.index+"/_search", body)
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Hits struct {
			Total struct {
				Value int64 `json:"value"`
			} `json:"total"`
			Hits []struct {
				ID string `json:"_id"`
			} `json:"hits"`
		} `json:"hits"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(parsed.Hits.Hits))
	for _, hit := range parsed.Hits.Hits {
		ids = append(ids, hit.ID)
	}
	return &Result{IDs: ids, TotalItems: parsed.Hits.Total.Value}, nil
}

func (c *ProductSearchClient) request(ctx context.Context, method string, path string, body any) ([]byte, error) {
	var bodyReader *bytes.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(raw)
	} else {
		bodyReader = bytes.NewReader(nil)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.username != "" && c.password != "" {
		req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(c.username+":"+c.password)))
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var raw bytes.Buffer
	_, _ = raw.ReadFrom(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("opensearch status %d: %s", resp.StatusCode, raw.String())
	}
	return raw.Bytes(), nil
}
