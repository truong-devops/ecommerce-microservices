package domain

import "time"

type Role string

const (
	RoleCustomer   Role = "CUSTOMER"
	RoleAdmin      Role = "ADMIN"
	RoleSupport    Role = "SUPPORT"
	RoleWarehouse  Role = "WAREHOUSE"
	RoleSeller     Role = "SELLER"
	RoleSuperAdmin Role = "SUPER_ADMIN"
)

type ReviewStatus string

const (
	ReviewStatusPublished ReviewStatus = "PUBLISHED"
	ReviewStatusHidden    ReviewStatus = "HIDDEN"
	ReviewStatusRejected  ReviewStatus = "REJECTED"
	ReviewStatusDeleted   ReviewStatus = "DELETED"
)

type ReviewSortBy string

const (
	ReviewSortByCreatedAt ReviewSortBy = "createdAt"
	ReviewSortByUpdatedAt ReviewSortBy = "updatedAt"
	ReviewSortByRating    ReviewSortBy = "rating"
)

type SortOrder string

const (
	SortOrderASC  SortOrder = "ASC"
	SortOrderDESC SortOrder = "DESC"
)

type UserContext struct {
	UserID string
	Email  string
	Role   Role
}

type ReviewReply struct {
	Content   string    `bson:"content"`
	RepliedBy string    `bson:"repliedBy"`
	RepliedAt time.Time `bson:"repliedAt"`
}

type Review struct {
	ID               string
	OrderID          string
	ProductID        string
	SellerID         string
	BuyerID          string
	Rating           int
	Title            *string
	Content          string
	Images           []string
	Status           ReviewStatus
	ModerationReason *string
	ModeratedBy      *string
	ModeratedAt      *time.Time
	Reply            *ReviewReply
	DeletedAt        *time.Time
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

type CreateReviewInput struct {
	OrderID   string
	ProductID string
	SellerID  string
	Rating    int
	Title     *string
	Content   string
	Images    []string
}

type UpdateReviewInput struct {
	Rating  *int
	Title   *string
	Content *string
	Images  *[]string
}

type ModerateReviewInput struct {
	Status ReviewStatus
	Reason *string
}

type ReplyReviewInput struct {
	Content string
}

type ListReviewsQuery struct {
	Page      int
	PageSize  int
	ProductID *string
	SellerID  *string
	BuyerID   *string
	Rating    *int
	Status    *ReviewStatus
	Search    *string
	SortBy    ReviewSortBy
	SortOrder SortOrder
}

type ListReviewsResult struct {
	Items      []Review
	Page       int
	PageSize   int
	TotalItems int64
	TotalPages int64
}

type ProductSummary struct {
	ProductID        string         `json:"productId"`
	AverageRating    float64        `json:"averageRating"`
	TotalReviews     int64          `json:"totalReviews"`
	StarDistribution map[string]int `json:"starDistribution"`
}
