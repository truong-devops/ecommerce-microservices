package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"shipping-service/internal/domain"
	"shipping-service/internal/httpx"
	"shipping-service/internal/repository"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const systemActorID = "00000000-0000-0000-0000-000000000000"

var (
	currencyRegex = regexp.MustCompile(`^[A-Z]{3}$`)
)

type CreateShipmentRequest struct {
	OrderID          string         `json:"orderId"`
	BuyerID          string         `json:"buyerId"`
	SellerID         string         `json:"sellerId"`
	Provider         string         `json:"provider"`
	Currency         string         `json:"currency"`
	ShippingFee      *NumberLike    `json:"shippingFee,omitempty"`
	CODAmount        *NumberLike    `json:"codAmount,omitempty"`
	RecipientName    string         `json:"recipientName"`
	RecipientPhone   string         `json:"recipientPhone"`
	RecipientAddress string         `json:"recipientAddress"`
	AWB              *string        `json:"awb,omitempty"`
	TrackingNumber   *string        `json:"trackingNumber,omitempty"`
	Note             *string        `json:"note,omitempty"`
	Metadata         map[string]any `json:"metadata,omitempty"`
}

type ListShipmentsRequest struct {
	Page      int
	PageSize  int
	Status    *domain.ShipmentStatus
	Provider  *string
	OrderID   *string
	BuyerID   *string
	SellerID  *string
	Search    *string
	SortBy    string
	SortOrder string
}

type UpdateShipmentStatusRequest struct {
	Status domain.ShipmentStatus `json:"status"`
	Reason *string               `json:"reason,omitempty"`
}

type CreateTrackingEventRequest struct {
	Status      domain.ShipmentStatus `json:"status"`
	EventCode   *string               `json:"eventCode,omitempty"`
	Description *string               `json:"description,omitempty"`
	Location    *string               `json:"location,omitempty"`
	OccurredAt  *string               `json:"occurredAt,omitempty"`
	RawPayload  map[string]any        `json:"rawPayload,omitempty"`
}

type ShippingWebhookRequest struct {
	ProviderEventID string                `json:"providerEventId"`
	OrderID         *string               `json:"orderId,omitempty"`
	AWB             *string               `json:"awb,omitempty"`
	TrackingNumber  *string               `json:"trackingNumber,omitempty"`
	Status          domain.ShipmentStatus `json:"status"`
	OccurredAt      *string               `json:"occurredAt,omitempty"`
	EventCode       *string               `json:"eventCode,omitempty"`
	Description     *string               `json:"description,omitempty"`
	Location        *string               `json:"location,omitempty"`
	RawPayload      map[string]any        `json:"rawPayload,omitempty"`
}

type ShippingService struct {
	repo                        *repository.ShippingRepository
	orderClient                 *OrderClient
	webhookSigningSecret        string
	webhookIdempotencyTTLMinute int
	nexus                       NexusIntegration
}

type NumberLike struct {
	Value   float64
	Invalid bool
}

func (n *NumberLike) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		return nil
	}

	var asNumber float64
	if err := json.Unmarshal(data, &asNumber); err == nil {
		if math.IsNaN(asNumber) || math.IsInf(asNumber, 0) {
			return errors.New("invalid number")
		}
		n.Value = asNumber
		return nil
	}

	var asString string
	if err := json.Unmarshal(data, &asString); err == nil {
		trimmed := strings.TrimSpace(asString)
		if trimmed == "" {
			n.Value = 0
			return nil
		}
		parsed, parseErr := strconv.ParseFloat(trimmed, 64)
		if parseErr != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
			n.Invalid = true
			n.Value = 0
			return nil
		}
		n.Value = parsed
		return nil
	}

	n.Invalid = true
	n.Value = 0
	return nil
}

func NewShippingService(repo *repository.ShippingRepository, orderClient *OrderClient, webhookSigningSecret string, webhookIdempotencyTTLMinute int, integrations ...NexusIntegration) *ShippingService {
	svc := &ShippingService{
		repo:                        repo,
		orderClient:                 orderClient,
		webhookSigningSecret:        strings.TrimSpace(webhookSigningSecret),
		webhookIdempotencyTTLMinute: webhookIdempotencyTTLMinute,
	}
	if len(integrations) > 0 {
		svc.nexus = integrations[0]
	}
	return svc
}

func (s *ShippingService) CreateShipment(ctx context.Context, user domain.UserContext, accessToken, requestID string, req CreateShipmentRequest) (map[string]any, error) {
	if err := requireStaff(user); err != nil {
		return nil, err
	}
	if err := validateCreateShipmentRequest(req); err != nil {
		return nil, err
	}
	if s.orderClient == nil {
		return nil, httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Order service dependency is unavailable", nil)
	}

	orderSnapshot, err := s.orderClient.GetOrderByID(ctx, req.OrderID, accessToken)
	if err != nil {
		return nil, err
	}
	if orderSnapshot.UserID != req.BuyerID {
		return nil, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, "buyerId does not match order owner", nil)
	}
	if orderSnapshot.Currency != strings.ToUpper(strings.TrimSpace(req.Currency)) {
		return nil, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, "shipment currency does not match order currency", nil)
	}
	if !isOrderEligibleForShipment(orderSnapshot.Status) {
		return nil, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeValidationFailed, "order status is not eligible for shipment creation", map[string]any{"status": orderSnapshot.Status})
	}

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	existing, err := s.repo.FindShipmentByOrderID(ctx, req.OrderID, tx)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeConflict, "Shipment already exists for this order", nil)
	}

	shippingFee := roundMoney(derefNumberLike(req.ShippingFee, 0))
	codAmount := roundMoney(derefNumberLike(req.CODAmount, 0))

	shipment, err := s.repo.CreateShipment(ctx, tx, repository.CreateShipmentInput{
		OrderID:          req.OrderID,
		BuyerID:          req.BuyerID,
		SellerID:         req.SellerID,
		Provider:         req.Provider,
		AWB:              req.AWB,
		TrackingNumber:   req.TrackingNumber,
		Status:           domain.ShipmentStatusPending,
		Currency:         strings.ToUpper(req.Currency),
		ShippingFee:      shippingFee,
		CODAmount:        codAmount,
		RecipientName:    req.RecipientName,
		RecipientPhone:   req.RecipientPhone,
		RecipientAddress: req.RecipientAddress,
		Note:             req.Note,
		Metadata:         req.Metadata,
	})
	if err != nil {
		return nil, err
	}

	if err := s.repo.InsertStatusHistory(ctx, tx, repository.CreateStatusHistoryInput{
		ShipmentID:    shipment.ID,
		FromStatus:    nil,
		ToStatus:      domain.ShipmentStatusPending,
		ChangedBy:     user.UserID,
		ChangedByRole: user.Role,
		Reason:        strPtr("Shipment created"),
	}); err != nil {
		return nil, err
	}

	if err := s.repo.InsertAuditLog(ctx, tx, repository.CreateAuditLogInput{
		ShipmentID: shipment.ID,
		Action:     "SHIPMENT_CREATED",
		ActorID:    user.UserID,
		ActorRole:  user.Role,
		RequestID:  requestID,
		Metadata: map[string]any{
			"orderId":  shipment.OrderID,
			"provider": shipment.Provider,
		},
	}); err != nil {
		return nil, err
	}

	if err := s.enqueueShipmentEvent(ctx, tx, domain.EventShipmentCreated, shipment, user, requestID); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return shipmentResponse(shipment), nil
}

func (s *ShippingService) ListShipments(ctx context.Context, user domain.UserContext, req ListShipmentsRequest) (map[string]any, error) {
	if req.Page < 1 {
		req.Page = 1
	}
	if req.PageSize < 1 {
		req.PageSize = 20
	}
	if req.PageSize > 100 {
		return nil, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "pageSize must be <= 100", nil)
	}

	if user.Role == domain.RoleCustomer {
		req.BuyerID = &user.UserID
	}
	if user.Role == domain.RoleSeller {
		req.SellerID = &user.UserID
	}

	items, totalItems, err := s.repo.ListShipments(ctx, repository.ListShipmentsQuery{
		Page:      req.Page,
		PageSize:  req.PageSize,
		Status:    req.Status,
		Provider:  req.Provider,
		OrderID:   req.OrderID,
		BuyerID:   req.BuyerID,
		SellerID:  req.SellerID,
		Search:    req.Search,
		SortBy:    req.SortBy,
		SortOrder: req.SortOrder,
	})
	if err != nil {
		return nil, err
	}

	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, shipmentResponse(item))
	}

	totalPages := 0
	if req.PageSize > 0 {
		totalPages = int(math.Ceil(float64(totalItems) / float64(req.PageSize)))
	}

	return map[string]any{
		"items": out,
		"pagination": map[string]any{
			"page":       req.Page,
			"pageSize":   req.PageSize,
			"totalItems": totalItems,
			"totalPages": totalPages,
		},
	}, nil
}

func (s *ShippingService) GetShipmentByID(ctx context.Context, user domain.UserContext, shipmentID string) (map[string]any, error) {
	shipment, err := s.repo.FindShipmentByID(ctx, shipmentID)
	if err != nil {
		return nil, err
	}
	if shipment == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Shipment not found", nil)
	}

	if err := ensureCanRead(user, *shipment); err != nil {
		return nil, err
	}

	return shipmentResponse(*shipment), nil
}

func (s *ShippingService) GetShipmentByOrderID(ctx context.Context, user domain.UserContext, orderID string) (map[string]any, error) {
	shipment, err := s.repo.FindShipmentByOrderID(ctx, orderID, nil)
	if err != nil {
		return nil, err
	}
	if shipment == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Shipment not found", nil)
	}
	if err := ensureCanRead(user, *shipment); err != nil {
		return nil, err
	}
	return shipmentResponse(*shipment), nil
}

func (s *ShippingService) UpdateShipmentStatus(ctx context.Context, user domain.UserContext, requestID, shipmentID string, req UpdateShipmentStatusRequest) (map[string]any, error) {
	if err := requireStaff(user); err != nil {
		return nil, err
	}
	if !domain.IsValidShipmentStatus(req.Status) {
		return nil, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "status must be one of the following values: PENDING, AWB_CREATED, PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, CANCELLED, FAILED, RETURNED", nil)
	}
	if req.Reason != nil && len(strings.TrimSpace(*req.Reason)) > 500 {
		return nil, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "reason length must be <= 500", nil)
	}

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	shipment, err := s.repo.FindShipmentByIDForUpdate(ctx, tx, shipmentID)
	if err != nil {
		return nil, err
	}
	if shipment == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Shipment not found", nil)
	}
	if err := ensureCanRead(user, *shipment); err != nil {
		return nil, err
	}

	if shipment.Status == req.Status {
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return shipmentResponse(*shipment), nil
	}

	if err := ensureTransition(shipment.Status, req.Status); err != nil {
		return nil, err
	}

	previous := shipment.Status
	updatedShipment, err := s.repo.UpdateShipmentStatus(ctx, tx, shipment.ID, req.Status)
	if err != nil {
		return nil, err
	}

	if err := s.repo.InsertStatusHistory(ctx, tx, repository.CreateStatusHistoryInput{
		ShipmentID:    updatedShipment.ID,
		FromStatus:    &previous,
		ToStatus:      updatedShipment.Status,
		ChangedBy:     user.UserID,
		ChangedByRole: user.Role,
		Reason:        trimStringPtr(req.Reason),
	}); err != nil {
		return nil, err
	}

	desc := trimStringPtr(req.Reason)
	if desc == nil {
		desc = strPtr("Status updated manually")
	}
	if _, err := s.repo.CreateTrackingEvent(ctx, tx, repository.CreateTrackingEventInput{
		ShipmentID:  updatedShipment.ID,
		Status:      updatedShipment.Status,
		EventCode:   nil,
		Description: desc,
		Location:    nil,
		OccurredAt:  time.Now().UTC(),
		RawPayload:  nil,
	}); err != nil {
		return nil, err
	}

	if err := s.repo.InsertAuditLog(ctx, tx, repository.CreateAuditLogInput{
		ShipmentID: updatedShipment.ID,
		Action:     "SHIPMENT_STATUS_UPDATED",
		ActorID:    user.UserID,
		ActorRole:  user.Role,
		RequestID:  requestID,
		Metadata: map[string]any{
			"fromStatus": previous,
			"toStatus":   updatedShipment.Status,
			"reason":     trimStringPtr(req.Reason),
		},
	}); err != nil {
		return nil, err
	}

	if err := s.enqueueShipmentEvent(ctx, tx, domain.EventShipmentStatusUpdated, updatedShipment, user, requestID); err != nil {
		return nil, err
	}
	if err := s.enqueueTerminalStatusEvent(ctx, tx, updatedShipment, user, requestID); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return shipmentResponse(updatedShipment), nil
}

func (s *ShippingService) AddTrackingEvent(ctx context.Context, user domain.UserContext, requestID, shipmentID string, req CreateTrackingEventRequest) (map[string]any, error) {
	if err := requireStaff(user); err != nil {
		return nil, err
	}
	if !domain.IsValidShipmentStatus(req.Status) {
		return nil, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "invalid status", nil)
	}

	eventCode := trimStringPtr(req.EventCode)
	if eventCode != nil && len(*eventCode) > 64 {
		return nil, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "eventCode length must be <= 64", nil)
	}
	description := trimStringPtr(req.Description)
	if description != nil && len(*description) > 500 {
		return nil, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "description length must be <= 500", nil)
	}
	location := trimStringPtr(req.Location)
	if location != nil && len(*location) > 255 {
		return nil, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "location length must be <= 255", nil)
	}

	occurredAt := time.Now().UTC()
	if req.OccurredAt != nil && strings.TrimSpace(*req.OccurredAt) != "" {
		parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(*req.OccurredAt))
		if err != nil {
			return nil, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "occurredAt must be a valid ISO 8601 date string", nil)
		}
		occurredAt = parsed.UTC()
	}

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	shipment, err := s.repo.FindShipmentByIDForUpdate(ctx, tx, shipmentID)
	if err != nil {
		return nil, err
	}
	if shipment == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Shipment not found", nil)
	}
	if err := ensureCanRead(user, *shipment); err != nil {
		return nil, err
	}

	updatedShipment := *shipment
	if shipment.Status != req.Status {
		if err := ensureTransition(shipment.Status, req.Status); err != nil {
			return nil, err
		}

		previous := shipment.Status
		updatedShipment, err = s.repo.UpdateShipmentStatus(ctx, tx, shipment.ID, req.Status)
		if err != nil {
			return nil, err
		}
		if err := s.repo.InsertStatusHistory(ctx, tx, repository.CreateStatusHistoryInput{
			ShipmentID:    updatedShipment.ID,
			FromStatus:    &previous,
			ToStatus:      updatedShipment.Status,
			ChangedBy:     user.UserID,
			ChangedByRole: user.Role,
			Reason:        description,
		}); err != nil {
			return nil, err
		}

		if err := s.enqueueShipmentEvent(ctx, tx, domain.EventShipmentStatusUpdated, updatedShipment, user, requestID); err != nil {
			return nil, err
		}
		if err := s.enqueueTerminalStatusEvent(ctx, tx, updatedShipment, user, requestID); err != nil {
			return nil, err
		}
	}

	trackingEvent, err := s.repo.CreateTrackingEvent(ctx, tx, repository.CreateTrackingEventInput{
		ShipmentID:  updatedShipment.ID,
		Status:      req.Status,
		EventCode:   eventCode,
		Description: description,
		Location:    location,
		OccurredAt:  occurredAt,
		RawPayload:  req.RawPayload,
	})
	if err != nil {
		return nil, err
	}

	if err := s.repo.InsertAuditLog(ctx, tx, repository.CreateAuditLogInput{
		ShipmentID: updatedShipment.ID,
		Action:     "SHIPMENT_TRACKING_EVENT_ADDED",
		ActorID:    user.UserID,
		ActorRole:  user.Role,
		RequestID:  requestID,
		Metadata: map[string]any{
			"trackingEventId": trackingEvent.ID,
			"status":          trackingEvent.Status,
			"eventCode":       trackingEvent.EventCode,
		},
	}); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return map[string]any{
		"shipment":      shipmentResponse(updatedShipment),
		"trackingEvent": trackingEventResponse(trackingEvent),
	}, nil
}

func (s *ShippingService) GetTrackingEvents(ctx context.Context, user domain.UserContext, shipmentID string) (map[string]any, error) {
	shipment, err := s.repo.FindShipmentByID(ctx, shipmentID)
	if err != nil {
		return nil, err
	}
	if shipment == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Shipment not found", nil)
	}
	if err := ensureCanRead(user, *shipment); err != nil {
		return nil, err
	}

	events, err := s.repo.ListTrackingEvents(ctx, shipmentID)
	if err != nil {
		return nil, err
	}

	out := make([]any, 0, len(events))
	for _, e := range events {
		out = append(out, trackingEventResponse(e))
	}

	return map[string]any{
		"shipmentId": shipmentID,
		"events":     out,
	}, nil
}

func (s *ShippingService) HandleProviderWebhook(ctx context.Context, requestID, provider, signature string, req ShippingWebhookRequest) (map[string]any, error) {
	normalizedProvider := strings.ToLower(strings.TrimSpace(provider))
	if normalizedProvider == "" {
		return nil, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "Invalid provider", nil)
	}
	if err := validateWebhookRequest(req); err != nil {
		return nil, err
	}
	if err := s.verifyWebhookSignature(normalizedProvider, signature, req); err != nil {
		return nil, err
	}

	requestHash := hashWebhookPayload(normalizedProvider, req)
	existingRecord, err := s.repo.FindUnexpiredWebhookRecord(ctx, normalizedProvider, req.ProviderEventID)
	if err != nil {
		return nil, err
	}
	if existingRecord != nil {
		if existingRecord.RequestHash != "" && existingRecord.RequestHash != requestHash {
			return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeWebhookIdempotencyConflict, "Webhook event id already exists with different payload", nil)
		}
		if existingRecord.ResponseBody != nil {
			return existingRecord.ResponseBody, nil
		}
	}

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	shipment, err := s.resolveShipmentForWebhook(ctx, tx, req)
	if err != nil {
		return nil, err
	}
	if shipment == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeNotFound, "Shipment not found for webhook payload", nil)
	}

	systemActor := domain.UserContext{UserID: systemActorID, Email: "system@shipping.local", Role: domain.RoleSupport}
	updatedShipment := *shipment
	if shipment.Status != req.Status {
		if err := ensureTransition(shipment.Status, req.Status); err != nil {
			return nil, err
		}
		previous := shipment.Status
		updatedShipment, err = s.repo.UpdateShipmentStatus(ctx, tx, shipment.ID, req.Status)
		if err != nil {
			return nil, err
		}

		reason := trimStringPtr(req.Description)
		if reason == nil {
			reason = strPtr(fmt.Sprintf("Webhook status sync from provider %s", normalizedProvider))
		}
		if err := s.repo.InsertStatusHistory(ctx, tx, repository.CreateStatusHistoryInput{
			ShipmentID:    updatedShipment.ID,
			FromStatus:    &previous,
			ToStatus:      updatedShipment.Status,
			ChangedBy:     systemActorID,
			ChangedByRole: domain.RoleSupport,
			Reason:        reason,
		}); err != nil {
			return nil, err
		}

		if err := s.enqueueShipmentEvent(ctx, tx, domain.EventShipmentStatusUpdated, updatedShipment, systemActor, requestID); err != nil {
			return nil, err
		}
		if err := s.enqueueTerminalStatusEvent(ctx, tx, updatedShipment, systemActor, requestID); err != nil {
			return nil, err
		}
	}

	occurredAt := time.Now().UTC()
	if req.OccurredAt != nil && strings.TrimSpace(*req.OccurredAt) != "" {
		parsed, parseErr := time.Parse(time.RFC3339, strings.TrimSpace(*req.OccurredAt))
		if parseErr == nil {
			occurredAt = parsed.UTC()
		}
	}

	trackingEvent, err := s.repo.CreateTrackingEvent(ctx, tx, repository.CreateTrackingEventInput{
		ShipmentID:  updatedShipment.ID,
		Status:      req.Status,
		EventCode:   trimStringPtr(req.EventCode),
		Description: trimStringPtr(req.Description),
		Location:    trimStringPtr(req.Location),
		OccurredAt:  occurredAt,
		RawPayload:  req.RawPayload,
	})
	if err != nil {
		return nil, err
	}

	if err := s.repo.InsertAuditLog(ctx, tx, repository.CreateAuditLogInput{
		ShipmentID: updatedShipment.ID,
		Action:     "PROVIDER_WEBHOOK_RECEIVED",
		ActorID:    systemActorID,
		ActorRole:  domain.RoleSupport,
		RequestID:  requestID,
		Metadata: map[string]any{
			"provider":        normalizedProvider,
			"providerEventId": req.ProviderEventID,
			"eventCode":       trimStringPtr(req.EventCode),
			"status":          req.Status,
		},
	}); err != nil {
		return nil, err
	}

	responseBody := map[string]any{
		"processed":     true,
		"provider":      normalizedProvider,
		"shipment":      shipmentResponse(updatedShipment),
		"trackingEvent": trackingEventResponse(trackingEvent),
	}

	expiresAt := time.Now().UTC().Add(time.Duration(s.webhookIdempotencyTTLMinute) * time.Minute)
	statusOK := http.StatusOK
	if err := s.repo.InsertWebhookRecord(ctx, tx, repository.CreateWebhookIdempotencyInput{
		Provider:        normalizedProvider,
		ProviderEventID: req.ProviderEventID,
		RequestHash:     requestHash,
		ShipmentID:      &updatedShipment.ID,
		ResponseStatus:  &statusOK,
		ResponseBody:    responseBody,
		ExpiresAt:       expiresAt,
	}); err != nil {
		if s.repo.IsUniqueViolation(err) {
			persisted, findErr := s.repo.FindWebhookRecord(ctx, normalizedProvider, req.ProviderEventID)
			if findErr == nil && persisted != nil && persisted.RequestHash == requestHash && persisted.ResponseBody != nil {
				return persisted.ResponseBody, nil
			}
			return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeWebhookIdempotencyConflict, "Webhook event id already exists with different payload", nil)
		}
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return responseBody, nil
}

func (s *ShippingService) AutoCreateShipmentFromConfirmedOrderEvent(ctx context.Context, requestID string, payload map[string]any, kafkaPartition int, kafkaOffset string) error {
	orderID := asString(payload["orderId"])
	buyerID := asString(payload["userId"])
	sellerID := asString(payload["sellerId"])
	recipientName := asString(payload["recipientName"])
	recipientPhone := asString(payload["recipientPhone"])
	recipientAddress := asString(payload["recipientAddress"])
	orderNumber := asString(payload["orderNumber"])
	currency := strings.ToUpper(asString(payload["currency"]))
	shippingFee := asNonNegativeNumber(payload["shippingAmount"])
	if shippingFee == nil {
		shippingFee = ptrFloat(0)
	}
	paymentMethod := strings.ToUpper(asString(payload["paymentMethod"]))
	totalAmount := asNonNegativeNumber(payload["totalAmount"])
	codAmount := codAmountForPaymentMethod(paymentMethod, totalAmount)

	// Skip auto-create when critical shipment fields are missing to avoid persisting placeholder data.
	if !isUUIDStrict(orderID) || !isUUIDStrict(buyerID) || !isUUIDStrict(sellerID) || !currencyRegex.MatchString(currency) {
		return nil
	}
	if !inLen(recipientName, 1, 255) || !inLen(recipientPhone, 1, 32) || !inLen(recipientAddress, 1, 500) {
		return nil
	}

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	existing, err := s.repo.FindShipmentByOrderID(ctx, orderID, tx)
	if err != nil {
		return err
	}
	if existing != nil {
		return tx.Commit(ctx)
	}
	provider := "order-event-auto"
	sendToNexus := s.nexusOutboundEnabledForSeller(sellerID)
	if sendToNexus {
		provider = "NEXUS"
	}

	shipment, err := s.repo.CreateShipment(ctx, tx, repository.CreateShipmentInput{
		OrderID:          orderID,
		BuyerID:          buyerID,
		SellerID:         sellerID,
		Provider:         provider,
		AWB:              nil,
		TrackingNumber:   nil,
		Status:           domain.ShipmentStatusPending,
		Currency:         currency,
		ShippingFee:      roundMoney(*shippingFee),
		CODAmount:        roundMoney(codAmount),
		RecipientName:    recipientName,
		RecipientPhone:   recipientPhone,
		RecipientAddress: recipientAddress,
		Note:             trimStringPtr(strPtr(asString(payload["note"]))),
		Metadata: map[string]any{
			"source":      "order.events",
			"eventType":   "order.status-updated",
			"autoCreated": true,
			"orderNumber": orderNumber,
			"requestId":   requestID,
		},
	})
	if err != nil {
		if s.repo.IsUniqueViolation(err) {
			return nil
		}
		return err
	}

	if err := s.repo.InsertStatusHistory(ctx, tx, repository.CreateStatusHistoryInput{
		ShipmentID:    shipment.ID,
		FromStatus:    nil,
		ToStatus:      domain.ShipmentStatusPending,
		ChangedBy:     systemActorID,
		ChangedByRole: domain.RoleSuperAdmin,
		Reason:        strPtr("Auto-created from confirmed order event"),
	}); err != nil {
		return err
	}

	if err := s.repo.InsertAuditLog(ctx, tx, repository.CreateAuditLogInput{
		ShipmentID: shipment.ID,
		Action:     "SHIPMENT_AUTO_CREATED_FROM_ORDER_EVENT",
		ActorID:    systemActorID,
		ActorRole:  domain.RoleSuperAdmin,
		RequestID:  requestID,
		Metadata: map[string]any{
			"orderId":        orderID,
			"orderNumber":    orderNumber,
			"source":         "order.events",
			"kafkaPartition": kafkaPartition,
			"kafkaOffset":    kafkaOffset,
		},
	}); err != nil {
		return err
	}

	if err := s.enqueueShipmentEvent(ctx, tx, domain.EventShipmentCreated, shipment, domain.UserContext{UserID: systemActorID, Role: domain.RoleSuperAdmin}, requestID); err != nil {
		return err
	}
	if sendToNexus {
		if err := s.enqueueNexusCreateOrder(ctx, tx, shipment, payload); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (s *ShippingService) nexusOutboundEnabledForSeller(sellerID string) bool {
	if !s.nexus.Enabled {
		return false
	}
	_, mapped := s.nexus.Mappings[strings.TrimSpace(sellerID)]
	return mapped
}

func (s *ShippingService) resolveShipmentForWebhook(ctx context.Context, tx pgx.Tx, req ShippingWebhookRequest) (*domain.Shipment, error) {
	if req.OrderID != nil && strings.TrimSpace(*req.OrderID) != "" {
		return s.repo.FindShipmentByOrderID(ctx, strings.TrimSpace(*req.OrderID), tx)
	}
	if req.AWB != nil && strings.TrimSpace(*req.AWB) != "" {
		return s.repo.FindShipmentByAWB(ctx, strings.TrimSpace(*req.AWB), tx)
	}
	if req.TrackingNumber != nil && strings.TrimSpace(*req.TrackingNumber) != "" {
		return s.repo.FindShipmentByTrackingNumber(ctx, strings.TrimSpace(*req.TrackingNumber), tx)
	}
	return nil, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "Webhook payload must include orderId or awb or trackingNumber", nil)
}

func (s *ShippingService) enqueueTerminalStatusEvent(ctx context.Context, tx pgx.Tx, shipment domain.Shipment, actor domain.UserContext, requestID string) error {
	switch shipment.Status {
	case domain.ShipmentStatusDelivered:
		return s.enqueueShipmentEvent(ctx, tx, domain.EventShipmentDelivered, shipment, actor, requestID)
	case domain.ShipmentStatusFailed:
		return s.enqueueShipmentEvent(ctx, tx, domain.EventShipmentFailed, shipment, actor, requestID)
	case domain.ShipmentStatusCancelled:
		return s.enqueueShipmentEvent(ctx, tx, domain.EventShipmentCancelled, shipment, actor, requestID)
	default:
		return nil
	}
}

func (s *ShippingService) enqueueShipmentEvent(ctx context.Context, tx pgx.Tx, eventType string, shipment domain.Shipment, actor domain.UserContext, requestID string) error {
	payload := map[string]any{
		"shipmentId":     shipment.ID,
		"orderId":        shipment.OrderID,
		"buyerId":        shipment.BuyerID,
		"sellerId":       shipment.SellerID,
		"provider":       shipment.Provider,
		"status":         shipment.Status,
		"awb":            shipment.AWB,
		"trackingNumber": shipment.TrackingNumber,
		"shippingFee":    shipment.ShippingFee,
		"codAmount":      shipment.CODAmount,
		"currency":       shipment.Currency,
		"metadata": map[string]any{
			"requestId":  requestID,
			"occurredAt": time.Now().UTC().Format(time.RFC3339Nano),
			"actorId":    actor.UserID,
			"actorRole":  actor.Role,
		},
	}

	return s.repo.InsertOutboxEvent(ctx, tx, repository.CreateOutboxEventInput{
		AggregateType: "shipment",
		AggregateID:   shipment.ID,
		EventType:     eventType,
		Payload:       payload,
	})
}

func validateCreateShipmentRequest(req CreateShipmentRequest) error {
	if !isUUIDStrict(req.OrderID) || !isUUIDStrict(req.BuyerID) || !isUUIDStrict(req.SellerID) {
		return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "orderId must be a UUID, buyerId must be a UUID, sellerId must be a UUID", nil)
	}
	provider := req.Provider
	if provider == "" || len(provider) > 64 {
		return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "provider length must be between 1 and 64", nil)
	}
	currency := req.Currency
	if !currencyRegex.MatchString(currency) {
		return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "currency must match /^[A-Z]{3}$/ regular expression", nil)
	}
	if req.ShippingFee != nil && (req.ShippingFee.Invalid || req.ShippingFee.Value < 0 || !isMoney(req.ShippingFee.Value)) {
		return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "shippingFee must not be less than 0, shippingFee must be a number conforming to the specified constraints", nil)
	}
	if req.CODAmount != nil && (req.CODAmount.Invalid || req.CODAmount.Value < 0 || !isMoney(req.CODAmount.Value)) {
		return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "codAmount must not be less than 0, codAmount must be a number conforming to the specified constraints", nil)
	}
	if !inLen(req.RecipientName, 1, 255) || !inLen(req.RecipientPhone, 1, 32) || !inLen(req.RecipientAddress, 1, 500) {
		return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "recipient fields are invalid", nil)
	}
	if req.AWB != nil && len(*req.AWB) > 64 {
		return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "awb length must be <= 64", nil)
	}
	if req.TrackingNumber != nil && len(*req.TrackingNumber) > 64 {
		return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "trackingNumber length must be <= 64", nil)
	}
	if req.Note != nil && len(*req.Note) > 500 {
		return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "note length must be <= 500", nil)
	}
	return nil
}

func validateWebhookRequest(req ShippingWebhookRequest) error {
	if strings.TrimSpace(req.ProviderEventID) == "" || len(strings.TrimSpace(req.ProviderEventID)) > 128 {
		return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "providerEventId is required and max length 128", nil)
	}
	if req.OrderID != nil && !isUUID(strings.TrimSpace(*req.OrderID)) {
		return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "orderId must be a UUID", nil)
	}
	if req.AWB != nil && len(strings.TrimSpace(*req.AWB)) > 64 {
		return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "awb length must be <= 64", nil)
	}
	if req.TrackingNumber != nil && len(strings.TrimSpace(*req.TrackingNumber)) > 64 {
		return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "trackingNumber length must be <= 64", nil)
	}
	if !domain.IsValidShipmentStatus(req.Status) {
		return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "status must be one of the following values: PENDING, AWB_CREATED, PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, CANCELLED, FAILED, RETURNED", nil)
	}
	if req.EventCode != nil && len(strings.TrimSpace(*req.EventCode)) > 64 {
		return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "eventCode length must be <= 64", nil)
	}
	if req.Description != nil && len(strings.TrimSpace(*req.Description)) > 500 {
		return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "description length must be <= 500", nil)
	}
	if req.Location != nil && len(strings.TrimSpace(*req.Location)) > 255 {
		return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "location length must be <= 255", nil)
	}
	if req.OccurredAt != nil && strings.TrimSpace(*req.OccurredAt) != "" {
		if _, err := time.Parse(time.RFC3339, strings.TrimSpace(*req.OccurredAt)); err != nil {
			return httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "occurredAt must be a valid ISO 8601 date string", nil)
		}
	}
	return nil
}

func requireStaff(user domain.UserContext) error {
	if _, ok := domain.StaffRoles[user.Role]; !ok {
		return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Only staff roles can perform this action", nil)
	}
	return nil
}

func ensureCanRead(user domain.UserContext, shipment domain.Shipment) error {
	if user.Role == domain.RoleCustomer && shipment.BuyerID != user.UserID {
		return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Access denied for this shipment", nil)
	}
	if user.Role == domain.RoleSeller && shipment.SellerID != user.UserID {
		return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Access denied for this shipment", nil)
	}
	return nil
}

func ensureTransition(current, next domain.ShipmentStatus) error {
	allowed := domain.ShipmentStatusTransitions[current]
	if _, ok := allowed[next]; !ok {
		return httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeInvalidStatusTransition, fmt.Sprintf("Cannot transition shipment status from %s to %s", current, next), nil)
	}
	return nil
}

func shipmentResponse(shipment domain.Shipment) map[string]any {
	return map[string]any{
		"id":               shipment.ID,
		"orderId":          shipment.OrderID,
		"buyerId":          shipment.BuyerID,
		"sellerId":         shipment.SellerID,
		"provider":         shipment.Provider,
		"awb":              shipment.AWB,
		"trackingNumber":   shipment.TrackingNumber,
		"status":           shipment.Status,
		"currency":         shipment.Currency,
		"shippingFee":      shipment.ShippingFee,
		"codAmount":        shipment.CODAmount,
		"recipientName":    shipment.RecipientName,
		"recipientPhone":   shipment.RecipientPhone,
		"recipientAddress": shipment.RecipientAddress,
		"note":             shipment.Note,
		"metadata":         shipment.Metadata,
		"createdAt":        shipment.CreatedAt.UTC().Format(time.RFC3339Nano),
		"updatedAt":        shipment.UpdatedAt.UTC().Format(time.RFC3339Nano),
	}
}

func trackingEventResponse(event domain.ShipmentTrackingEvent) map[string]any {
	return map[string]any{
		"id":          event.ID,
		"shipmentId":  event.ShipmentID,
		"status":      event.Status,
		"eventCode":   event.EventCode,
		"description": event.Description,
		"location":    event.Location,
		"occurredAt":  event.OccurredAt.UTC().Format(time.RFC3339Nano),
		"rawPayload":  event.RawPayload,
		"createdAt":   event.CreatedAt.UTC().Format(time.RFC3339Nano),
	}
}

func (s *ShippingService) verifyWebhookSignature(provider, signature string, req ShippingWebhookRequest) error {
	secret := strings.TrimSpace(s.webhookSigningSecret)
	if secret == "" {
		return httpx.NewAppError(http.StatusServiceUnavailable, domain.ErrorCodeServiceUnavailable, "Webhook signing secret is not configured", nil)
	}

	provided := strings.TrimSpace(signature)
	if provided == "" {
		return httpx.NewAppError(http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Missing webhook signature", nil)
	}
	provided = strings.TrimPrefix(strings.ToLower(provided), "sha256=")

	payloadCanonical := canonicalize(map[string]any{
		"provider": provider,
		"payload":  req,
	})
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payloadCanonical))
	expected := hex.EncodeToString(mac.Sum(nil))

	if subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
		return httpx.NewAppError(http.StatusUnauthorized, domain.ErrorCodeUnauthorized, "Invalid webhook signature", nil)
	}
	return nil
}

func hashWebhookPayload(provider string, req ShippingWebhookRequest) string {
	canonical := canonicalize(map[string]any{
		"provider": provider,
		"payload":  req,
	})
	hash := sha256.Sum256([]byte(canonical))
	return hex.EncodeToString(hash[:])
}

func canonicalize(value any) string {
	switch v := value.(type) {
	case nil:
		return "null"
	case string:
		b, _ := json.Marshal(v)
		return string(b)
	case bool, float64, float32, int, int64, int32, int16, int8, uint, uint64, uint32, uint16, uint8:
		b, _ := json.Marshal(v)
		return string(b)
	case []any:
		parts := make([]string, 0, len(v))
		for _, item := range v {
			parts = append(parts, canonicalize(item))
		}
		return "[" + strings.Join(parts, ",") + "]"
	case map[string]any:
		keys := make([]string, 0, len(v))
		for k := range v {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		parts := make([]string, 0, len(keys))
		for _, key := range keys {
			k, _ := json.Marshal(key)
			parts = append(parts, string(k)+":"+canonicalize(v[key]))
		}
		return "{" + strings.Join(parts, ",") + "}"
	default:
		b, _ := json.Marshal(v)
		var normalized any
		if err := json.Unmarshal(b, &normalized); err != nil {
			return "null"
		}
		return canonicalize(normalized)
	}
}

func isUUID(v string) bool {
	_, err := uuid.Parse(strings.TrimSpace(v))
	return err == nil
}

func isUUIDStrict(v string) bool {
	_, err := uuid.Parse(v)
	return err == nil
}

func isMoney(v float64) bool {
	rounded := roundMoney(v)
	return math.Abs(rounded-v) < 0.000001
}

func inLen(v string, min, max int) bool {
	l := len(v)
	return l >= min && l <= max
}

func roundMoney(v float64) float64 {
	return math.Round((v+math.SmallestNonzeroFloat64)*100) / 100
}

func derefNumberLike(ptr *NumberLike, fallback float64) float64 {
	if ptr == nil {
		return fallback
	}
	return ptr.Value
}

func trimStringPtr(ptr *string) *string {
	if ptr == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*ptr)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func strPtr(v string) *string {
	vv := v
	return &vv
}

func asString(v any) string {
	s, ok := v.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(s)
}

func asNonNegativeNumber(v any) *float64 {
	value, ok := v.(float64)
	if !ok || value < 0 || math.IsNaN(value) || math.IsInf(value, 0) {
		return nil
	}
	return &value
}

func ptrFloat(v float64) *float64 {
	vv := v
	return &vv
}

func codAmountForPaymentMethod(paymentMethod string, totalAmount *float64) float64 {
	if !strings.EqualFold(strings.TrimSpace(paymentMethod), "COD") || totalAmount == nil {
		return 0
	}
	return roundMoney(*totalAmount)
}

func isOrderEligibleForShipment(status string) bool {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "CONFIRMED", "PROCESSING", "SHIPPED":
		return true
	default:
		return false
	}
}
