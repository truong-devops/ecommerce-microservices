package domain

import "time"

type ProductStatus string

const (
	ProductStatusDraft    ProductStatus = "DRAFT"
	ProductStatusActive   ProductStatus = "ACTIVE"
	ProductStatusHidden   ProductStatus = "HIDDEN"
	ProductStatusArchived ProductStatus = "ARCHIVED"
)

type SortOrder string

const (
	SortOrderAsc  SortOrder = "ASC"
	SortOrderDesc SortOrder = "DESC"
)

type ProductVariant struct {
	SKU            string         `bson:"sku" json:"sku"`
	Name           string         `bson:"name" json:"name"`
	Price          float64        `bson:"price" json:"price"`
	Currency       string         `bson:"currency" json:"currency"`
	InitialStock   int            `bson:"initialStock" json:"initialStock"`
	CompareAtPrice *float64       `bson:"compareAtPrice,omitempty" json:"compareAtPrice"`
	IsDefault      bool           `bson:"isDefault" json:"isDefault"`
	Metadata       map[string]any `bson:"metadata" json:"metadata"`
}

type Product struct {
	ID          string
	SellerID    string
	Name        string
	Slug        string
	Description *string
	CategoryID  string
	Brand       *string
	Status      ProductStatus
	Attributes  map[string]any
	Images      []string
	Variants    []ProductVariant
	MinPrice    float64
	DeletedAt   *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type ListProductsQuery struct {
	Page       int
	PageSize   int
	Search     string
	Status     ProductStatus
	CategoryID string
	Brand      string
	SellerID   string
	SortBy     string
	SortOrder  SortOrder
}

type ProductResponse struct {
	ID          string                   `json:"id"`
	ProductCode string                   `json:"productCode"`
	SellerID    string                   `json:"sellerId"`
	SellerCode  string                   `json:"sellerCode"`
	Name        string                   `json:"name"`
	Slug        string                   `json:"slug"`
	Description *string                  `json:"description"`
	CategoryID  string                   `json:"categoryId"`
	Brand       *string                  `json:"brand"`
	Status      ProductStatus            `json:"status"`
	Attributes  map[string]any           `json:"attributes"`
	Images      []string                 `json:"images"`
	Variants    []ProductVariantResponse `json:"variants"`
	MinPrice    float64                  `json:"minPrice"`
	CreatedAt   string                   `json:"createdAt"`
	UpdatedAt   string                   `json:"updatedAt"`
	DeletedAt   *string                  `json:"deletedAt"`
}

type ProductVariantResponse struct {
	SKU            string         `json:"sku"`
	Name           string         `json:"name"`
	Price          float64        `json:"price"`
	Currency       string         `json:"currency"`
	InitialStock   int            `json:"initialStock"`
	CompareAtPrice *float64       `json:"compareAtPrice"`
	IsDefault      bool           `json:"isDefault"`
	Metadata       map[string]any `json:"metadata"`
}

type Pagination struct {
	Page       int   `json:"page"`
	PageSize   int   `json:"pageSize"`
	TotalItems int64 `json:"totalItems"`
	TotalPages int64 `json:"totalPages"`
}

type PaginatedProducts struct {
	Items      []ProductResponse `json:"items"`
	Pagination Pagination        `json:"pagination"`
}
