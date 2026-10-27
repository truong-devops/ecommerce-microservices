package service

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"order-service/internal/domain"
	"order-service/internal/httpx"
	"order-service/internal/repository"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const (
	EventOrderReturnRequested      = "order.return-requested"
	EventOrderReturnShipped        = "order.return-shipped"
	EventOrderReturnRefundApproved = "order.return-refund-approved"
	returnWindow                   = 7 * 24 * time.Hour
)

var validReturnReasons = map[string]struct{}{
	"DAMAGED": {}, "WRONG_ITEM": {}, "MISSING_PARTS": {}, "NOT_AS_DESCRIBED": {}, "QUALITY_ISSUE": {}, "OTHER": {},
}

type CreateReturnRequest struct {
	ReasonCode   string   `json:"reasonCode"`
	ReasonDetail string   `json:"reasonDetail"`
	EvidenceURLs []string `json:"evidenceUrls,omitempty"`
}

type ReturnDecisionRequest struct {
	Decision string  `json:"decision"`
	Note     *string `json:"note,omitempty"`
}

type CompleteReturnRequest struct {
	Note *string `json:"note,omitempty"`
}

type ListReturnRequestsRequest struct {
	Page     int
	PageSize int
	Status   *domain.ReturnRequestStatus
	Search   *string
}

type ReturnService struct {
	repo *repository.OrderRepository
	now  func() time.Time
}

func NewReturnService(repo *repository.OrderRepository) *ReturnService {
	return &ReturnService{repo: repo, now: func() time.Time { return time.Now().UTC() }}
}

func (s *ReturnService) Create(ctx context.Context, user domain.UserContext, requestID, orderID string, req CreateReturnRequest) (map[string]any, error) {
	if user.Role != domain.RoleCustomer {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Only customers can request a return", nil)
	}
	if err := validateCreateReturnRequest(req); err != nil {
		return nil, err
	}
	if err := validateIdentifier("orderId", orderID); err != nil {
		return nil, err
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
	if order.UserID != user.UserID {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Order does not belong to this customer", nil)
	}
	exists, err := s.repo.ReturnRequestExistsForOrder(ctx, tx, order.ID)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeReturnAlreadyExists, "A return request already exists for this order", nil)
	}
	if order.Status != domain.OrderStatusDelivered {
		return nil, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeInvalidOrderStatusTransition, "Only delivered orders can be returned", nil)
	}
	if strings.ToUpper(strings.TrimSpace(order.PaymentMethod)) != "ONLINE" {
		return nil, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, "Automatic refund is currently available for online payments only", nil)
	}
	deliveredAt := order.UpdatedAt
	statusDeliveredAt, err := s.repo.FindOrderDeliveredAt(ctx, tx, order.ID)
	if err != nil {
		return nil, err
	}
	if statusDeliveredAt != nil {
		deliveredAt = *statusDeliveredAt
	}
	if s.now().After(deliveredAt.Add(returnWindow)) {
		return nil, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeReturnWindowExpired, "The 7-day return window has expired", nil)
	}

	created, err := s.repo.CreateReturnRequest(ctx, tx, repository.CreateReturnRequestInput{
		ReturnNumber: "RET-" + strings.ToUpper(strings.ReplaceAll(uuid.NewString(), "-", "")[:12]),
		OrderID:      order.ID, CustomerID: order.UserID, SellerID: order.SellerID,
		ReasonCode:   strings.ToUpper(strings.TrimSpace(req.ReasonCode)),
		ReasonDetail: strings.TrimSpace(req.ReasonDetail), EvidenceURLs: normalizeEvidenceURLs(req.EvidenceURLs),
		RefundAmount: order.TotalAmount, Currency: order.Currency,
	})
	if err != nil {
		return nil, err
	}
	created.OrderNumber = order.OrderNumber
	created.OrderItems = order.Items
	if err := s.repo.InsertAuditLog(ctx, tx, repository.CreateAuditLogInput{
		OrderID: order.ID, Action: "RETURN_REQUESTED", ActorID: user.UserID, ActorRole: user.Role,
		RequestID: requestID, Metadata: map[string]any{"returnRequestId": created.ID, "reasonCode": created.ReasonCode}, OccurredAt: s.now(),
	}); err != nil {
		return nil, err
	}
	if err := s.enqueueReturnEvent(ctx, tx, EventOrderReturnRequested, created, user, requestID); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return toReturnRequestResponse(created), nil
}

func (s *ReturnService) GetByOrderID(ctx context.Context, user domain.UserContext, orderID string) (map[string]any, error) {
	if err := validateIdentifier("orderId", orderID); err != nil {
		return nil, err
	}
	request, err := s.repo.FindReturnRequestByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if request == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Return request not found", nil)
	}
	if err := assertCanReadReturn(user, *request); err != nil {
		return nil, err
	}
	return toReturnRequestResponse(*request), nil
}

func (s *ReturnService) List(ctx context.Context, user domain.UserContext, req ListReturnRequestsRequest) (map[string]any, error) {
	if req.Page < 1 {
		req.Page = 1
	}
	if req.PageSize < 1 {
		req.PageSize = 20
	}
	if req.PageSize > 100 {
		req.PageSize = 100
	}
	query := repository.ListReturnRequestsQuery{Page: req.Page, PageSize: req.PageSize, Status: req.Status, Search: req.Search}
	switch user.Role {
	case domain.RoleCustomer:
		query.CustomerID = &user.UserID
	case domain.RoleSeller:
		query.SellerID = &user.UserID
	case domain.RoleAdmin, domain.RoleSupport, domain.RoleSuperAdmin, domain.RoleModerator:
	default:
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}
	items, total, err := s.repo.ListReturnRequests(ctx, query)
	if err != nil {
		return nil, err
	}
	mapped := make([]map[string]any, 0, len(items))
	for _, item := range items {
		mapped = append(mapped, toReturnRequestResponse(item))
	}
	return map[string]any{"items": mapped, "pagination": map[string]any{"page": req.Page, "pageSize": req.PageSize, "totalItems": total, "totalPages": totalPages(total, req.PageSize)}}, nil
}

func (s *ReturnService) Decide(ctx context.Context, user domain.UserContext, requestID, returnID string, req ReturnDecisionRequest) (map[string]any, error) {
	if err := validateIdentifier("returnId", returnID); err != nil {
		return nil, err
	}
	decision := strings.ToUpper(strings.TrimSpace(req.Decision))
	if decision != "APPROVE" && decision != "REJECT" {
		return nil, validationError("decision", "must be APPROVE or REJECT")
	}
	if req.Note != nil && len(strings.TrimSpace(*req.Note)) > 1000 {
		return nil, validationError("note", "max length is 1000")
	}
	if decision == "REJECT" && (req.Note == nil || len(strings.TrimSpace(*req.Note)) < 3) {
		return nil, validationError("note", "a rejection reason of at least 3 characters is required")
	}
	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	request, err := s.repo.FindReturnRequestByIDForUpdate(ctx, tx, returnID)
	if err != nil {
		return nil, err
	}
	if request == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Return request not found", nil)
	}
	if err := assertCanManageReturn(user, *request); err != nil {
		return nil, err
	}
	if request.Status != domain.ReturnRequestStatusRequested {
		return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeInvalidReturnStatus, "Return request is no longer awaiting a decision", nil)
	}
	next := domain.ReturnRequestStatusApproved
	if decision == "REJECT" {
		next = domain.ReturnRequestStatusRejected
	}
	now := s.now()
	note := trimAndNilIfEmpty(req.Note)
	auditAction := "RETURN_APPROVED"
	if decision == "REJECT" {
		auditAction = "RETURN_REJECTED"
	}
	updated, err := s.repo.UpdateReturnRequestStatus(ctx, tx, repository.UpdateReturnRequestStatusInput{
		ID: request.ID, Status: next, SellerNote: note, RespondedAt: &now,
	})
	if err != nil {
		return nil, err
	}
	if err := s.repo.InsertAuditLog(ctx, tx, repository.CreateAuditLogInput{
		OrderID: request.OrderID, Action: auditAction, ActorID: user.UserID, ActorRole: user.Role,
		RequestID: requestID, Metadata: map[string]any{"returnRequestId": request.ID, "fromStatus": request.Status, "toStatus": next, "note": note}, OccurredAt: now,
	}); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return toReturnRequestResponse(updated), nil
}

func (s *ReturnService) Ship(ctx context.Context, user domain.UserContext, requestID, returnID string) (map[string]any, error) {
	if user.Role != domain.RoleCustomer {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Only customers can confirm a return shipment", nil)
	}
	if err := validateIdentifier("returnId", returnID); err != nil {
		return nil, err
	}
	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	request, err := s.repo.FindReturnRequestByIDForUpdate(ctx, tx, returnID)
	if err != nil {
		return nil, err
	}
	if request == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Return request not found", nil)
	}
	if request.CustomerID != user.UserID {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Return request does not belong to this customer", nil)
	}
	if request.Status != domain.ReturnRequestStatusApproved {
		return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeInvalidReturnStatus, "Return request is not awaiting customer shipment", nil)
	}
	order, err := s.repo.FindOrderByIDForUpdate(ctx, tx, request.OrderID)
	if err != nil {
		return nil, err
	}
	if order == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Order not found", nil)
	}
	now := s.now()
	updated, err := s.repo.UpdateReturnRequestStatus(ctx, tx, repository.UpdateReturnRequestStatusInput{
		ID: request.ID, Status: domain.ReturnRequestStatusReturning, ShippedAt: &now,
	})
	if err != nil {
		return nil, err
	}
	if err := s.repo.InsertAuditLog(ctx, tx, repository.CreateAuditLogInput{
		OrderID: request.OrderID, Action: "RETURN_SHIPPED_BY_CUSTOMER", ActorID: user.UserID, ActorRole: user.Role,
		RequestID: requestID, Metadata: map[string]any{"returnRequestId": request.ID, "fromStatus": request.Status, "toStatus": domain.ReturnRequestStatusReturning}, OccurredAt: now,
	}); err != nil {
		return nil, err
	}
	if err := s.enqueueReturnShipmentEvent(ctx, tx, updated, *order, user, requestID); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return toReturnRequestResponse(updated), nil
}

func (s *ReturnService) Complete(ctx context.Context, user domain.UserContext, requestID, returnID string, req CompleteReturnRequest) (map[string]any, error) {
	if err := validateIdentifier("returnId", returnID); err != nil {
		return nil, err
	}
	if req.Note != nil && len(strings.TrimSpace(*req.Note)) > 1000 {
		return nil, validationError("note", "max length is 1000")
	}
	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	request, err := s.repo.FindReturnRequestByIDForUpdate(ctx, tx, returnID)
	if err != nil {
		return nil, err
	}
	if request == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Return request not found", nil)
	}
	if err := assertCanManageReturn(user, *request); err != nil {
		return nil, err
	}
	if request.Status != domain.ReturnRequestStatusReturning {
		return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeInvalidReturnStatus, "Return shipment is not awaiting receipt", nil)
	}
	note := trimAndNilIfEmpty(req.Note)
	now := s.now()
	updated, err := s.repo.UpdateReturnRequestStatus(ctx, tx, repository.UpdateReturnRequestStatusInput{
		ID: request.ID, Status: domain.ReturnRequestStatusRefundPending, SellerNote: note, ReceivedAt: &now,
	})
	if err != nil {
		return nil, err
	}
	if err := s.repo.InsertAuditLog(ctx, tx, repository.CreateAuditLogInput{
		OrderID: request.OrderID, Action: "RETURN_RECEIVED_REFUND_REQUESTED", ActorID: user.UserID, ActorRole: user.Role,
		RequestID: requestID, Metadata: map[string]any{"returnRequestId": request.ID, "refundAmount": request.RefundAmount}, OccurredAt: now,
	}); err != nil {
		return nil, err
	}
	if err := s.enqueueReturnEvent(ctx, tx, EventOrderReturnRefundApproved, updated, user, requestID); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return toReturnRequestResponse(updated), nil
}

func (s *ReturnService) Cancel(ctx context.Context, user domain.UserContext, requestID, returnID string) (map[string]any, error) {
	if user.Role != domain.RoleCustomer {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Only customers can cancel a return request", nil)
	}
	if err := validateIdentifier("returnId", returnID); err != nil {
		return nil, err
	}
	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	request, err := s.repo.FindReturnRequestByIDForUpdate(ctx, tx, returnID)
	if err != nil {
		return nil, err
	}
	if request == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Return request not found", nil)
	}
	if request.CustomerID != user.UserID {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Return request does not belong to this customer", nil)
	}
	if request.Status != domain.ReturnRequestStatusRequested && request.Status != domain.ReturnRequestStatusApproved {
		return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeInvalidReturnStatus, "A return can only be cancelled before shipment", nil)
	}
	updated, err := s.repo.UpdateReturnRequestStatus(ctx, tx, repository.UpdateReturnRequestStatusInput{ID: request.ID, Status: domain.ReturnRequestStatusCancelled})
	if err != nil {
		return nil, err
	}
	if err := s.repo.InsertAuditLog(ctx, tx, repository.CreateAuditLogInput{OrderID: request.OrderID, Action: "RETURN_CANCELLED", ActorID: user.UserID, ActorRole: user.Role, RequestID: requestID, Metadata: map[string]any{"returnRequestId": request.ID}, OccurredAt: s.now()}); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return toReturnRequestResponse(updated), nil
}

func (s *ReturnService) enqueueReturnEvent(ctx context.Context, tx pgx.Tx, eventType string, request domain.ReturnRequest, actor domain.UserContext, requestID string) error {
	return s.repo.InsertOutboxEvent(ctx, tx, repository.CreateOutboxEventInput{AggregateType: "return_request", AggregateID: request.ID, EventType: eventType, Payload: map[string]any{
		"returnRequestId": request.ID, "returnNumber": request.ReturnNumber, "orderId": request.OrderID,
		"customerId": request.CustomerID, "sellerId": request.SellerID, "status": request.Status,
		"refundAmount": request.RefundAmount, "currency": request.Currency,
		"metadata": map[string]any{"requestId": requestID, "occurredAt": s.now().Format(time.RFC3339Nano), "actorId": actor.UserID, "actorRole": actor.Role},
	}})
}

func (s *ReturnService) enqueueReturnShipmentEvent(ctx context.Context, tx pgx.Tx, request domain.ReturnRequest, order domain.Order, actor domain.UserContext, requestID string) error {
	items := make([]map[string]any, 0, len(order.Items))
	for _, item := range order.Items {
		items = append(items, map[string]any{
			"sku": item.SKU, "productName": item.ProductNameSnapshot,
			"quantity": item.Quantity, "unitPrice": item.UnitPrice,
		})
	}
	return s.repo.InsertOutboxEvent(ctx, tx, repository.CreateOutboxEventInput{
		AggregateType: "return_request", AggregateID: request.ID, EventType: EventOrderReturnShipped,
		Payload: map[string]any{
			"returnRequestId": request.ID, "returnNumber": request.ReturnNumber,
			"orderId": request.OrderID, "orderNumber": order.OrderNumber,
			"customerId": request.CustomerID, "sellerId": request.SellerID,
			"status": request.Status, "refundAmount": request.RefundAmount, "currency": request.Currency,
			"senderName": order.RecipientName, "senderPhone": order.RecipientPhone,
			"senderAddress": order.RecipientAddress, "senderWard": order.RecipientWard,
			"senderDistrict": order.RecipientDistrict, "senderProvince": order.RecipientProvince,
			"items": items,
			"metadata": map[string]any{
				"requestId": requestID, "occurredAt": s.now().Format(time.RFC3339Nano),
				"actorId": actor.UserID, "actorRole": actor.Role,
			},
		},
	})
}

func validateCreateReturnRequest(req CreateReturnRequest) error {
	reason := strings.ToUpper(strings.TrimSpace(req.ReasonCode))
	if _, ok := validReturnReasons[reason]; !ok {
		return validationError("reasonCode", "invalid return reason")
	}
	if length := len(strings.TrimSpace(req.ReasonDetail)); length < 10 || length > 1000 {
		return validationError("reasonDetail", "length must be between 10 and 1000")
	}
	if len(req.EvidenceURLs) > 5 {
		return validationError("evidenceUrls", "at most 5 evidence URLs are allowed")
	}
	for _, raw := range req.EvidenceURLs {
		parsed, err := url.ParseRequestURI(strings.TrimSpace(raw))
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || len(raw) > 2048 {
			return validationError("evidenceUrls", "each evidence URL must be a valid HTTP(S) URL")
		}
	}
	return nil
}

func validateIdentifier(field, value string) error {
	if _, err := uuid.Parse(strings.TrimSpace(value)); err != nil {
		return validationError(field, "must be a UUID")
	}
	return nil
}

func normalizeEvidenceURLs(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func assertCanReadReturn(user domain.UserContext, request domain.ReturnRequest) error {
	if user.Role == domain.RoleCustomer && request.CustomerID == user.UserID {
		return nil
	}
	if user.Role == domain.RoleSeller && request.SellerID == user.UserID {
		return nil
	}
	switch user.Role {
	case domain.RoleAdmin, domain.RoleSupport, domain.RoleSuperAdmin, domain.RoleModerator:
		return nil
	}
	return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Not allowed to view this return request", nil)
}

func assertCanManageReturn(user domain.UserContext, request domain.ReturnRequest) error {
	if user.Role == domain.RoleSeller && request.SellerID == user.UserID {
		return nil
	}
	switch user.Role {
	case domain.RoleAdmin, domain.RoleSupport, domain.RoleSuperAdmin:
		return nil
	}
	return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Not allowed to manage this return request", nil)
}

func toReturnRequestResponse(request domain.ReturnRequest) map[string]any {
	items := make([]map[string]any, 0, len(request.OrderItems))
	for _, item := range request.OrderItems {
		items = append(items, map[string]any{"id": item.ID, "productId": item.ProductID, "sku": item.SKU, "productName": item.ProductNameSnapshot, "quantity": item.Quantity, "unitPrice": item.UnitPrice, "totalPrice": item.TotalPrice})
	}
	return map[string]any{"id": request.ID, "returnNumber": request.ReturnNumber, "orderId": request.OrderID, "orderNumber": request.OrderNumber, "customerId": request.CustomerID, "sellerId": request.SellerID, "status": request.Status, "reasonCode": request.ReasonCode, "reasonDetail": request.ReasonDetail, "evidenceUrls": request.EvidenceURLs, "sellerNote": request.SellerNote, "refundAmount": request.RefundAmount, "currency": request.Currency, "requestedAt": request.RequestedAt.Format(time.RFC3339Nano), "respondedAt": formatOptionalTime(request.RespondedAt), "shippedAt": formatOptionalTime(request.ShippedAt), "receivedAt": formatOptionalTime(request.ReceivedAt), "refundedAt": formatOptionalTime(request.RefundedAt), "returnShipmentId": request.ReturnShipmentID, "returnAwb": request.ReturnAWB, "returnTrackingNumber": request.ReturnTrackingNumber, "returnTrackingUrl": request.ReturnTrackingURL, "updatedAt": request.UpdatedAt.Format(time.RFC3339Nano), "items": items}
}

func formatOptionalTime(value *time.Time) any {
	if value == nil {
		return nil
	}
	return value.UTC().Format(time.RFC3339Nano)
}
