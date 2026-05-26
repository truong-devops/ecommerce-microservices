package service

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"order-service/internal/domain"
	"order-service/internal/httpx"
	"order-service/internal/metrics"
	"order-service/internal/repository"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const (
	EventOrderCreated       = "order.created"
	EventOrderCancelled     = "order.cancelled"
	EventOrderStatusUpdated = "order.status-updated"
	EventOrderDelivered     = "order.delivered"
)

var productIDRegex = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$`)
var currencyRegex = regexp.MustCompile(`^[A-Z]{3}$`)

type CreateOrderItemRequest struct {
	ProductID   string  `json:"productId"`
	SKU         string  `json:"sku"`
	ProductName string  `json:"productName"`
	Quantity    float64 `json:"quantity"`
	UnitPrice   float64 `json:"unitPrice"`
}

type CreateOrderRequest struct {
	SellerID          string                   `json:"sellerId"`
	Currency          string                   `json:"currency"`
	ShippingAmount    *float64                 `json:"shippingAmount,omitempty"`
	DiscountAmount    *float64                 `json:"discountAmount,omitempty"`
	Note              *string                  `json:"note,omitempty"`
	PaymentMethod     string                   `json:"paymentMethod"`
	RecipientName     string                   `json:"recipientName"`
	RecipientPhone    string                   `json:"recipientPhone"`
	RecipientAddress  string                   `json:"recipientAddress"`
	RecipientWard     *string                  `json:"recipientWard,omitempty"`
	RecipientDistrict *string                  `json:"recipientDistrict,omitempty"`
	RecipientProvince *string                  `json:"recipientProvince,omitempty"`
	Items             []CreateOrderItemRequest `json:"items"`
}

type CancelOrderRequest struct {
	Reason *string `json:"reason,omitempty"`
}

type UpdateOrderStatusRequest struct {
	Status string  `json:"status"`
	Reason *string `json:"reason,omitempty"`
}

type ListOrdersRequest struct {
	Page      int
	PageSize  int
	Status    *domain.OrderStatus
	SortBy    string
	SortOrder string
	UserID    *string
	Search    *string
}

type ListCompletedOrdersRequest struct {
	From     time.Time
	To       time.Time
	Page     int
	PageSize int
}

type OrderService struct {
	repo              *repository.OrderRepository
	idempotency       *IdempotencyService
	productCatalog    *ProductCatalogClient
	sagaMetrics       *metrics.CheckoutSagaMetrics
	defaultStatusTime func() time.Time
	orderSeq          uint64
}

func NewOrderService(repo *repository.OrderRepository, idem *IdempotencyService, productCatalog *ProductCatalogClient, sagaMetrics ...*metrics.CheckoutSagaMetrics) *OrderService {
	var checkoutMetrics *metrics.CheckoutSagaMetrics
	if len(sagaMetrics) > 0 {
		checkoutMetrics = sagaMetrics[0]
	}
	return &OrderService{
		repo:              repo,
		idempotency:       idem,
		productCatalog:    productCatalog,
		sagaMetrics:       checkoutMetrics,
		defaultStatusTime: func() time.Time { return time.Now().UTC() },
	}
}

func (s *OrderService) CreateOrder(ctx context.Context, user domain.UserContext, requestID string, idempotencyKey string, req CreateOrderRequest) (map[string]any, error) {
	if strings.TrimSpace(idempotencyKey) == "" {
		return nil, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "Missing Idempotency-Key header", nil)
	}

	if err := validateCreateOrderRequest(req); err != nil {
		return nil, err
	}

	acquire, err := s.idempotency.AcquireForCreateOrder(ctx, user.UserID, idempotencyKey, req)
	if err != nil {
		return nil, err
	}
	if acquire.Replay {
		return acquire.ResponseBody, nil
	}
	defer s.idempotency.ReleaseLock(ctx, acquire.LockKey)

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	shippingAmount := 0.0
	if req.ShippingAmount != nil {
		shippingAmount = *req.ShippingAmount
	}
	discountAmount := 0.0
	if req.DiscountAmount != nil {
		discountAmount = *req.DiscountAmount
	}

	normalizedItems, subtotal, err := s.resolveAuthoritativeOrderItems(ctx, req)
	if err != nil {
		return nil, err
	}
	total := roundMoney(subtotal + shippingAmount - discountAmount)
	if total < 0 {
		return nil, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, "Total amount must be greater than or equal to zero", nil)
	}

	createdOrder, err := s.repo.CreateOrder(ctx, tx, repository.CreateOrderInput{
		OrderNumber:       s.generateOrderNumber(),
		UserID:            user.UserID,
		SellerID:          strings.TrimSpace(req.SellerID),
		Status:            domain.OrderStatusPending,
		Currency:          strings.TrimSpace(req.Currency),
		SubtotalAmount:    subtotal,
		ShippingAmount:    roundMoney(shippingAmount),
		DiscountAmount:    roundMoney(discountAmount),
		TotalAmount:       total,
		Note:              trimAndNilIfEmpty(req.Note),
		PaymentMethod:     strings.ToUpper(strings.TrimSpace(req.PaymentMethod)),
		RecipientName:     strings.TrimSpace(req.RecipientName),
		RecipientPhone:    strings.TrimSpace(req.RecipientPhone),
		RecipientAddress:  strings.TrimSpace(req.RecipientAddress),
		RecipientWard:     trimAndNilIfEmpty(req.RecipientWard),
		RecipientDistrict: trimAndNilIfEmpty(req.RecipientDistrict),
		RecipientProvince: trimAndNilIfEmpty(req.RecipientProvince),
	})
	if err != nil {
		return nil, err
	}

	if err := s.repo.CreateOrderSagaState(ctx, tx, createdOrder.ID); err != nil {
		return nil, err
	}

	createdItems, err := s.repo.CreateOrderItems(ctx, tx, createdOrder.ID, normalizedItems)
	if err != nil {
		return nil, err
	}
	createdOrder.Items = createdItems

	err = s.repo.InsertStatusHistory(ctx, tx, repository.CreateStatusHistoryInput{
		OrderID:       createdOrder.ID,
		FromStatus:    nil,
		ToStatus:      domain.OrderStatusPending,
		ChangedBy:     user.UserID,
		ChangedByRole: user.Role,
		Reason:        strPtr("Order created"),
	})
	if err != nil {
		return nil, err
	}

	err = s.repo.InsertAuditLog(ctx, tx, repository.CreateAuditLogInput{
		OrderID:   createdOrder.ID,
		Action:    "ORDER_CREATED",
		ActorID:   user.UserID,
		ActorRole: user.Role,
		RequestID: requestID,
		Metadata: map[string]any{
			"itemCount":   len(createdItems),
			"totalAmount": total,
		},
		OccurredAt: s.defaultStatusTime(),
	})
	if err != nil {
		return nil, err
	}

	if err := s.enqueueOrderEvent(ctx, tx, EventOrderCreated, createdOrder, user, requestID); err != nil {
		return nil, err
	}

	response := toOrderResponse(createdOrder)
	if err := s.idempotency.PersistResult(ctx, tx, user.UserID, idempotencyKey, acquire.RequestHash, http.StatusCreated, response, createdOrder.ID); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	s.sagaMetrics.IncStarted()
	return response, nil
}

func (s *OrderService) ListOrders(ctx context.Context, user domain.UserContext, req ListOrdersRequest) (map[string]any, error) {
	if _, ok := domain.ReadableRoles[user.Role]; !ok {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}

	var forcedUserID *string
	var forcedSellerID *string
	if user.Role == domain.RoleCustomer {
		forcedUserID = &user.UserID
	}
	if user.Role == domain.RoleSeller {
		forcedSellerID = &user.UserID
	}

	items, totalItems, err := s.repo.ListOrders(ctx, repository.ListOrdersQuery{
		Page:      req.Page,
		PageSize:  req.PageSize,
		Status:    req.Status,
		SortBy:    req.SortBy,
		SortOrder: req.SortOrder,
		UserID:    req.UserID,
		Search:    req.Search,
	}, forcedUserID, forcedSellerID)
	if err != nil {
		return nil, err
	}

	respItems := make([]map[string]any, 0, len(items))
	for _, item := range items {
		respItems = append(respItems, toOrderResponse(item))
	}

	return map[string]any{
		"items": respItems,
		"pagination": map[string]any{
			"page":       req.Page,
			"pageSize":   req.PageSize,
			"totalItems": totalItems,
			"totalPages": totalPages(totalItems, req.PageSize),
		},
	}, nil
}

func (s *OrderService) ListCompletedOrdersForRecommendation(ctx context.Context, req ListCompletedOrdersRequest) (map[string]any, error) {
	if req.Page < 1 {
		req.Page = 1
	}
	if req.PageSize < 1 {
		req.PageSize = 500
	}
	if req.PageSize > 1000 {
		req.PageSize = 1000
	}
	if !req.From.Before(req.To) {
		return nil, validationError("from", "must be before to")
	}

	orders, totalItems, err := s.repo.ListCompletedOrders(ctx, repository.ListCompletedOrdersQuery{
		From:     req.From,
		To:       req.To,
		Page:     req.Page,
		PageSize: req.PageSize,
	})
	if err != nil {
		return nil, err
	}

	respItems := make([]map[string]any, 0, len(orders))
	for _, order := range orders {
		items := make([]map[string]any, 0, len(order.Items))
		for _, item := range order.Items {
			items = append(items, map[string]any{
				"productId": item.ProductID,
				"quantity":  item.Quantity,
				"unitPrice": item.UnitPrice,
			})
		}
		resp := map[string]any{
			"orderId":     order.ID,
			"userId":      order.UserID,
			"sellerId":    nil,
			"completedAt": order.CompletedAt.UTC().Format(time.RFC3339Nano),
			"items":       items,
		}
		if order.SellerID != nil {
			resp["sellerId"] = *order.SellerID
		}
		respItems = append(respItems, resp)
	}

	return map[string]any{
		"items": respItems,
		"pagination": map[string]any{
			"page":       req.Page,
			"pageSize":   req.PageSize,
			"totalItems": totalItems,
			"totalPages": totalPages(totalItems, req.PageSize),
			"hasNext":    req.Page < totalPages(totalItems, req.PageSize),
		},
	}, nil
}

func (s *OrderService) GetOrderByID(ctx context.Context, user domain.UserContext, orderID string) (map[string]any, error) {
	if _, ok := domain.ReadableRoles[user.Role]; !ok {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}

	order, err := s.repo.FindOrderByID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Order not found", nil)
	}

	if err := assertCanReadOrder(user, *order); err != nil {
		return nil, err
	}

	return toOrderResponse(*order), nil
}

func (s *OrderService) CancelOrder(ctx context.Context, user domain.UserContext, requestID, orderID string, req CancelOrderRequest) (map[string]any, error) {
	if req.Reason != nil && len(strings.TrimSpace(*req.Reason)) > 500 {
		return nil, validationError("reason", "max length is 500")
	}

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	order, err := s.repo.FindOrderByIDForUpdate(ctx, tx, orderID)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Order not found", nil)
	}

	if err := assertCanCancelOrder(user, *order); err != nil {
		return nil, err
	}
	if err := assertCanTransition(order.Status, domain.OrderStatusCancelled); err != nil {
		return nil, err
	}

	previousStatus := order.Status
	updatedOrder, err := s.repo.UpdateOrderStatus(ctx, tx, order.ID, domain.OrderStatusCancelled)
	if err != nil {
		return nil, err
	}

	reason := trimAndNilIfEmpty(req.Reason)
	if err := s.repo.InsertStatusHistory(ctx, tx, repository.CreateStatusHistoryInput{
		OrderID:       updatedOrder.ID,
		FromStatus:    &previousStatus,
		ToStatus:      domain.OrderStatusCancelled,
		ChangedBy:     user.UserID,
		ChangedByRole: user.Role,
		Reason:        reason,
	}); err != nil {
		return nil, err
	}

	if err := s.repo.InsertAuditLog(ctx, tx, repository.CreateAuditLogInput{
		OrderID:   updatedOrder.ID,
		Action:    "ORDER_CANCELLED",
		ActorID:   user.UserID,
		ActorRole: user.Role,
		RequestID: requestID,
		Metadata: map[string]any{
			"fromStatus": previousStatus,
			"toStatus":   domain.OrderStatusCancelled,
			"reason":     reason,
		},
		OccurredAt: s.defaultStatusTime(),
	}); err != nil {
		return nil, err
	}

	if err := s.enqueueOrderEvent(ctx, tx, EventOrderCancelled, updatedOrder, user, requestID); err != nil {
		return nil, err
	}
	if err := s.enqueueOrderEvent(ctx, tx, EventOrderStatusUpdated, updatedOrder, user, requestID); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return toOrderResponse(updatedOrder), nil
}

func (s *OrderService) ConfirmReceived(ctx context.Context, user domain.UserContext, requestID, orderID string) (map[string]any, error) {
	if user.Role != domain.RoleCustomer {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Only customer can confirm received", nil)
	}

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	order, err := s.repo.FindOrderByIDForUpdate(ctx, tx, orderID)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Order not found", nil)
	}

	if err := assertOrderOwner(user, *order); err != nil {
		return nil, err
	}
	if err := assertCanTransition(order.Status, domain.OrderStatusDelivered); err != nil {
		return nil, err
	}

	previousStatus := order.Status
	updatedOrder, err := s.repo.UpdateOrderStatus(ctx, tx, order.ID, domain.OrderStatusDelivered)
	if err != nil {
		return nil, err
	}

	if err := s.repo.InsertStatusHistory(ctx, tx, repository.CreateStatusHistoryInput{
		OrderID:       updatedOrder.ID,
		FromStatus:    &previousStatus,
		ToStatus:      domain.OrderStatusDelivered,
		ChangedBy:     user.UserID,
		ChangedByRole: user.Role,
		Reason:        strPtr("Customer confirmed received"),
	}); err != nil {
		return nil, err
	}

	if err := s.repo.InsertAuditLog(ctx, tx, repository.CreateAuditLogInput{
		OrderID:   updatedOrder.ID,
		Action:    "ORDER_CONFIRMED_RECEIVED",
		ActorID:   user.UserID,
		ActorRole: user.Role,
		RequestID: requestID,
		Metadata: map[string]any{
			"fromStatus": previousStatus,
			"toStatus":   domain.OrderStatusDelivered,
		},
		OccurredAt: s.defaultStatusTime(),
	}); err != nil {
		return nil, err
	}

	if err := s.enqueueOrderEvent(ctx, tx, EventOrderDelivered, updatedOrder, user, requestID); err != nil {
		return nil, err
	}
	if err := s.enqueueOrderEvent(ctx, tx, EventOrderStatusUpdated, updatedOrder, user, requestID); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return toOrderResponse(updatedOrder), nil
}

func (s *OrderService) UpdateOrderStatus(ctx context.Context, user domain.UserContext, requestID, orderID string, req UpdateOrderStatusRequest) (map[string]any, error) {
	if _, ok := domain.StaffRoles[user.Role]; !ok {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Only staff roles can update order status", nil)
	}

	status := domain.OrderStatus(strings.ToUpper(strings.TrimSpace(req.Status)))
	if !domain.IsValidOrderStatus(status) {
		return nil, validationError("status", "invalid order status")
	}
	if req.Reason != nil && len(strings.TrimSpace(*req.Reason)) > 500 {
		return nil, validationError("reason", "max length is 500")
	}

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	order, err := s.repo.FindOrderByIDForUpdate(ctx, tx, orderID)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Order not found", nil)
	}
	if err := assertCanReadOrder(user, *order); err != nil {
		return nil, err
	}
	if err := assertCanManuallyUpdateOrderStatus(user, order.Status, status); err != nil {
		return nil, err
	}

	if err := assertCanTransition(order.Status, status); err != nil {
		return nil, err
	}
	if status == domain.OrderStatusConfirmed {
		state, err := s.repo.FindOrderSagaStateForUpdate(ctx, tx, order.ID)
		if err != nil {
			return nil, err
		}
		if !canSellerConfirmCheckout(*order, state) {
			return nil, httpx.NewAppError(
				http.StatusUnprocessableEntity,
				domain.ErrorCodeInvalidOrderStatusTransition,
				"Order cannot be confirmed until inventory is reserved and payment requirements are satisfied",
				nil,
			)
		}
	}

	previousStatus := order.Status
	updatedOrder, err := s.repo.UpdateOrderStatus(ctx, tx, order.ID, status)
	if err != nil {
		return nil, err
	}

	reason := trimAndNilIfEmpty(req.Reason)
	if err := s.repo.InsertStatusHistory(ctx, tx, repository.CreateStatusHistoryInput{
		OrderID:       updatedOrder.ID,
		FromStatus:    &previousStatus,
		ToStatus:      status,
		ChangedBy:     user.UserID,
		ChangedByRole: user.Role,
		Reason:        reason,
	}); err != nil {
		return nil, err
	}

	if err := s.repo.InsertAuditLog(ctx, tx, repository.CreateAuditLogInput{
		OrderID:   updatedOrder.ID,
		Action:    "ORDER_STATUS_UPDATED",
		ActorID:   user.UserID,
		ActorRole: user.Role,
		RequestID: requestID,
		Metadata: map[string]any{
			"fromStatus": previousStatus,
			"toStatus":   status,
			"reason":     reason,
		},
		OccurredAt: s.defaultStatusTime(),
	}); err != nil {
		return nil, err
	}

	if err := s.enqueueOrderEvent(ctx, tx, EventOrderStatusUpdated, updatedOrder, user, requestID); err != nil {
		return nil, err
	}
	if status == domain.OrderStatusDelivered {
		if err := s.enqueueOrderEvent(ctx, tx, EventOrderDelivered, updatedOrder, user, requestID); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return toOrderResponse(updatedOrder), nil
}

func (s *OrderService) GetOrderStatusHistory(ctx context.Context, user domain.UserContext, orderID string) (map[string]any, error) {
	if _, ok := domain.ReadableRoles[user.Role]; !ok {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}

	order, err := s.repo.FindOrderByID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Order not found", nil)
	}

	if err := assertCanReadOrder(user, *order); err != nil {
		return nil, err
	}

	histories, err := s.repo.ListOrderStatusHistory(ctx, orderID)
	if err != nil {
		return nil, err
	}

	mapped := make([]map[string]any, 0, len(histories))
	for _, h := range histories {
		item := map[string]any{
			"id":            h.ID,
			"fromStatus":    nil,
			"toStatus":      h.ToStatus,
			"changedBy":     h.ChangedBy,
			"changedByRole": h.ChangedByRole,
			"reason":        nil,
			"createdAt":     h.CreatedAt.UTC().Format(time.RFC3339Nano),
		}
		if h.FromStatus != nil {
			item["fromStatus"] = *h.FromStatus
		}
		if h.Reason != nil {
			item["reason"] = *h.Reason
		}
		mapped = append(mapped, item)
	}

	return map[string]any{"orderId": orderID, "histories": mapped}, nil
}

func (s *OrderService) enqueueOrderEvent(ctx context.Context, tx pgx.Tx, eventType string, order domain.Order, actor domain.UserContext, requestID string) error {
	return s.repo.InsertOutboxEvent(ctx, tx, repository.CreateOutboxEventInput{
		AggregateType: "order",
		AggregateID:   order.ID,
		EventType:     eventType,
		Payload: map[string]any{
			"orderId":           order.ID,
			"orderNumber":       order.OrderNumber,
			"orderCode":         formatOrderCode(order.OrderNumber, order.ID),
			"userId":            order.UserID,
			"userCode":          formatCode(order.UserID, "CUS"),
			"sellerId":          order.SellerID,
			"status":            order.Status,
			"paymentMethod":     order.PaymentMethod,
			"recipientName":     order.RecipientName,
			"recipientPhone":    order.RecipientPhone,
			"recipientAddress":  order.RecipientAddress,
			"recipientWard":     order.RecipientWard,
			"recipientDistrict": order.RecipientDistrict,
			"recipientProvince": order.RecipientProvince,
			"subtotalAmount":    order.SubtotalAmount,
			"shippingAmount":    order.ShippingAmount,
			"discountAmount":    order.DiscountAmount,
			"totalAmount":       order.TotalAmount,
			"currency":          order.Currency,
			"note":              order.Note,
			"createdAt":         order.CreatedAt.UTC().Format(time.RFC3339Nano),
			"items":             mapOrderItemsForEvent(order.Items),
			"metadata": map[string]any{
				"requestId":  requestID,
				"occurredAt": time.Now().UTC().Format(time.RFC3339Nano),
				"actorId":    actor.UserID,
				"actorRole":  actor.Role,
			},
		},
	})
}

func toOrderResponse(order domain.Order) map[string]any {
	items := make([]map[string]any, 0, len(order.Items))
	for _, item := range order.Items {
		items = append(items, map[string]any{
			"id":          item.ID,
			"productId":   item.ProductID,
			"sku":         item.SKU,
			"productName": item.ProductNameSnapshot,
			"quantity":    item.Quantity,
			"unitPrice":   item.UnitPrice,
			"totalPrice":  item.TotalPrice,
		})
	}

	resp := map[string]any{
		"id":                order.ID,
		"orderNumber":       order.OrderNumber,
		"orderCode":         formatOrderCode(order.OrderNumber, order.ID),
		"userId":            order.UserID,
		"userCode":          formatCode(order.UserID, "CUS"),
		"sellerId":          order.SellerID,
		"status":            order.Status,
		"paymentMethod":     order.PaymentMethod,
		"recipientName":     order.RecipientName,
		"recipientPhone":    order.RecipientPhone,
		"recipientAddress":  order.RecipientAddress,
		"recipientWard":     order.RecipientWard,
		"recipientDistrict": order.RecipientDistrict,
		"recipientProvince": order.RecipientProvince,
		"currency":          order.Currency,
		"subtotalAmount":    order.SubtotalAmount,
		"shippingAmount":    order.ShippingAmount,
		"discountAmount":    order.DiscountAmount,
		"totalAmount":       order.TotalAmount,
		"note":              nil,
		"createdAt":         order.CreatedAt.UTC().Format(time.RFC3339Nano),
		"updatedAt":         order.UpdatedAt.UTC().Format(time.RFC3339Nano),
		"items":             items,
	}
	if order.Note != nil {
		resp["note"] = *order.Note
	}
	return resp
}

func validateCreateOrderRequest(req CreateOrderRequest) error {
	if _, err := uuid.Parse(strings.TrimSpace(req.SellerID)); err != nil {
		return validationError("sellerId", "must be a valid UUID")
	}
	if !currencyRegex.MatchString(strings.TrimSpace(req.Currency)) {
		return validationError("currency", "must match ^[A-Z]{3}$")
	}
	paymentMethod := strings.ToUpper(strings.TrimSpace(req.PaymentMethod))
	if paymentMethod != "COD" && paymentMethod != "ONLINE" {
		return validationError("paymentMethod", "must be one of COD, ONLINE")
	}
	if l := len(strings.TrimSpace(req.RecipientName)); l < 1 || l > 255 {
		return validationError("recipientName", "length must be between 1 and 255")
	}
	if l := len(strings.TrimSpace(req.RecipientPhone)); l < 1 || l > 32 {
		return validationError("recipientPhone", "length must be between 1 and 32")
	}
	if l := len(strings.TrimSpace(req.RecipientAddress)); l < 1 || l > 500 {
		return validationError("recipientAddress", "length must be between 1 and 500")
	}
	for field, value := range map[string]*string{
		"recipientWard":     req.RecipientWard,
		"recipientDistrict": req.RecipientDistrict,
		"recipientProvince": req.RecipientProvince,
	} {
		if value != nil && len(strings.TrimSpace(*value)) > 128 {
			return validationError(field, "max length is 128")
		}
	}

	if req.ShippingAmount != nil {
		if *req.ShippingAmount < 0 || !hasMax2Decimals(*req.ShippingAmount) {
			return validationError("shippingAmount", "must be >= 0 with max 2 decimal places")
		}
	}
	if req.DiscountAmount != nil {
		if *req.DiscountAmount < 0 || !hasMax2Decimals(*req.DiscountAmount) {
			return validationError("discountAmount", "must be >= 0 with max 2 decimal places")
		}
	}
	if req.Note != nil && len(strings.TrimSpace(*req.Note)) > 500 {
		return validationError("note", "max length is 500")
	}

	if len(req.Items) < 1 {
		return validationError("items", "must contain at least 1 item")
	}

	for i, item := range req.Items {
		prefix := "items[" + strconv.Itoa(i) + "]"
		if !productIDRegex.MatchString(strings.TrimSpace(item.ProductID)) {
			return validationError(prefix+".productId", "invalid productId format")
		}
		sku := strings.TrimSpace(item.SKU)
		if l := len(sku); l < 1 || l > 64 {
			return validationError(prefix+".sku", "length must be between 1 and 64")
		}
		name := strings.TrimSpace(item.ProductName)
		if l := len(name); l < 1 || l > 255 {
			return validationError(prefix+".productName", "length must be between 1 and 255")
		}
		if item.Quantity < 1 || !isWholeNumber(item.Quantity) {
			return validationError(prefix+".quantity", "must be integer >= 1")
		}
		if item.UnitPrice < 0 || !hasMax2Decimals(item.UnitPrice) {
			return validationError(prefix+".unitPrice", "must be >= 0 with max 2 decimal places")
		}
	}

	return nil
}

func mapOrderItemsForEvent(items []domain.OrderItem) []map[string]any {
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{
			"id":          item.ID,
			"productId":   item.ProductID,
			"sku":         item.SKU,
			"productName": item.ProductNameSnapshot,
			"quantity":    item.Quantity,
			"unitPrice":   item.UnitPrice,
			"totalPrice":  item.TotalPrice,
		})
	}
	return out
}

func assertCanReadOrder(user domain.UserContext, order domain.Order) error {
	if user.Role == domain.RoleCustomer {
		return assertOrderOwner(user, order)
	}
	if user.Role == domain.RoleSeller && order.SellerID != user.UserID {
		return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Access denied for this order", nil)
	}
	return nil
}

func assertCanCancelOrder(user domain.UserContext, order domain.Order) error {
	if user.Role == domain.RoleCustomer {
		if err := assertOrderOwner(user, order); err != nil {
			return err
		}
		if order.Status != domain.OrderStatusPending {
			return httpx.NewAppError(
				http.StatusUnprocessableEntity,
				domain.ErrorCodeInvalidOrderStatusTransition,
				"Customer cannot cancel order after fulfillment processing has started",
				nil,
			)
		}
		return nil
	}
	if _, ok := domain.StaffRoles[user.Role]; !ok {
		return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Not allowed to cancel order", nil)
	}
	if user.Role == domain.RoleSeller && order.SellerID != user.UserID {
		return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Access denied for this order", nil)
	}
	return nil
}

func assertOrderOwner(user domain.UserContext, order domain.Order) error {
	if order.UserID != user.UserID {
		return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Access denied for this order", nil)
	}
	return nil
}

func assertCanTransition(current, next domain.OrderStatus) error {
	allowed := domain.OrderStatusTransitions[current]
	if _, ok := allowed[next]; !ok {
		return httpx.NewAppError(
			http.StatusUnprocessableEntity,
			domain.ErrorCodeInvalidOrderStatusTransition,
			"Cannot transition order status from "+string(current)+" to "+string(next),
			nil,
		)
	}
	return nil
}

func assertCanManuallyUpdateOrderStatus(user domain.UserContext, current, next domain.OrderStatus) error {
	if user.Role != domain.RoleSeller {
		return nil
	}
	if current == domain.OrderStatusPending &&
		(next == domain.OrderStatusConfirmed || next == domain.OrderStatusCancelled) {
		return nil
	}
	return httpx.NewAppError(
		http.StatusUnprocessableEntity,
		domain.ErrorCodeInvalidOrderStatusTransition,
		"Seller can only confirm or cancel an order before dispatch starts",
		nil,
	)
}

func validationError(field, msg string) error {
	return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Validation failed", map[string]any{field: msg})
}

func (s *OrderService) resolveAuthoritativeOrderItems(ctx context.Context, req CreateOrderRequest) ([]repository.CreateOrderItemInput, float64, error) {
	if s.productCatalog == nil {
		return nil, 0, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Product catalog dependency is unavailable", nil)
	}

	currency := strings.ToUpper(strings.TrimSpace(req.Currency))
	productCache := make(map[string]*CatalogProduct, len(req.Items))

	normalizedItems := make([]repository.CreateOrderItemInput, 0, len(req.Items))
	subtotal := 0.0
	for idx, item := range req.Items {
		productID := strings.TrimSpace(item.ProductID)
		product, ok := productCache[productID]
		if !ok {
			var err error
			product, err = s.productCatalog.GetProductByID(ctx, productID)
			if err != nil {
				return nil, 0, err
			}
			productCache[productID] = product
		}

		prefix := "items[" + strconv.Itoa(idx) + "]"
		if product == nil {
			return nil, 0, validationError(prefix+".productId", "product not found")
		}
		if product.Status != "ACTIVE" {
			return nil, 0, validationError(prefix+".productId", "product is not active")
		}
		if product.SellerID == "" || product.SellerID != strings.TrimSpace(req.SellerID) {
			return nil, 0, validationError(prefix+".productId", "product seller does not match order seller")
		}

		variant, found := findCatalogVariantBySKU(product.Variants, strings.TrimSpace(item.SKU))
		if !found {
			return nil, 0, validationError(prefix+".sku", "sku not found in product")
		}
		if variant.Currency == "" || variant.Currency != currency {
			return nil, 0, validationError(prefix+".sku", "sku currency does not match order currency")
		}

		expectedPrice := roundMoney(variant.Price)
		requestedPrice := roundMoney(item.UnitPrice)
		if expectedPrice != requestedPrice {
			return nil, 0, validationError(prefix+".unitPrice", "unitPrice mismatch with product catalog")
		}

		productNameSnapshot := strings.TrimSpace(variant.Name)
		if productNameSnapshot == "" {
			productNameSnapshot = product.Name
		}
		if productNameSnapshot == "" {
			productNameSnapshot = strings.TrimSpace(item.ProductName)
		}

		quantity := int(math.Round(item.Quantity))
		lineTotal := roundMoney(float64(quantity) * expectedPrice)
		subtotal += lineTotal
		normalizedItems = append(normalizedItems, repository.CreateOrderItemInput{
			ProductID:           productID,
			SKU:                 strings.TrimSpace(item.SKU),
			ProductNameSnapshot: productNameSnapshot,
			Quantity:            quantity,
			UnitPrice:           expectedPrice,
			TotalPrice:          lineTotal,
		})
	}

	return normalizedItems, roundMoney(subtotal), nil
}

func findCatalogVariantBySKU(variants []CatalogVariant, sku string) (CatalogVariant, bool) {
	target := strings.TrimSpace(sku)
	for _, variant := range variants {
		if strings.TrimSpace(variant.SKU) == target {
			return variant, true
		}
	}
	return CatalogVariant{}, false
}

func roundMoney(value float64) float64 {
	return math.Round((value+math.SmallestNonzeroFloat64)*100) / 100
}

func hasMax2Decimals(value float64) bool {
	return math.Abs(value*100-math.Round(value*100)) < 1e-9
}

func isWholeNumber(value float64) bool {
	return math.Abs(value-math.Round(value)) < 1e-9
}

func totalPages(totalItems, pageSize int) int {
	if totalItems == 0 {
		return 0
	}
	return (totalItems + pageSize - 1) / pageSize
}

func trimAndNilIfEmpty(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func strPtr(v string) *string {
	return &v
}

func (s *OrderService) generateOrderNumber() string {
	now := time.Now().UTC()
	date := fmt.Sprintf("%04d%02d%02d", now.Year(), now.Month(), now.Day())
	seq := atomic.AddUint64(&s.orderSeq, 1) % 1000000
	// Keep <= 32 chars for orders.order_number varchar(32).
	// Format length: 4 + 8 + 1 + 10 + 1 + 6 = 30.
	return fmt.Sprintf("ORD-%s-%010d-%06d", date, now.Unix(), seq)
}

func formatOrderCode(orderNumber string, fallbackID string) string {
	source := strings.TrimSpace(orderNumber)
	if source == "" {
		source = strings.TrimSpace(fallbackID)
	}
	return formatCode(source, "EMX")
}

func formatCode(raw string, prefix string) string {
	source := strings.TrimSpace(raw)
	if source == "" {
		return prefix + "0000000"
	}

	normalized := strings.ToUpper(source)
	digits := make([]rune, 0, len(normalized))
	for _, r := range normalized {
		if r >= '0' && r <= '9' {
			digits = append(digits, r)
		}
	}
	if len(digits) >= 7 {
		return prefix + string(digits[len(digits)-7:])
	}

	return fmt.Sprintf("%s%07d", prefix, stableHash(source))
}

func stableHash(value string) int {
	const modulo = 10_000_000
	hash := 0
	for _, r := range value {
		hash = (hash*31 + int(r)) % modulo
	}
	return hash
}
