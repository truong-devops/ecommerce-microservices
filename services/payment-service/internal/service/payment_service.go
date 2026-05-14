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
	webhookTTLMin int
}

func NewPaymentService(
	repo *repository.PaymentRepository,
	idempotency *IdempotencyService,
	gateway PaymentGateway,
	orderClient *OrderClient,
	gatewayActive string,
	webhookTTLMin int,
) *PaymentService {
	return &PaymentService{
		repo:          repo,
		idempotency:   idempotency,
		gateway:       gateway,
		orderClient:   orderClient,
		gatewayActive: strings.ToLower(strings.TrimSpace(gatewayActive)),
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
	if len(metadata) == 0 {
		metadata = nil
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

	updatedPayment := *payment
	systemActor := domain.UserContext{UserID: systemActorID, Email: "system@payment.local", Role: domain.RoleSupport}

	if payment.Status != parsedWebhook.Status {
		if err := assertCanTransition(payment.Status, parsedWebhook.Status); err != nil {
			return nil, 0, err
		}

		previousStatus := payment.Status
		updatedPayment.Status = parsedWebhook.Status
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

func (s *PaymentService) HandleOrderCreatedEvent(
	ctx context.Context,
	orderID, userID string,
	totalAmount float64,
	currency string,
	orderNumber *string,
	requestID string,
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
		"createdAt":         payment.CreatedAt.UTC().Format(time.RFC3339Nano),
		"updatedAt":         payment.UpdatedAt.UTC().Format(time.RFC3339Nano),
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
