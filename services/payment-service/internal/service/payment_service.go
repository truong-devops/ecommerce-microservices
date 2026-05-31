package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"time"

	"payment-service-go/internal/domain"
	"payment-service-go/internal/httpx"
	"payment-service-go/internal/repository"

	"github.com/jackc/pgx/v5"
)

const (
	EventPaymentCreated           = "payment.created"
	EventPaymentRequiresAction    = "payment.requires-action"
	EventPaymentAuthorized        = "payment.authorized"
	EventPaymentCaptured          = "payment.captured"
	EventPaymentFailed            = "payment.failed"
	EventPaymentCancelled         = "payment.cancelled"
	EventPaymentRefunded          = "payment.refunded"
	EventPaymentPartiallyRefunded = "payment.partially-refunded"
	EventPaymentChargeback        = "payment.chargeback"

	TransactionIntentCreated   = "INTENT_CREATED"
	TransactionRequiresAction  = "REQUIRES_ACTION"
	TransactionAuthorized      = "AUTHORIZED"
	TransactionCaptured        = "CAPTURED"
	TransactionFailed          = "FAILED"
	TransactionCancelled       = "CANCELLED"
	TransactionRefundSucceeded = "REFUND_SUCCEEDED"
	TransactionRefundFailed    = "REFUND_FAILED"
	TransactionChargeback      = "CHARGEBACK"

	systemActorID = "00000000-0000-0000-0000-000000000000"
)

type CreatePaymentIntentRequest struct {
	OrderID         string         `json:"orderId"`
	SellerID        *string        `json:"sellerId,omitempty"`
	Currency        string         `json:"currency"`
	Amount          float64        `json:"amount"`
	Provider        *string        `json:"provider,omitempty"`
	Description     *string        `json:"description,omitempty"`
	Metadata        map[string]any `json:"metadata,omitempty"`
	AutoCapture     *bool          `json:"autoCapture,omitempty"`
	SimulatedStatus *string        `json:"simulatedStatus,omitempty"`
}

type CreateRefundRequest struct {
	Amount float64 `json:"amount"`
	Reason *string `json:"reason,omitempty"`
}

type PaymentWebhookRequest struct {
	ProviderEventID      string         `json:"providerEventId"`
	PaymentID            *string        `json:"paymentId,omitempty"`
	OrderID              *string        `json:"orderId,omitempty"`
	GatewayTransactionID *string        `json:"gatewayTransactionId,omitempty"`
	ProviderPaymentID    *string        `json:"providerPaymentId,omitempty"`
	EventType            string         `json:"eventType"`
	Status               string         `json:"status"`
	Amount               *float64       `json:"amount,omitempty"`
	Currency             *string        `json:"currency,omitempty"`
	OccurredAt           *string        `json:"occurredAt,omitempty"`
	Signature            *string        `json:"signature,omitempty"`
	Metadata             map[string]any `json:"metadata,omitempty"`
	RawPayload           map[string]any `json:"rawPayload,omitempty"`
}

type ListPaymentsRequest struct {
	Page      int
	PageSize  int
	Status    *domain.PaymentStatus
	OrderID   *string
	UserID    *string
	SellerID  *string
	Provider  *string
	Search    *string
	SortBy    string
	SortOrder string
}

type PaymentService struct {
	repo          *repository.PaymentRepository
	idempotency   *IdempotencyService
	gateway       PaymentGateway
	orderClient   *OrderClient
	gatewayActive string
	sepayGateway  *SePayGateway
	webhookTTLMin int
}

type sePayProcessInput struct {
	RequestID            string
	Payload              SePayWebhookPayload
	RawPayload           map[string]any
	RawBody              []byte
	RemoteAddr           string
	Source               string
	RequestHash          string
	PersistWebhookResult bool
}

func NewPaymentService(
	repo *repository.PaymentRepository,
	idempotency *IdempotencyService,
	gateway PaymentGateway,
	orderClient *OrderClient,
	gatewayActive string,
	webhookTTLMin int,
) *PaymentService {
	sepayGateway, _ := gateway.(*SePayGateway)
	return &PaymentService{
		repo:          repo,
		idempotency:   idempotency,
		gateway:       gateway,
		orderClient:   orderClient,
		gatewayActive: strings.ToLower(strings.TrimSpace(gatewayActive)),
		sepayGateway:  sepayGateway,
		webhookTTLMin: webhookTTLMin,
	}
}

func (s *PaymentService) CreatePaymentIntent(
	ctx context.Context,
	user domain.UserContext,
	accessToken string,
	requestID, idempotencyKey string,
	req CreatePaymentIntentRequest,
) (map[string]any, int, error) {
	if strings.TrimSpace(idempotencyKey) == "" {
		return nil, 0, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "Missing Idempotency-Key header", nil)
	}

	acquire, err := s.idempotency.AcquireForCreatePaymentIntent(ctx, user.UserID, idempotencyKey, req)
	if err != nil {
		return nil, 0, err
	}
	if acquire.Replay {
		return acquire.ResponseBody, http.StatusCreated, nil
	}
	defer s.idempotency.ReleaseLock(ctx, acquire.LockKey)

	if s.orderClient == nil {
		return nil, 0, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Order service dependency is unavailable", nil)
	}
	orderSnapshot, err := s.orderClient.GetOrderByID(ctx, req.OrderID, accessToken)
	if err != nil {
		return nil, 0, err
	}
	if orderSnapshot.UserID == "" || orderSnapshot.UserID != user.UserID {
		return nil, 0, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Order does not belong to current user", nil)
	}
	if !isPayableOrderStatus(orderSnapshot.Status) {
		return nil, 0, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, "Order status is not payable", map[string]any{"status": orderSnapshot.Status})
	}
	if roundMoney(req.Amount) != orderSnapshot.TotalAmount || strings.ToUpper(strings.TrimSpace(req.Currency)) != orderSnapshot.Currency {
		return nil, 0, httpx.NewAppError(
			http.StatusUnprocessableEntity,
			domain.ErrorCodePaymentAmountMismatch,
			"Payment amount or currency does not match order",
			map[string]any{
				"orderAmount":     orderSnapshot.TotalAmount,
				"orderCurrency":   orderSnapshot.Currency,
				"requestAmount":   roundMoney(req.Amount),
				"requestCurrency": strings.ToUpper(strings.TrimSpace(req.Currency)),
			},
		)
	}
	authoritativeAmount := orderSnapshot.TotalAmount
	authoritativeCurrency := orderSnapshot.Currency

	provider := s.gatewayActive
	if req.Provider != nil && strings.TrimSpace(*req.Provider) != "" {
		provider = strings.ToLower(strings.TrimSpace(*req.Provider))
	}
	if provider != s.gatewayActive {
		return nil, 0, httpx.NewAppError(
			http.StatusBadRequest,
			domain.ErrorCodeBadRequest,
			"Gateway provider "+provider+" is not enabled. Active provider is "+s.gatewayActive,
			nil,
		)
	}

	autoCapture := true
	if req.AutoCapture != nil {
		autoCapture = *req.AutoCapture
	}

	var simulatedStatus *domain.PaymentStatus
	if req.SimulatedStatus != nil && strings.TrimSpace(*req.SimulatedStatus) != "" {
		st := domain.PaymentStatus(strings.ToUpper(strings.TrimSpace(*req.SimulatedStatus)))
		simulatedStatus = &st
	}

	gatewayResult, err := s.gateway.CreatePaymentIntent(CreatePaymentIntentGatewayInput{
		OrderID:         req.OrderID,
		Amount:          authoritativeAmount,
		Currency:        authoritativeCurrency,
		Provider:        provider,
		AutoCapture:     autoCapture,
		SimulatedStatus: simulatedStatus,
		Metadata:        req.Metadata,
		OrderNumber:     trimAndNilIfEmpty(&orderSnapshot.OrderNumber),
	})
	if err != nil {
		return nil, 0, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodePaymentGatewayUnavailable, "Payment gateway unavailable", map[string]any{"error": err.Error()})
	}

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback(ctx)

	existing, err := s.repo.FindPaymentByOrderIDForUpdate(ctx, tx, req.OrderID)
	if err != nil {
		return nil, 0, err
	}
	if existing != nil && existing.UserID != user.UserID {
		return nil, 0, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Order does not belong to current user", nil)
	}

	metadata := map[string]any{}
	if existing != nil {
		for k, v := range existing.Metadata {
			metadata[k] = v
		}
	}
	for k, v := range req.Metadata {
		metadata[k] = v
	}
	if gatewayResult.RequiresActionURL != nil {
		metadata["requiresActionUrl"] = *gatewayResult.RequiresActionURL
	} else {
		metadata["requiresActionUrl"] = nil
	}
	if gatewayResult.Instructions != nil {
		metadata["paymentInstructions"] = paymentInstructionsToMap(*gatewayResult.Instructions)
	}
	if len(metadata) == 0 {
		metadata = nil
	}

	var expiresAt *time.Time
	if gatewayResult.Instructions != nil && !gatewayResult.Instructions.ExpiresAt.IsZero() {
		expiresAt = &gatewayResult.Instructions.ExpiresAt
	}
	var capturedAt *time.Time
	if gatewayResult.Status == domain.PaymentStatusCaptured {
		now := time.Now().UTC()
		capturedAt = &now
	}

	var (
		payment              domain.Payment
		auditAction          = "PAYMENT_INTENT_CREATED"
		statusHistoryReason  = strPtr("Payment intent created")
		isNewPaymentCreation = false
	)
	if existing == nil {
		isNewPaymentCreation = true
		payment, err = s.repo.CreatePayment(ctx, tx, repository.CreatePaymentInput{
			OrderID:           req.OrderID,
			UserID:            user.UserID,
			SellerID:          req.SellerID,
			Provider:          provider,
			ProviderPaymentID: strPtr(gatewayResult.ProviderPaymentID),
			Status:            gatewayResult.Status,
			Currency:          authoritativeCurrency,
			Amount:            authoritativeAmount,
			RefundedAmount:    0,
			Description:       trimAndNilIfEmpty(req.Description),
			Metadata:          metadata,
			ExpiresAt:         expiresAt,
			CapturedAt:        capturedAt,
		})
		if err != nil {
			if repository.IsUniqueViolation(err) {
				return nil, 0, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeConflict, "Payment already exists for this order", nil)
			}
			return nil, 0, err
		}

		if err := s.repo.CreatePaymentStatusHistory(ctx, tx, repository.CreatePaymentStatusHistoryInput{
			PaymentID:     payment.ID,
			FromStatus:    nil,
			ToStatus:      payment.Status,
			ChangedBy:     user.UserID,
			ChangedByRole: user.Role,
			Reason:        statusHistoryReason,
		}); err != nil {
			return nil, 0, err
		}
	} else {
		if !canAttachIntentToExistingPayment(*existing) {
			return nil, 0, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeConflict, "Payment already exists for this order", nil)
		}
		auditAction = "PAYMENT_INTENT_ATTACHED_TO_PENDING_PAYMENT"
		statusHistoryReason = strPtr("Payment intent attached to pending payment")

		updated := *existing
		previousStatus := updated.Status
		updated.Provider = provider
		updated.ProviderPaymentID = strPtr(gatewayResult.ProviderPaymentID)
		updated.Status = gatewayResult.Status
		updated.Currency = authoritativeCurrency
		updated.Amount = authoritativeAmount
		updated.Description = trimAndNilIfEmpty(req.Description)
		updated.Metadata = metadata
		updated.ExpiresAt = expiresAt
		if gatewayResult.Status == domain.PaymentStatusCaptured {
			updated.CapturedAt = capturedAt
		}
		if updated.SellerID == nil && req.SellerID != nil && strings.TrimSpace(*req.SellerID) != "" {
			trimmedSellerID := strings.TrimSpace(*req.SellerID)
			updated.SellerID = &trimmedSellerID
		}

		payment, err = s.repo.SavePayment(ctx, tx, updated)
		if err != nil {
			return nil, 0, err
		}

		if previousStatus != payment.Status {
			if err := s.repo.CreatePaymentStatusHistory(ctx, tx, repository.CreatePaymentStatusHistoryInput{
				PaymentID:     payment.ID,
				FromStatus:    &previousStatus,
				ToStatus:      payment.Status,
				ChangedBy:     user.UserID,
				ChangedByRole: user.Role,
				Reason:        statusHistoryReason,
			}); err != nil {
				return nil, 0, err
			}
		}
	}

	if err := s.repo.CreatePaymentTransaction(ctx, tx, repository.CreatePaymentTransactionInput{
		PaymentID:            payment.ID,
		TransactionType:      mapStatusToTransactionType(payment.Status),
		GatewayTransactionID: strPtr(gatewayResult.GatewayTransactionID),
		Amount:               payment.Amount,
		Currency:             payment.Currency,
		Status:               string(payment.Status),
		RequestID:            requestID,
		RawPayload:           gatewayResult.RawPayload,
	}); err != nil {
		return nil, 0, err
	}

	if err := s.repo.CreatePaymentAuditLog(ctx, tx, repository.CreatePaymentAuditLogInput{
		PaymentID: payment.ID,
		Action:    auditAction,
		ActorID:   user.UserID,
		ActorRole: user.Role,
		RequestID: requestID,
		Metadata: map[string]any{
			"orderId":    payment.OrderID,
			"provider":   provider,
			"status":     payment.Status,
			"isNewOrder": isNewPaymentCreation,
		},
	}); err != nil {
		return nil, 0, err
	}

	if err := s.enqueuePaymentEvent(ctx, tx, EventPaymentCreated, payment, user, requestID); err != nil {
		return nil, 0, err
	}
	if err := s.enqueueStatusEvent(ctx, tx, payment, user, requestID); err != nil {
		return nil, 0, err
	}

	response := toPaymentResponse(payment, gatewayResult.RequiresActionURL)
	if err := s.idempotency.PersistResult(ctx, tx, user.UserID, idempotencyKey, acquire.RequestHash, http.StatusCreated, response, payment.ID); err != nil {
		return nil, 0, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}

	return response, http.StatusCreated, nil
}

func (s *PaymentService) ListPayments(ctx context.Context, user domain.UserContext, req ListPaymentsRequest) (map[string]any, error) {
	if !canReadPaymentRole(user.Role) {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}

	query := req
	var forcedUserID *string
	if user.Role == domain.RoleCustomer {
		forcedUserID = &user.UserID
	}
	if user.Role == domain.RoleSeller {
		query.SellerID = &user.UserID
	}

	items, totalItems, err := s.repo.ListPayments(ctx, repository.ListPaymentsQuery{
		Page:      query.Page,
		PageSize:  query.PageSize,
		Status:    query.Status,
		OrderID:   query.OrderID,
		UserID:    query.UserID,
		SellerID:  query.SellerID,
		Provider:  query.Provider,
		Search:    query.Search,
		SortBy:    query.SortBy,
		SortOrder: query.SortOrder,
	}, forcedUserID)
	if err != nil {
		return nil, err
	}

	respItems := make([]map[string]any, 0, len(items))
	for _, item := range items {
		respItems = append(respItems, toPaymentResponse(item, nil))
	}

	page := req.Page
	if page < 1 {
		page = 1
	}
	pageSize := req.PageSize
	if pageSize < 1 {
		pageSize = 20
	}

	return map[string]any{
		"items": respItems,
		"pagination": map[string]any{
			"page":       page,
			"pageSize":   pageSize,
			"totalItems": totalItems,
			"totalPages": totalPages(totalItems, pageSize),
		},
	}, nil
}

func (s *PaymentService) GetPaymentByID(ctx context.Context, user domain.UserContext, paymentID string) (map[string]any, error) {
	if !canReadPaymentRole(user.Role) {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}

	payment, err := s.repo.FindPaymentByID(ctx, paymentID)
	if err != nil {
		return nil, err
	}
	if payment == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodePaymentNotFound, "Payment not found", nil)
	}

	if err := assertCanReadPayment(user, *payment); err != nil {
		return nil, err
	}
	return toPaymentResponse(*payment, nil), nil
}

func (s *PaymentService) GetPaymentByOrderID(ctx context.Context, user domain.UserContext, orderID string) (map[string]any, error) {
	if !canReadPaymentRole(user.Role) {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}

	payment, err := s.repo.FindPaymentByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if payment == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodePaymentNotFound, "Payment not found", nil)
	}

	if err := assertCanReadPayment(user, *payment); err != nil {
		return nil, err
	}
	return toPaymentResponse(*payment, nil), nil
}

func (s *PaymentService) CreateRefund(
	ctx context.Context,
	user domain.UserContext,
	requestID, paymentID string,
	req CreateRefundRequest,
) (map[string]any, int, error) {
	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback(ctx)

	payment, err := s.repo.FindPaymentByIDForUpdate(ctx, tx, paymentID)
	if err != nil {
		return nil, 0, err
	}
	if payment == nil {
		return nil, 0, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodePaymentNotFound, "Payment not found", nil)
	}

	if err := assertCanRefundPayment(user, *payment); err != nil {
		return nil, 0, err
	}
	if err := assertRefundableStatus(payment.Status); err != nil {
		return nil, 0, err
	}

	remainingRefundable := roundMoney(payment.Amount - payment.RefundedAmount)
	requestedAmount := roundMoney(req.Amount)
	if requestedAmount > remainingRefundable {
		return nil, 0, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeRefundAmountExceeded, "Refund amount exceeds remaining refundable amount", nil)
	}

	gatewayRefund, err := s.gateway.CreateRefund(CreateRefundGatewayInput{
		PaymentID: payment.ID,
		Amount:    requestedAmount,
		Currency:  payment.Currency,
		Reason:    req.Reason,
	})
	if err != nil {
		return nil, 0, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodePaymentGatewayUnavailable, "Payment gateway unavailable for refund", nil)
	}

	refund, err := s.repo.CreateRefund(ctx, tx, repository.CreateRefundInput{
		PaymentID:        payment.ID,
		ProviderRefundID: strPtr(gatewayRefund.ProviderRefundID),
		Amount:           requestedAmount,
		Currency:         payment.Currency,
		Status:           gatewayRefund.Status,
		Reason:           trimAndNilIfEmpty(req.Reason),
		Metadata:         gatewayRefund.RawPayload,
		RequestedBy:      user.UserID,
		RequestedByRole:  user.Role,
	})
	if err != nil {
		return nil, 0, err
	}

	transactionType := TransactionRefundFailed
	if gatewayRefund.Status == domain.RefundStatusSucceeded {
		transactionType = TransactionRefundSucceeded
	}
	if err := s.repo.CreatePaymentTransaction(ctx, tx, repository.CreatePaymentTransactionInput{
		PaymentID:            payment.ID,
		TransactionType:      transactionType,
		GatewayTransactionID: strPtr(gatewayRefund.GatewayTransactionID),
		Amount:               requestedAmount,
		Currency:             payment.Currency,
		Status:               string(gatewayRefund.Status),
		RequestID:            requestID,
		RawPayload:           gatewayRefund.RawPayload,
	}); err != nil {
		return nil, 0, err
	}

	updatedPayment := *payment
	if gatewayRefund.Status == domain.RefundStatusSucceeded {
		previousStatus := payment.Status
		updatedPayment.RefundedAmount = roundMoney(payment.RefundedAmount + requestedAmount)
		nextStatus := domain.PaymentStatusPartiallyRefunded
		if updatedPayment.RefundedAmount >= updatedPayment.Amount {
			nextStatus = domain.PaymentStatusRefunded
		}

		if payment.Status != nextStatus {
			if err := assertCanTransition(payment.Status, nextStatus); err != nil {
				return nil, 0, err
			}
		}

		updatedPayment.Status = nextStatus
		updatedPayment, err = s.repo.SavePayment(ctx, tx, updatedPayment)
		if err != nil {
			return nil, 0, err
		}

		if previousStatus != nextStatus {
			if err := s.repo.CreatePaymentStatusHistory(ctx, tx, repository.CreatePaymentStatusHistoryInput{
				PaymentID:     updatedPayment.ID,
				FromStatus:    &previousStatus,
				ToStatus:      nextStatus,
				ChangedBy:     user.UserID,
				ChangedByRole: user.Role,
				Reason:        trimAndNilIfEmpty(req.Reason),
			}); err != nil {
				return nil, 0, err
			}
		}

		if err := s.enqueueStatusEvent(ctx, tx, updatedPayment, user, requestID); err != nil {
			return nil, 0, err
		}
	}

	if err := s.repo.CreatePaymentAuditLog(ctx, tx, repository.CreatePaymentAuditLogInput{
		PaymentID: payment.ID,
		Action:    "PAYMENT_REFUND_REQUESTED",
		ActorID:   user.UserID,
		ActorRole: user.Role,
		RequestID: requestID,
		Metadata: map[string]any{
			"refundId": refund.ID,
			"amount":   requestedAmount,
			"status":   refund.Status,
			"reason":   trimAndString(req.Reason),
		},
	}); err != nil {
		return nil, 0, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}

	return map[string]any{
		"payment": toPaymentResponse(updatedPayment, nil),
		"refund":  toRefundResponse(refund),
	}, http.StatusCreated, nil
}

func (s *PaymentService) ListRefunds(ctx context.Context, user domain.UserContext, paymentID string) (map[string]any, error) {
	if !canReadPaymentRole(user.Role) {
		return nil, httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Insufficient role", nil)
	}

	payment, err := s.repo.FindPaymentByID(ctx, paymentID)
	if err != nil {
		return nil, err
	}
	if payment == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodePaymentNotFound, "Payment not found", nil)
	}

	if err := assertCanReadPayment(user, *payment); err != nil {
		return nil, err
	}

	refunds, err := s.repo.ListRefundsByPaymentID(ctx, paymentID)
	if err != nil {
		return nil, err
	}

	items := make([]map[string]any, 0, len(refunds))
	for _, refund := range refunds {
		items = append(items, toRefundResponse(refund))
	}

	return map[string]any{"paymentId": paymentID, "items": items}, nil
}

func (s *PaymentService) HandleProviderWebhook(
	ctx context.Context,
	requestID, provider string,
	req PaymentWebhookRequest,
) (map[string]any, int, error) {
	normalizedProvider := strings.ToLower(strings.TrimSpace(provider))
	if normalizedProvider == "" {
		return nil, 0, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "Invalid provider", nil)
	}
	if normalizedProvider != s.gatewayActive {
		return nil, 0, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "Webhook provider "+normalizedProvider+" is not enabled. Active provider is "+s.gatewayActive, nil)
	}

	requestHash := hashWebhookPayload(normalizedProvider, req)
	existing, err := s.repo.FindUnexpiredWebhookIdempotencyRecord(ctx, normalizedProvider, req.ProviderEventID)
	if err != nil {
		return nil, 0, err
	}
	if existing != nil && existing.RequestHash != "" && existing.RequestHash != requestHash {
		return nil, 0, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeWebhookIdempotencyConflict, "Webhook event id already exists with different payload", nil)
	}
	if existing != nil && existing.ResponseBody != nil {
		return existing.ResponseBody, http.StatusOK, nil
	}

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback(ctx)

	payment, err := s.resolvePaymentForWebhook(ctx, tx, req)
	if err != nil {
		return nil, 0, err
	}
	if payment == nil {
		return nil, 0, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodePaymentNotFound, "Payment not found for webhook payload", nil)
	}

	parsedStatus := domain.PaymentStatus(strings.ToUpper(strings.TrimSpace(req.Status)))
	parsedWebhook, err := s.gateway.ParseWebhook(ParseWebhookGatewayInput{
		Provider:             normalizedProvider,
		ProviderEventID:      req.ProviderEventID,
		Status:               parsedStatus,
		Signature:            req.Signature,
		Amount:               req.Amount,
		Currency:             req.Currency,
		PaymentID:            req.PaymentID,
		OrderID:              req.OrderID,
		GatewayTransactionID: req.GatewayTransactionID,
		ProviderPaymentID:    req.ProviderPaymentID,
		Metadata:             req.Metadata,
		RawPayload:           req.RawPayload,
	})
	if err != nil {
		return nil, 0, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodePaymentGatewayUnavailable, "Payment gateway unavailable", nil)
	}
	if !parsedWebhook.IsValid {
		return nil, 0, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeGatewayCallbackInvalidSig, trimOrDefault(parsedWebhook.Reason, "Invalid webhook signature"), nil)
	}

	if parsedWebhook.Amount != nil && roundMoney(*parsedWebhook.Amount) != payment.Amount {
		return nil, 0, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodePaymentAmountMismatch, "Webhook amount does not match payment amount", nil)
	}
	if parsedWebhook.Currency != nil && strings.TrimSpace(*parsedWebhook.Currency) != "" {
		webhookCurrency := strings.ToUpper(strings.TrimSpace(*parsedWebhook.Currency))
		if webhookCurrency != payment.Currency {
			return nil, 0, httpx.NewAppError(
				http.StatusUnprocessableEntity,
				domain.ErrorCodePaymentCurrencyMismatch,
				"Webhook currency does not match payment currency",
				map[string]any{
					"paymentCurrency": payment.Currency,
					"webhookCurrency": webhookCurrency,
				},
			)
		}
	}

	updatedPayment := *payment
	systemActor := domain.UserContext{UserID: systemActorID, Email: "system@payment.local", Role: domain.RoleSupport}

	if payment.Status != parsedWebhook.Status {
		if err := assertCanTransition(payment.Status, parsedWebhook.Status); err != nil {
			return nil, 0, err
		}

		previousStatus := payment.Status
		updatedPayment.Status = parsedWebhook.Status
		if parsedWebhook.Status == domain.PaymentStatusCaptured && updatedPayment.CapturedAt == nil {
			now := time.Now().UTC()
			updatedPayment.CapturedAt = &now
		}
		if parsedWebhook.Status == domain.PaymentStatusRefunded {
			updatedPayment.RefundedAmount = updatedPayment.Amount
		}

		updatedPayment, err = s.repo.SavePayment(ctx, tx, updatedPayment)
		if err != nil {
			return nil, 0, err
		}

		if err := s.repo.CreatePaymentStatusHistory(ctx, tx, repository.CreatePaymentStatusHistoryInput{
			PaymentID:     updatedPayment.ID,
			FromStatus:    &previousStatus,
			ToStatus:      parsedWebhook.Status,
			ChangedBy:     systemActorID,
			ChangedByRole: domain.RoleSupport,
			Reason:        strPtr("Webhook status sync from provider " + normalizedProvider),
		}); err != nil {
			return nil, 0, err
		}

		if err := s.enqueueStatusEvent(ctx, tx, updatedPayment, systemActor, requestID); err != nil {
			return nil, 0, err
		}
	}

	statusForTxn := string(parsedWebhook.Status)
	amountForTxn := updatedPayment.Amount
	if parsedWebhook.Amount != nil {
		amountForTxn = roundMoney(*parsedWebhook.Amount)
	}
	currencyForTxn := updatedPayment.Currency
	if parsedWebhook.Currency != nil && strings.TrimSpace(*parsedWebhook.Currency) != "" {
		currencyForTxn = strings.ToUpper(strings.TrimSpace(*parsedWebhook.Currency))
	}

	gatewayTxnID := parsedWebhook.GatewayTransactionID
	if gatewayTxnID == nil {
		gatewayTxnID = req.GatewayTransactionID
	}

	if err := s.repo.CreatePaymentTransaction(ctx, tx, repository.CreatePaymentTransactionInput{
		PaymentID:            updatedPayment.ID,
		TransactionType:      mapStatusToTransactionType(parsedWebhook.Status),
		GatewayTransactionID: gatewayTxnID,
		Amount:               amountForTxn,
		Currency:             currencyForTxn,
		Status:               statusForTxn,
		RequestID:            requestID,
		RawPayload:           coalesceMap(parsedWebhook.RawPayload, req.RawPayload),
	}); err != nil {
		if !repository.IsUniqueViolation(err) {
			return nil, 0, err
		}
	}

	if err := s.repo.CreatePaymentAuditLog(ctx, tx, repository.CreatePaymentAuditLogInput{
		PaymentID: updatedPayment.ID,
		Action:    "PROVIDER_WEBHOOK_RECEIVED",
		ActorID:   systemActorID,
		ActorRole: domain.RoleSupport,
		RequestID: requestID,
		Metadata: map[string]any{
			"provider":        normalizedProvider,
			"providerEventId": req.ProviderEventID,
			"eventType":       req.EventType,
			"status":          parsedWebhook.Status,
		},
	}); err != nil {
		return nil, 0, err
	}

	responseBody := map[string]any{
		"processed": true,
		"provider":  normalizedProvider,
		"payment":   toPaymentResponse(updatedPayment, nil),
	}

	expiresAt := time.Now().UTC().Add(time.Duration(s.webhookTTLMin) * time.Minute)
	statusCode := http.StatusOK
	if err := s.repo.UpsertWebhookIdempotencyRecord(ctx, tx, repository.WebhookIdempotencyRecord{
		Provider:        normalizedProvider,
		ProviderEventID: req.ProviderEventID,
		RequestHash:     requestHash,
		PaymentID:       &updatedPayment.ID,
		ResponseStatus:  &statusCode,
		ResponseBody:    responseBody,
		ExpiresAt:       expiresAt,
	}); err != nil {
		return nil, 0, err
	}

	if err := tx.Commit(ctx); err != nil {
		if repository.IsUniqueViolation(err) {
			persisted, findErr := s.repo.FindWebhookIdempotencyRecord(ctx, normalizedProvider, req.ProviderEventID)
			if findErr == nil && persisted != nil && persisted.RequestHash == requestHash && persisted.ResponseBody != nil {
				return persisted.ResponseBody, http.StatusOK, nil
			}
			return nil, 0, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeWebhookIdempotencyConflict, "Webhook event id already exists with different payload", nil)
		}
		return nil, 0, err
	}

	return responseBody, http.StatusOK, nil
}

func (s *PaymentService) HandleSePayWebhook(
	ctx context.Context,
	requestID string,
	headers http.Header,
	rawBody []byte,
	remoteAddr string,
) (map[string]any, int, error) {
	normalizedProvider := sepayProviderName
	if s.gatewayActive != normalizedProvider {
		return nil, 0, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "Webhook provider sepay is not enabled. Active provider is "+s.gatewayActive, nil)
	}
	if s.sepayGateway == nil {
		return nil, 0, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodePaymentGatewayUnavailable, "SePay gateway unavailable", nil)
	}
	if err := s.sepayGateway.VerifyWebhook(headers, rawBody, time.Now().UTC()); err != nil {
		return nil, 0, httpx.NewAppError(http.StatusUnauthorized, domain.ErrorCodeGatewayCallbackInvalidSig, err.Error(), nil)
	}

	payload, rawPayload, err := s.sepayGateway.ParseWebhookPayload(rawBody)
	if err != nil {
		return nil, 0, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationFailed, "Invalid SePay webhook payload", map[string]any{"body": err.Error()})
	}
	providerEventID := payload.ProviderEventID()
	if strings.TrimSpace(providerEventID) == "" {
		return nil, 0, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationFailed, "SePay webhook payload has no event id", nil)
	}

	requestHash := hashRawWebhookPayload(normalizedProvider, rawBody)
	existing, err := s.repo.FindUnexpiredWebhookIdempotencyRecord(ctx, normalizedProvider, providerEventID)
	if err != nil {
		return nil, 0, err
	}
	if existing != nil && existing.RequestHash != "" && existing.RequestHash != requestHash {
		return nil, 0, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeWebhookIdempotencyConflict, "Webhook event id already exists with different payload", nil)
	}
	if existing != nil && existing.ResponseBody != nil {
		return existing.ResponseBody, http.StatusOK, nil
	}

	return s.processSePayPayload(ctx, sePayProcessInput{
		RequestID:            requestID,
		Payload:              payload,
		RawPayload:           rawPayload,
		RawBody:              rawBody,
		RemoteAddr:           remoteAddr,
		Source:               "webhook",
		RequestHash:          requestHash,
		PersistWebhookResult: true,
	})
}

func (s *PaymentService) processSePayPayload(ctx context.Context, input sePayProcessInput) (map[string]any, int, error) {
	normalizedProvider := sepayProviderName
	payload := input.Payload
	providerEventID := payload.ProviderEventID()
	if strings.TrimSpace(providerEventID) == "" {
		return nil, 0, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeValidationFailed, "SePay payload has no event id", nil)
	}

	existingEvent, err := s.repo.FindPaymentProviderEvent(ctx, normalizedProvider, providerEventID)
	if err != nil {
		return nil, 0, err
	}
	if existingEvent != nil && existingEvent.ProcessStatus == "PROCESSED" {
		return map[string]any{
			"success":         true,
			"processed":       false,
			"duplicate":       true,
			"provider":        normalizedProvider,
			"providerEventId": providerEventID,
		}, http.StatusOK, nil
	}

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback(ctx)

	providerPaymentID := strings.TrimSpace(payload.Code)
	gatewayTxnID := strings.TrimSpace(payload.ReferenceCode)
	rawBodyString := string(input.RawBody)
	rawPayload := make(map[string]any, len(input.RawPayload)+2)
	for k, v := range input.RawPayload {
		rawPayload[k] = v
	}
	if strings.TrimSpace(input.RemoteAddr) != "" {
		rawPayload["remoteAddr"] = input.RemoteAddr
	}
	source := strings.TrimSpace(input.Source)
	if source == "" {
		source = "webhook"
	}
	rawPayload["source"] = source

	if err := s.repo.UpsertPaymentProviderEvent(ctx, tx, repository.CreatePaymentProviderEventInput{
		Provider:             normalizedProvider,
		ProviderEventID:      providerEventID,
		GatewayTransactionID: strPtr(gatewayTxnID),
		ProviderPaymentID:    strPtr(providerPaymentID),
		EventType:            "sepay.bank-transaction",
		ProcessStatus:        "RECEIVED",
		RawPayload:           rawPayload,
		RawBody:              &rawBodyString,
	}); err != nil {
		return nil, 0, err
	}

	failAndCommit := func(code string, reason string, paymentID *string, status string) (map[string]any, int, error) {
		if strings.TrimSpace(status) == "" {
			status = "FAILED"
		}
		responseBody := map[string]any{
			"success":         true,
			"processed":       false,
			"provider":        normalizedProvider,
			"providerEventId": providerEventID,
			"failureCode":     code,
			"message":         reason,
		}
		if err := s.repo.UpdatePaymentProviderEventStatus(ctx, tx, normalizedProvider, providerEventID, paymentID, status, strPtr(code), strPtr(reason)); err != nil {
			return nil, 0, err
		}
		if input.PersistWebhookResult {
			if err := s.persistWebhookResult(ctx, tx, normalizedProvider, providerEventID, input.RequestHash, paymentID, responseBody); err != nil {
				return nil, 0, err
			}
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, 0, err
		}
		return responseBody, http.StatusOK, nil
	}

	if !strings.EqualFold(strings.TrimSpace(payload.TransferType), "in") {
		return failAndCommit("TRANSFER_TYPE_IGNORED", "SePay transaction is not an incoming transfer", nil, "IGNORED")
	}
	if !s.sepayGateway.AllowsAccount(payload.AccountNumber) {
		return failAndCommit("ACCOUNT_MISMATCH", "SePay transaction account does not match configured receiving account", nil, "FAILED")
	}
	if providerPaymentID == "" {
		return failAndCommit("UNKNOWN_PAYMENT_CODE", "SePay transaction has no recognized payment code", nil, "FAILED")
	}

	payment, err := s.repo.FindPaymentByProviderPaymentIDForUpdate(ctx, tx, providerPaymentID)
	if err != nil {
		return nil, 0, err
	}
	if payment == nil {
		return failAndCommit("UNKNOWN_PAYMENT_CODE", "Payment not found for SePay payment code", nil, "FAILED")
	}
	paymentID := &payment.ID

	if payment.Provider != normalizedProvider {
		return failAndCommit("PROVIDER_MISMATCH", "Payment provider does not match SePay", paymentID, "FAILED")
	}
	if !strings.EqualFold(payment.Currency, "VND") {
		return failAndCommit("CURRENCY_MISMATCH", "SePay payment must use VND", paymentID, "FAILED")
	}
	if roundMoney(float64(payload.TransferAmount)) != payment.Amount {
		return failAndCommit("AMOUNT_MISMATCH", "SePay transfer amount does not match payment amount", paymentID, "FAILED")
	}
	now := time.Now().UTC()
	transferTime := sePayTransferTime(payload, now)
	if payment.ExpiresAt != nil && transferTime.After(payment.ExpiresAt.UTC()) {
		return failAndCommit("EXPIRED_PAYMENT", "SePay transfer arrived after payment expiry", paymentID, "FAILED")
	}
	if payment.Status == domain.PaymentStatusCaptured {
		return failAndCommit("DUPLICATE_CAPTURED_PAYMENT", "Payment is already captured", paymentID, "IGNORED")
	}
	if payment.Status != domain.PaymentStatusPending && payment.Status != domain.PaymentStatusRequiresAction {
		if !canRecoverFailedSePayPayment(*payment, transferTime) {
			return failAndCommit("ORDER_NOT_PAYABLE", "Payment is no longer payable", paymentID, "FAILED")
		}
	}
	if payment.Status != domain.PaymentStatusFailed {
		if err := assertCanTransition(payment.Status, domain.PaymentStatusCaptured); err != nil {
			return failAndCommit("INVALID_STATUS_TRANSITION", err.Error(), paymentID, "FAILED")
		}
	} else if !canRecoverFailedSePayPayment(*payment, transferTime) {
		return failAndCommit("INVALID_STATUS_TRANSITION", "Cannot recover failed payment from SePay transaction", paymentID, "FAILED")
	}

	previousStatus := payment.Status
	updatedPayment := *payment
	updatedPayment.Status = domain.PaymentStatusCaptured
	updatedPayment.CapturedAt = &transferTime
	updatedPayment, err = s.repo.SavePayment(ctx, tx, updatedPayment)
	if err != nil {
		return nil, 0, err
	}

	systemActor := domain.UserContext{UserID: systemActorID, Email: "system@payment.local", Role: domain.RoleSupport}
	statusReason := "SePay bank transfer captured"
	if previousStatus == domain.PaymentStatusFailed {
		statusReason = "SePay bank transfer captured after delayed reconciliation"
	}
	if err := s.repo.CreatePaymentStatusHistory(ctx, tx, repository.CreatePaymentStatusHistoryInput{
		PaymentID:     updatedPayment.ID,
		FromStatus:    &previousStatus,
		ToStatus:      domain.PaymentStatusCaptured,
		ChangedBy:     systemActorID,
		ChangedByRole: domain.RoleSupport,
		Reason:        strPtr(statusReason),
	}); err != nil {
		return nil, 0, err
	}
	if err := s.repo.CreatePaymentTransaction(ctx, tx, repository.CreatePaymentTransactionInput{
		PaymentID:            updatedPayment.ID,
		TransactionType:      TransactionCaptured,
		GatewayTransactionID: strPtr(gatewayTxnID),
		Amount:               float64(payload.TransferAmount),
		Currency:             "VND",
		Status:               string(domain.PaymentStatusCaptured),
		RequestID:            strings.TrimSpace(input.RequestID),
		RawPayload:           rawPayload,
	}); err != nil {
		if !repository.IsUniqueViolation(err) {
			return nil, 0, err
		}
	}
	auditAction := "SEPAY_WEBHOOK_CAPTURED"
	if source == "reconciliation" {
		auditAction = "SEPAY_RECONCILIATION_CAPTURED"
	}
	if err := s.repo.CreatePaymentAuditLog(ctx, tx, repository.CreatePaymentAuditLogInput{
		PaymentID: updatedPayment.ID,
		Action:    auditAction,
		ActorID:   systemActorID,
		ActorRole: domain.RoleSupport,
		RequestID: strings.TrimSpace(input.RequestID),
		Metadata: map[string]any{
			"providerEventId":      providerEventID,
			"gatewayTransactionId": gatewayTxnID,
			"paymentCode":          providerPaymentID,
			"accountNumber":        payload.AccountNumber,
			"transferAmount":       payload.TransferAmount,
			"source":               source,
		},
	}); err != nil {
		return nil, 0, err
	}
	if err := s.enqueueStatusEvent(ctx, tx, updatedPayment, systemActor, strings.TrimSpace(input.RequestID)); err != nil {
		return nil, 0, err
	}
	if err := s.repo.UpdatePaymentProviderEventStatus(ctx, tx, normalizedProvider, providerEventID, paymentID, "PROCESSED", nil, nil); err != nil {
		return nil, 0, err
	}

	responseBody := map[string]any{
		"success":         true,
		"processed":       true,
		"provider":        normalizedProvider,
		"providerEventId": providerEventID,
		"payment":         toPaymentResponse(updatedPayment, nil),
	}
	if input.PersistWebhookResult {
		if err := s.persistWebhookResult(ctx, tx, normalizedProvider, providerEventID, input.RequestHash, paymentID, responseBody); err != nil {
			return nil, 0, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	return responseBody, http.StatusOK, nil
}

func (s *PaymentService) ReconcileSePayTransactions(ctx context.Context, client *SePayAPIClient, batchSize int) (int, error) {
	if s.gatewayActive != sepayProviderName || s.sepayGateway == nil || client == nil {
		return 0, nil
	}
	if batchSize < 1 {
		batchSize = 100
	}

	cursor, err := s.repo.GetReconciliationCursor(ctx, sepayProviderName)
	if err != nil {
		return 0, err
	}
	sinceID := ""
	if cursor != nil && cursor.SinceID != nil {
		sinceID = strings.TrimSpace(*cursor.SinceID)
	}

	transactions, err := client.ListTransactions(ctx, ListSePayTransactionsInput{
		AccountNumber: s.sepayGateway.cfg.BankAccountNumber,
		SinceID:       sinceID,
		Limit:         batchSize,
	})
	if err != nil {
		return 0, err
	}

	processed := 0
	maxID := sinceID
	for _, txn := range transactions {
		if !sePayIDAfter(txn.ID, sinceID) {
			continue
		}
		payload, rawPayload, rawBody, err := sePayTransactionToWebhookPayload(txn, s.sepayGateway.cfg.PaymentCodePrefix)
		if err != nil {
			return processed, err
		}
		responseBody, _, err := s.processSePayPayload(ctx, sePayProcessInput{
			RequestID:            "sepay-reconciliation",
			Payload:              payload,
			RawPayload:           rawPayload,
			RawBody:              rawBody,
			Source:               "reconciliation",
			PersistWebhookResult: false,
		})
		if err != nil {
			return processed, err
		}
		if didProcess, ok := responseBody["processed"].(bool); ok && didProcess {
			processed++
		}
		if compareSePayIDs(txn.ID, maxID) > 0 {
			maxID = strings.TrimSpace(txn.ID)
		}
	}
	if strings.TrimSpace(maxID) != "" && strings.TrimSpace(maxID) != sinceID {
		if err := s.repo.UpsertReconciliationCursor(ctx, sepayProviderName, maxID, time.Now().UTC()); err != nil {
			return processed, err
		}
	}
	return processed, nil
}

func sePayTransferTime(payload SePayWebhookPayload, fallback time.Time) time.Time {
	if fallback.IsZero() {
		fallback = time.Now().UTC()
	}
	raw := strings.TrimSpace(payload.TransactionDate)
	if raw == "" {
		return fallback.UTC()
	}

	for _, layout := range []string{time.RFC3339Nano, time.RFC3339} {
		if parsed, err := time.Parse(layout, raw); err == nil {
			return parsed.UTC()
		}
	}

	location, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	if err != nil {
		location = time.Local
	}
	for _, layout := range []string{"2006-01-02 15:04:05", "2006-01-02 15:04", "2006-01-02"} {
		if parsed, err := time.ParseInLocation(layout, raw, location); err == nil {
			return parsed.UTC()
		}
	}

	return fallback.UTC()
}

func canRecoverFailedSePayPayment(payment domain.Payment, transferTime time.Time) bool {
	if payment.Status != domain.PaymentStatusFailed || payment.ExpiresAt == nil || payment.CapturedAt != nil {
		return false
	}
	if transferTime.IsZero() {
		return false
	}
	return !transferTime.UTC().After(payment.ExpiresAt.UTC())
}

func (s *PaymentService) FailExpiredPayments(ctx context.Context, batchSize int) (int, error) {
	if s.gatewayActive == "" {
		return 0, nil
	}
	ids, err := s.repo.FindExpiredPendingPaymentIDs(ctx, s.gatewayActive, batchSize)
	if err != nil {
		return 0, err
	}
	failed := 0
	for _, id := range ids {
		ok, err := s.failExpiredPayment(ctx, id)
		if err != nil {
			return failed, err
		}
		if ok {
			failed++
		}
	}
	return failed, nil
}

func (s *PaymentService) failExpiredPayment(ctx context.Context, paymentID string) (bool, error) {
	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)

	payment, err := s.repo.FindPaymentByIDForUpdate(ctx, tx, paymentID)
	if err != nil {
		return false, err
	}
	if payment == nil || payment.ExpiresAt == nil || time.Now().UTC().Before(payment.ExpiresAt.UTC()) {
		return false, tx.Commit(ctx)
	}
	if payment.Status != domain.PaymentStatusPending && payment.Status != domain.PaymentStatusRequiresAction {
		return false, tx.Commit(ctx)
	}
	if err := assertCanTransition(payment.Status, domain.PaymentStatusFailed); err != nil {
		return false, err
	}

	previousStatus := payment.Status
	updatedPayment := *payment
	updatedPayment.Status = domain.PaymentStatusFailed
	updatedPayment, err = s.repo.SavePayment(ctx, tx, updatedPayment)
	if err != nil {
		return false, err
	}
	systemActor := domain.UserContext{UserID: systemActorID, Email: "system@payment.local", Role: domain.RoleSupport}
	if err := s.repo.CreatePaymentStatusHistory(ctx, tx, repository.CreatePaymentStatusHistoryInput{
		PaymentID:     updatedPayment.ID,
		FromStatus:    &previousStatus,
		ToStatus:      domain.PaymentStatusFailed,
		ChangedBy:     systemActorID,
		ChangedByRole: domain.RoleSupport,
		Reason:        strPtr("Payment expired before capture"),
	}); err != nil {
		return false, err
	}
	if err := s.repo.CreatePaymentTransaction(ctx, tx, repository.CreatePaymentTransactionInput{
		PaymentID:       updatedPayment.ID,
		TransactionType: TransactionFailed,
		Amount:          updatedPayment.Amount,
		Currency:        updatedPayment.Currency,
		Status:          string(domain.PaymentStatusFailed),
		RequestID:       "payment-expiry-worker",
		RawPayload: map[string]any{
			"source":    "payment-expiry-worker",
			"expiresAt": valueOrTime(updatedPayment.ExpiresAt),
		},
	}); err != nil {
		return false, err
	}
	if err := s.repo.CreatePaymentAuditLog(ctx, tx, repository.CreatePaymentAuditLogInput{
		PaymentID: updatedPayment.ID,
		Action:    "PAYMENT_EXPIRED",
		ActorID:   systemActorID,
		ActorRole: domain.RoleSupport,
		RequestID: "payment-expiry-worker",
		Metadata: map[string]any{
			"fromStatus": previousStatus,
			"toStatus":   domain.PaymentStatusFailed,
			"expiresAt":  valueOrTime(updatedPayment.ExpiresAt),
		},
	}); err != nil {
		return false, err
	}
	if err := s.enqueueStatusEvent(ctx, tx, updatedPayment, systemActor, "payment-expiry-worker"); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

func (s *PaymentService) HandleOrderCreatedEvent(
	ctx context.Context,
	orderID, userID string,
	totalAmount float64,
	currency string,
	orderNumber *string,
	paymentMethod string,
	requestID string,
	eventID string,
	topic string,
	partition int,
	offset int64,
) error {
	if strings.TrimSpace(orderID) == "" || strings.TrimSpace(userID) == "" || strings.TrimSpace(currency) == "" {
		return nil
	}

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	alreadyProcessed, err := s.repo.TryMarkEventProcessed(ctx, tx, repository.ProcessedEventInput{
		EventID:     eventID,
		EventType:   "order.created",
		Topic:       topic,
		Partition:   partition,
		OffsetValue: offset,
	})
	if err != nil {
		return err
	}
	if alreadyProcessed {
		return tx.Commit(ctx)
	}
	if strings.TrimSpace(paymentMethod) != "" && !strings.EqualFold(paymentMethod, "ONLINE") {
		return tx.Commit(ctx)
	}

	existing, err := s.repo.FindPaymentByOrderIDForUpdate(ctx, tx, orderID)
	if err != nil {
		return err
	}
	if existing != nil {
		_ = tx.Commit(ctx)
		return nil
	}

	metadata := map[string]any{
		"source":      "order.events",
		"eventType":   "order.created",
		"autoCreated": true,
		"requestId":   requestID,
	}
	if orderNumber != nil {
		metadata["orderNumber"] = *orderNumber
	}

	payment, err := s.repo.CreatePayment(ctx, tx, repository.CreatePaymentInput{
		OrderID:        orderID,
		UserID:         userID,
		Provider:       s.gatewayActive,
		Status:         domain.PaymentStatusPending,
		Currency:       strings.ToUpper(currency),
		Amount:         roundMoney(totalAmount),
		RefundedAmount: 0,
		Description:    strPtr("Auto-created from order event"),
		Metadata:       metadata,
	})
	if err != nil {
		if repository.IsUniqueViolation(err) {
			_ = tx.Commit(ctx)
			return nil
		}
		return err
	}

	if err := s.repo.CreatePaymentStatusHistory(ctx, tx, repository.CreatePaymentStatusHistoryInput{
		PaymentID:     payment.ID,
		FromStatus:    nil,
		ToStatus:      domain.PaymentStatusPending,
		ChangedBy:     systemActorID,
		ChangedByRole: domain.RoleSuperAdmin,
		Reason:        strPtr("Auto-created from order.created event"),
	}); err != nil {
		return err
	}

	if err := s.repo.CreatePaymentAuditLog(ctx, tx, repository.CreatePaymentAuditLogInput{
		PaymentID: payment.ID,
		Action:    "PAYMENT_AUTO_CREATED_FROM_ORDER_EVENT",
		ActorID:   systemActorID,
		ActorRole: domain.RoleSuperAdmin,
		RequestID: requestID,
		Metadata: map[string]any{
			"orderId":        orderID,
			"orderNumber":    trimAndString(orderNumber),
			"source":         "order.events",
			"kafkaPartition": partition,
			"kafkaOffset":    offset,
		},
	}); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (s *PaymentService) resolvePaymentForWebhook(
	ctx context.Context,
	tx pgx.Tx,
	req PaymentWebhookRequest,
) (*domain.Payment, error) {
	if req.PaymentID != nil && strings.TrimSpace(*req.PaymentID) != "" {
		return s.repo.FindPaymentByIDForUpdate(ctx, tx, strings.TrimSpace(*req.PaymentID))
	}
	if req.OrderID != nil && strings.TrimSpace(*req.OrderID) != "" {
		return s.repo.FindPaymentByOrderIDForUpdate(ctx, tx, strings.TrimSpace(*req.OrderID))
	}
	if req.ProviderPaymentID != nil && strings.TrimSpace(*req.ProviderPaymentID) != "" {
		return s.repo.FindPaymentByProviderPaymentIDForUpdate(ctx, tx, strings.TrimSpace(*req.ProviderPaymentID))
	}
	if req.GatewayTransactionID != nil && strings.TrimSpace(*req.GatewayTransactionID) != "" {
		txn, err := s.repo.FindTransactionByGatewayTransactionID(ctx, strings.TrimSpace(*req.GatewayTransactionID))
		if err != nil {
			return nil, err
		}
		if txn != nil {
			return s.repo.FindPaymentByIDForUpdate(ctx, tx, txn.PaymentID)
		}
		return nil, nil
	}

	return nil, httpx.NewAppError(
		http.StatusBadRequest,
		domain.ErrorCodeBadRequest,
		"Webhook payload must include paymentId or orderId or providerPaymentId or gatewayTransactionId",
		nil,
	)
}

func (s *PaymentService) enqueueStatusEvent(ctx context.Context, tx pgx.Tx, payment domain.Payment, actor domain.UserContext, requestID string) error {
	eventType := mapStatusToEventType(payment.Status)
	if eventType == "" {
		return nil
	}
	return s.enqueuePaymentEvent(ctx, tx, eventType, payment, actor, requestID)
}

func (s *PaymentService) enqueuePaymentEvent(ctx context.Context, tx pgx.Tx, eventType string, payment domain.Payment, actor domain.UserContext, requestID string) error {
	return s.repo.InsertOutboxEvent(ctx, tx, repository.CreateOutboxEventInput{
		AggregateType: "payment",
		AggregateID:   payment.ID,
		EventType:     eventType,
		Payload: map[string]any{
			"paymentId":         payment.ID,
			"orderId":           payment.OrderID,
			"userId":            payment.UserID,
			"sellerId":          payment.SellerID,
			"provider":          payment.Provider,
			"providerPaymentId": payment.ProviderPaymentID,
			"status":            payment.Status,
			"amount":            payment.Amount,
			"refundedAmount":    payment.RefundedAmount,
			"currency":          payment.Currency,
			"metadata": map[string]any{
				"requestId":  requestID,
				"occurredAt": time.Now().UTC().Format(time.RFC3339Nano),
				"actorId":    actor.UserID,
				"actorRole":  actor.Role,
			},
		},
	})
}

func toPaymentResponse(payment domain.Payment, requiresActionURL *string) map[string]any {
	actionURLFromMetadata := ""
	if payment.Metadata != nil {
		if v, ok := payment.Metadata["requiresActionUrl"]; ok {
			if s, isString := v.(string); isString {
				actionURLFromMetadata = s
			}
		}
	}

	resp := map[string]any{
		"id":                payment.ID,
		"orderId":           payment.OrderID,
		"userId":            payment.UserID,
		"sellerId":          valueOrNil(payment.SellerID),
		"provider":          payment.Provider,
		"providerPaymentId": valueOrNil(payment.ProviderPaymentID),
		"status":            payment.Status,
		"currency":          payment.Currency,
		"amount":            payment.Amount,
		"refundedAmount":    payment.RefundedAmount,
		"refundableAmount":  roundMoney(maxFloat(payment.Amount-payment.RefundedAmount, 0)),
		"description":       valueOrNil(payment.Description),
		"metadata":          payment.Metadata,
		"expiresAt":         valueOrTime(payment.ExpiresAt),
		"capturedAt":        valueOrTime(payment.CapturedAt),
		"createdAt":         payment.CreatedAt.UTC().Format(time.RFC3339Nano),
		"updatedAt":         payment.UpdatedAt.UTC().Format(time.RFC3339Nano),
	}
	if payment.Metadata != nil {
		if instructions, ok := payment.Metadata["paymentInstructions"]; ok {
			resp["paymentInstructions"] = instructions
		}
	}

	resolvedActionURL := ""
	if requiresActionURL != nil {
		resolvedActionURL = strings.TrimSpace(*requiresActionURL)
	}
	if resolvedActionURL == "" {
		resolvedActionURL = actionURLFromMetadata
	}
	if resolvedActionURL != "" {
		resp["requiresActionUrl"] = resolvedActionURL
	}

	return resp
}

func toRefundResponse(refund domain.Refund) map[string]any {
	return map[string]any{
		"id":               refund.ID,
		"paymentId":        refund.PaymentID,
		"providerRefundId": valueOrNil(refund.ProviderRefundID),
		"amount":           refund.Amount,
		"currency":         refund.Currency,
		"status":           refund.Status,
		"reason":           valueOrNil(refund.Reason),
		"metadata":         refund.Metadata,
		"requestedBy":      refund.RequestedBy,
		"requestedByRole":  refund.RequestedByRole,
		"createdAt":        refund.CreatedAt.UTC().Format(time.RFC3339Nano),
		"updatedAt":        refund.UpdatedAt.UTC().Format(time.RFC3339Nano),
	}
}

func mapStatusToTransactionType(status domain.PaymentStatus) string {
	switch status {
	case domain.PaymentStatusRequiresAction:
		return TransactionRequiresAction
	case domain.PaymentStatusAuthorized:
		return TransactionAuthorized
	case domain.PaymentStatusCaptured:
		return TransactionCaptured
	case domain.PaymentStatusFailed:
		return TransactionFailed
	case domain.PaymentStatusCancelled:
		return TransactionCancelled
	case domain.PaymentStatusChargeback:
		return TransactionChargeback
	case domain.PaymentStatusPartiallyRefunded, domain.PaymentStatusRefunded:
		return TransactionRefundSucceeded
	default:
		return TransactionIntentCreated
	}
}

func mapStatusToEventType(status domain.PaymentStatus) string {
	switch status {
	case domain.PaymentStatusRequiresAction:
		return EventPaymentRequiresAction
	case domain.PaymentStatusAuthorized:
		return EventPaymentAuthorized
	case domain.PaymentStatusCaptured:
		return EventPaymentCaptured
	case domain.PaymentStatusFailed:
		return EventPaymentFailed
	case domain.PaymentStatusCancelled:
		return EventPaymentCancelled
	case domain.PaymentStatusPartiallyRefunded:
		return EventPaymentPartiallyRefunded
	case domain.PaymentStatusRefunded:
		return EventPaymentRefunded
	case domain.PaymentStatusChargeback:
		return EventPaymentChargeback
	default:
		return ""
	}
}

func assertCanReadPayment(user domain.UserContext, payment domain.Payment) error {
	if user.Role == domain.RoleCustomer && payment.UserID != user.UserID {
		return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Access denied for this payment", nil)
	}
	if user.Role == domain.RoleSeller {
		if payment.SellerID == nil || *payment.SellerID != user.UserID {
			return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Access denied for this payment", nil)
		}
	}
	return nil
}

func assertCanRefundPayment(user domain.UserContext, payment domain.Payment) error {
	if user.Role == domain.RoleCustomer {
		if payment.UserID != user.UserID {
			return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Access denied for this payment", nil)
		}
		return nil
	}

	if user.Role == domain.RoleAdmin || user.Role == domain.RoleSupport || user.Role == domain.RoleSuperAdmin {
		return nil
	}

	return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Not allowed to refund this payment", nil)
}

func assertRefundableStatus(status domain.PaymentStatus) error {
	if status != domain.PaymentStatusCaptured && status != domain.PaymentStatusPartiallyRefunded {
		return httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeInvalidPaymentStatusTransition, "Cannot refund payment in status "+string(status), nil)
	}
	return nil
}

func assertCanTransition(currentStatus, nextStatus domain.PaymentStatus) error {
	allowed := domain.PaymentStatusTransitions[currentStatus]
	if _, ok := allowed[nextStatus]; !ok {
		return httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeInvalidPaymentStatusTransition, "Cannot transition payment status from "+string(currentStatus)+" to "+string(nextStatus), nil)
	}
	return nil
}

func canReadPaymentRole(role domain.Role) bool {
	switch role {
	case domain.RoleCustomer, domain.RoleAdmin, domain.RoleSupport, domain.RoleWarehouse, domain.RoleSeller, domain.RoleSuperAdmin:
		return true
	default:
		return false
	}
}

func canAttachIntentToExistingPayment(payment domain.Payment) bool {
	if payment.Status != domain.PaymentStatusPending {
		return false
	}
	if payment.ProviderPaymentID != nil && strings.TrimSpace(*payment.ProviderPaymentID) != "" {
		return false
	}
	return isAutoCreatedPayment(payment.Metadata)
}

func isAutoCreatedPayment(metadata map[string]any) bool {
	if len(metadata) == 0 {
		return false
	}

	value, ok := metadata["autoCreated"]
	if !ok {
		return false
	}

	switch v := value.(type) {
	case bool:
		return v
	case string:
		return strings.EqualFold(strings.TrimSpace(v), "true")
	default:
		return false
	}
}

func isPayableOrderStatus(status string) bool {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "PENDING", "CONFIRMED":
		return true
	default:
		return false
	}
}

func hashWebhookPayload(provider string, req PaymentWebhookRequest) string {
	canonical := canonicalize(map[string]any{"provider": provider, "payload": req})
	sum := sha256.Sum256([]byte(canonical))
	return hex.EncodeToString(sum[:])
}

func hashRawWebhookPayload(provider string, rawBody []byte) string {
	sum := sha256.Sum256(append([]byte(provider+":"), rawBody...))
	return hex.EncodeToString(sum[:])
}

func (s *PaymentService) persistWebhookResult(
	ctx context.Context,
	tx pgx.Tx,
	provider string,
	providerEventID string,
	requestHash string,
	paymentID *string,
	responseBody map[string]any,
) error {
	statusCode := http.StatusOK
	expiresAt := time.Now().UTC().Add(time.Duration(s.webhookTTLMin) * time.Minute)
	return s.repo.UpsertWebhookIdempotencyRecord(ctx, tx, repository.WebhookIdempotencyRecord{
		Provider:        provider,
		ProviderEventID: providerEventID,
		RequestHash:     requestHash,
		PaymentID:       paymentID,
		ResponseStatus:  &statusCode,
		ResponseBody:    responseBody,
		ExpiresAt:       expiresAt,
	})
}

func canonicalize(v any) string {
	if v == nil {
		return "null"
	}

	switch x := v.(type) {
	case string:
		b, _ := json.Marshal(x)
		return string(b)
	case bool:
		if x {
			return "true"
		}
		return "false"
	case float64, float32, int, int32, int64, uint, uint32, uint64:
		b, _ := json.Marshal(x)
		return string(b)
	case []any:
		parts := make([]string, 0, len(x))
		for _, item := range x {
			parts = append(parts, canonicalize(item))
		}
		return "[" + strings.Join(parts, ",") + "]"
	case map[string]any:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		parts := make([]string, 0, len(keys))
		for _, k := range keys {
			parts = append(parts, canonicalize(k)+":"+canonicalize(x[k]))
		}
		return "{" + strings.Join(parts, ",") + "}"
	default:
		b, _ := json.Marshal(x)
		var mapValue map[string]any
		if err := json.Unmarshal(b, &mapValue); err == nil {
			return canonicalize(mapValue)
		}
		return string(b)
	}
}

func totalPages(totalItems, pageSize int) int {
	if pageSize <= 0 {
		return 0
	}
	if totalItems == 0 {
		return 0
	}
	pages := totalItems / pageSize
	if totalItems%pageSize != 0 {
		pages++
	}
	return pages
}

func roundMoney(value float64) float64 {
	if value < 0 {
		value = 0
	}
	return float64(int64((value+0.0000001)*100+0.5)) / 100
}

func valueOrNil(v *string) any {
	if v == nil {
		return nil
	}
	return *v
}

func valueOrTime(v *time.Time) any {
	if v == nil {
		return nil
	}
	return v.UTC().Format(time.RFC3339Nano)
}

func paymentInstructionsToMap(instructions PaymentInstructions) map[string]any {
	return map[string]any{
		"type":                instructions.Type,
		"paymentCode":         instructions.PaymentCode,
		"qrImageUrl":          instructions.QRImageURL,
		"bankCode":            instructions.BankCode,
		"accountNumber":       instructions.AccountNumber,
		"accountName":         instructions.AccountName,
		"amount":              instructions.Amount,
		"currency":            instructions.Currency,
		"transferDescription": instructions.TransferDescription,
		"expiresAt":           instructions.ExpiresAt.UTC().Format(time.RFC3339Nano),
	}
}

func strPtr(v string) *string {
	vv := strings.TrimSpace(v)
	if vv == "" {
		return nil
	}
	return &vv
}

func trimAndNilIfEmpty(v *string) *string {
	if v == nil {
		return nil
	}
	t := strings.TrimSpace(*v)
	if t == "" {
		return nil
	}
	return &t
}

func trimAndString(v *string) any {
	if v == nil {
		return nil
	}
	t := strings.TrimSpace(*v)
	if t == "" {
		return nil
	}
	return t
}

func trimOrDefault(v *string, fallback string) string {
	if v == nil {
		return fallback
	}
	t := strings.TrimSpace(*v)
	if t == "" {
		return fallback
	}
	return t
}

func coalesceMap(primary, fallback map[string]any) map[string]any {
	if primary != nil {
		return primary
	}
	if fallback != nil {
		return fallback
	}
	return nil
}

func maxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}
