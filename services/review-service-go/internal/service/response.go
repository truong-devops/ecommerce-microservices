package service

import (
	"time"

	"review-service-go/internal/domain"
)

type ReviewReplyResponse struct {
	Content   string `json:"content"`
	RepliedBy string `json:"repliedBy"`
	RepliedAt string `json:"repliedAt"`
}

type ReviewResponse struct {
	ID               string               `json:"id"`
	OrderID          string               `json:"orderId"`
	ProductID        string               `json:"productId"`
	SellerID         string               `json:"sellerId"`
	BuyerID          string               `json:"buyerId"`
	Rating           int                  `json:"rating"`
	Title            *string              `json:"title"`
	Content          string               `json:"content"`
	Images           []string             `json:"images"`
	Status           domain.ReviewStatus  `json:"status"`
	ModerationReason *string              `json:"moderationReason"`
	ModeratedBy      *string              `json:"moderatedBy"`
	ModeratedAt      *string              `json:"moderatedAt"`
	Reply            *ReviewReplyResponse `json:"reply"`
	DeletedAt        *string              `json:"deletedAt"`
	CreatedAt        string               `json:"createdAt"`
	UpdatedAt        string               `json:"updatedAt"`
}

type Pagination struct {
	Page       int   `json:"page"`
	PageSize   int   `json:"pageSize"`
	TotalItems int64 `json:"totalItems"`
	TotalPages int64 `json:"totalPages"`
}

type ListReviewsResponse struct {
	Items      []ReviewResponse `json:"items"`
	Pagination Pagination       `json:"pagination"`
}

func toReviewResponse(review domain.Review) ReviewResponse {
	var moderatedAt *string
	if review.ModeratedAt != nil {
		s := review.ModeratedAt.UTC().Format(time.RFC3339)
		moderatedAt = &s
	}

	var deletedAt *string
	if review.DeletedAt != nil {
		s := review.DeletedAt.UTC().Format(time.RFC3339)
		deletedAt = &s
	}

	var reply *ReviewReplyResponse
	if review.Reply != nil {
		reply = &ReviewReplyResponse{
			Content:   review.Reply.Content,
			RepliedBy: review.Reply.RepliedBy,
			RepliedAt: review.Reply.RepliedAt.UTC().Format(time.RFC3339),
		}
	}

	return ReviewResponse{
		ID:               review.ID,
		OrderID:          review.OrderID,
		ProductID:        review.ProductID,
		SellerID:         review.SellerID,
		BuyerID:          review.BuyerID,
		Rating:           review.Rating,
		Title:            review.Title,
		Content:          review.Content,
		Images:           review.Images,
		Status:           review.Status,
		ModerationReason: review.ModerationReason,
		ModeratedBy:      review.ModeratedBy,
		ModeratedAt:      moderatedAt,
		Reply:            reply,
		DeletedAt:        deletedAt,
		CreatedAt:        review.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:        review.UpdatedAt.UTC().Format(time.RFC3339),
	}
}
