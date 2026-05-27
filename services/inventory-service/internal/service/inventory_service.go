package service

import (
	"context"
	"errors"
	"net/http"
	"sort"
	"strings"
	"time"

	"inventory-service/internal/domain"
	"inventory-service/internal/httpx"
	"inventory-service/internal/repository"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"go.uber.org/zap"
)

const (
	EventInventoryReserved          = "inventory.reserved"
	EventInventoryReservationFailed = "inventory.reservation-failed"
	EventInventoryReleased          = "inventory.released"
	EventInventoryAdjusted          = "inventory.adjusted"
	EventInventoryConfirmed         = "inventory.confirmed"
	EventInventoryExpired           = "inventory.expired"
)

type InventoryActor struct {
	UserID string
	Role   domain.Role
}

var systemActor = InventoryActor{
	UserID: "00000000-0000-0000-0000-000000000000",
	Role:   domain.RoleService,
}

type ValidateInventoryQuery struct {
	SKU      string
	Quantity int
}

type AdjustStockRequest struct {
	ProductID       *string
	SellerID        *string
	DeltaOnHand     *int
	OnHand          *int
	Reason          *string
	ExpectedVersion *int
}

type ReserveInventoryItem struct {
	SKU      string
	Quantity int
}

type ReserveInventoryRequest struct {
	OrderID    string
	Items      []ReserveInventoryItem
	TTLMinutes *int
	Reason     *string
}

type OrderCreatedEvent struct {
	OrderID string
	Items   []ReserveInventoryItem
}

type ProductChangedEvent struct {
	ProductID string
	SellerID  string
	Variants  []ProductVariant
}

type ProductVariant struct {
	SKU          string
	InitialStock int
}

type EventMeta struct {
	EventID     string
	EventType   string
	Topic       string
	Partition   int
	OffsetValue int64
	RequestID   string
}

type InventoryService struct {
	repo            *repository.InventoryRepository
	logger          *zap.Logger
	defaultTTL      time.Duration
	expireBatchSize int
}

func NewInventoryService(
	repo *repository.InventoryRepository,
	logger *zap.Logger,
	defaultTTL time.Duration,
	expireBatchSize int,
) *InventoryService {
	return &InventoryService{
		repo:            repo,
		logger:          logger,
		defaultTTL:      defaultTTL,
		expireBatchSize: expireBatchSize,
	}
}

func (s *InventoryService) ValidateStock(ctx context.Context, q ValidateInventoryQuery) (map[string]any, error) {
	sku := normalizeSKU(q.SKU)
	item, err := s.repo.FindInventoryBySKU(ctx, sku)
	if err != nil {
		return nil, err
	}
	available := 0
	if item != nil {
		available = item.OnHand - item.Reserved
	}
	return map[string]any{
		"sku":               sku,
		"requestedQuantity": q.Quantity,
		"availableQuantity": available,
		"isAvailable":       available >= q.Quantity,
	}, nil
}

func (s *InventoryService) GetStockBySKU(ctx context.Context, actor domain.UserContext, sku string) (map[string]any, error) {
	normalized := normalizeSKU(sku)
	item, err := s.repo.FindInventoryBySKU(ctx, normalized)
	if err != nil {
		return nil, err
	}
	if item == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeInventorySkuNotFound, "Inventory SKU not found: "+normalized, nil)
	}
	if err := assertSellerInventoryOwnership(actor, item, nil); err != nil {
		return nil, err
	}
	return toStockSnapshot(*item), nil
}

func (s *InventoryService) AdjustStock(
	ctx context.Context,
	actor domain.UserContext,
	requestID string,
	sku string,
	req AdjustStockRequest,
) (map[string]any, error) {
	normalized := normalizeSKU(sku)

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	item, err := s.repo.FindInventoryBySKUForUpdate(ctx, tx, normalized)
	if err != nil {
		return nil, err
	}

	if err := assertSellerInventoryOwnership(actor, item, req.SellerID); err != nil {
		return nil, err
	}

	deltaOnHand := 0
	if item == nil {
		initialOnHand, adjustmentDelta, err := calculateStockAdjustment(0, req)
		if err != nil {
			return nil, err
		}
		if req.OnHand == nil && initialOnHand <= 0 {
			return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeInventorySkuNotFound, "Inventory SKU not found: "+normalized, nil)
		}
		if req.ProductID == nil || req.SellerID == nil || strings.TrimSpace(*req.ProductID) == "" || strings.TrimSpace(*req.SellerID) == "" {
			return nil, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeInventoryInvalidAdjustment, "productId and sellerId are required when creating stock", nil)
		}
		if len(strings.TrimSpace(*req.ProductID)) > 128 || !isUUID(*req.SellerID) {
			return nil, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "productId is invalid or sellerId is not a valid UUID", nil)
		}

		item = &domain.InventoryItem{
			SKU:       normalized,
			ProductID: strings.TrimSpace(*req.ProductID),
			SellerID:  strings.TrimSpace(*req.SellerID),
			OnHand:    initialOnHand,
			Reserved:  0,
		}
		if err := s.repo.InsertInventoryItem(ctx, tx, item); err != nil {
			return nil, err
		}
		deltaOnHand = adjustmentDelta
	} else {
		if req.ExpectedVersion != nil && *req.ExpectedVersion != item.Version {
			return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeConflict, "Version conflict for SKU "+normalized, nil)
		}

		nextOnHand, adjustmentDelta, err := calculateStockAdjustment(item.OnHand, req)
		if err != nil {
			return nil, err
		}
		if nextOnHand < 0 || nextOnHand-item.Reserved < 0 {
			return nil, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeInventoryNegativeStock, "Stock adjustment causes negative available quantity for SKU "+normalized, nil)
		}

		item.OnHand = nextOnHand
		if req.ProductID != nil && strings.TrimSpace(*req.ProductID) != "" {
			requestedProductID := strings.TrimSpace(*req.ProductID)
			if len(requestedProductID) > 128 {
				return nil, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "productId is invalid", nil)
			}
			if requestedProductID != item.ProductID {
				return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeConflict, "Inventory SKU is already linked to another product: "+normalized, nil)
			}
		}
		if req.SellerID != nil && strings.TrimSpace(*req.SellerID) != "" {
			requestedSellerID := strings.TrimSpace(*req.SellerID)
			if !isUUID(requestedSellerID) {
				return nil, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "sellerId must be valid UUID", nil)
			}
			if requestedSellerID != item.SellerID {
				return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeConflict, "Inventory SKU is already linked to another seller: "+normalized, nil)
			}
		}

		if err := s.repo.UpdateInventoryItem(ctx, tx, item); err != nil {
			return nil, err
		}
		deltaOnHand = adjustmentDelta
	}

	movement := domain.InventoryMovement{
		SKU:           item.SKU,
		OrderID:       nil,
		MovementType:  domain.InventoryMovementTypeAdjust,
		DeltaOnHand:   deltaOnHand,
		DeltaReserved: 0,
		Reason:        req.Reason,
		ActorID:       actor.UserID,
		ActorRole:     actor.Role,
		RequestID:     requestID,
	}
	if err := s.repo.SaveMovements(ctx, tx, []domain.InventoryMovement{movement}); err != nil {
		return nil, err
	}

	if err := s.repo.InsertOutboxEvent(ctx, tx, repository.CreateOutboxEventInput{
		AggregateType: "inventory-item",
		AggregateID:   item.ID,
		EventType:     EventInventoryAdjusted,
		Payload: map[string]any{
			"sku":         item.SKU,
			"productId":   item.ProductID,
			"sellerId":    item.SellerID,
			"deltaOnHand": deltaOnHand,
			"onHand":      item.OnHand,
			"reserved":    item.Reserved,
			"available":   item.OnHand - item.Reserved,
			"reason":      nullableString(req.Reason),
			"metadata":    buildEventMetadata(requestID, InventoryActor{UserID: actor.UserID, Role: actor.Role}),
		},
	}); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return toStockSnapshot(*item), nil
}

func calculateStockAdjustment(currentOnHand int, req AdjustStockRequest) (int, int, error) {
	if (req.DeltaOnHand == nil) == (req.OnHand == nil) {
		return 0, 0, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "Exactly one stock adjustment value is required", nil)
	}
	if req.OnHand != nil {
		if *req.OnHand < 0 {
			return 0, 0, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "onHand cannot be negative", nil)
		}
		return *req.OnHand, *req.OnHand - currentOnHand, nil
	}

	return currentOnHand + *req.DeltaOnHand, *req.DeltaOnHand, nil
}

func assertSellerInventoryOwnership(actor domain.UserContext, item *domain.InventoryItem, requestedSellerID *string) error {
	if actor.Role != domain.RoleSeller {
		return nil
	}

	if item != nil && item.SellerID != actor.UserID {
		return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Seller cannot access inventory owned by another seller", nil)
	}
	if requestedSellerID != nil && strings.TrimSpace(*requestedSellerID) != "" && strings.TrimSpace(*requestedSellerID) != actor.UserID {
		return httpx.NewAppError(http.StatusForbidden, domain.ErrorCodeForbidden, "Seller cannot access inventory owned by another seller", nil)
	}

	return nil
}

func (s *InventoryService) ProvisionInventoryFromProductChanged(ctx context.Context, event ProductChangedEvent, meta EventMeta) (map[string]any, error) {
	productID := strings.TrimSpace(event.ProductID)
	sellerID := strings.TrimSpace(event.SellerID)
	if productID == "" || len(productID) > 128 || !isUUID(sellerID) {
		return nil, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "product event has invalid productId or sellerId", nil)
	}

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	alreadyProcessed, err := s.repo.TryMarkEventProcessed(ctx, tx, repository.ProcessedEventInput{
		ConsumerName: "inventory-service-product-events",
		EventID:      meta.EventID,
		EventType:    meta.EventType,
		Topic:        meta.Topic,
		Partition:    meta.Partition,
		OffsetValue:  meta.OffsetValue,
	})
	if err != nil {
		return nil, err
	}
	if alreadyProcessed {
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return map[string]any{"productId": productID, "idempotent": true, "created": 0}, nil
	}

	created := 0
	for _, variant := range event.Variants {
		sku := normalizeSKU(variant.SKU)
		if sku == "" {
			continue
		}
		item, err := s.repo.FindInventoryBySKUForUpdate(ctx, tx, sku)
		if err != nil {
			return nil, err
		}
		if item != nil {
			if item.ProductID != productID || item.SellerID != sellerID {
				return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeConflict, "Inventory SKU is already linked to another product: "+sku, nil)
			}
			continue
		}
		item = &domain.InventoryItem{
			SKU:       sku,
			ProductID: productID,
			SellerID:  sellerID,
			OnHand:    variant.InitialStock,
			Reserved:  0,
		}
		if err := s.repo.InsertInventoryItem(ctx, tx, item); err != nil {
			return nil, err
		}
		created++
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return map[string]any{"productId": productID, "created": created}, nil
}

func (s *InventoryService) ReserveInventory(
	ctx context.Context,
	actor domain.UserContext,
	requestID string,
	req ReserveInventoryRequest,
) (map[string]any, error) {
	items := normalizeReserveItems(req.Items)
	ttl := s.defaultTTL
	if req.TTLMinutes != nil {
		ttl = time.Duration(*req.TTLMinutes) * time.Minute
	}

	result, err := s.reserveInventoryTx(ctx, InventoryActor{UserID: actor.UserID, Role: actor.Role}, requestID, req.OrderID, items, ttl, req.Reason)
	if err == nil {
		return result, nil
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return s.handleReservationUniqueConflict(ctx, req.OrderID, items)
	}
	return nil, err
}

func (s *InventoryService) ReserveInventoryFromOrderCreated(ctx context.Context, event OrderCreatedEvent, meta EventMeta) (map[string]any, error) {
	orderID := strings.TrimSpace(event.OrderID)
	requestID := strings.TrimSpace(meta.RequestID)
	if requestID == "" {
		requestID = "kafka-" + meta.Topic
	}
	if orderID == "" || !isUUID(orderID) {
		return nil, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "order.created event has invalid orderId", nil)
	}

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	alreadyProcessed, err := s.repo.TryMarkEventProcessed(ctx, tx, repository.ProcessedEventInput{
		EventID:     meta.EventID,
		EventType:   meta.EventType,
		Topic:       meta.Topic,
		Partition:   meta.Partition,
		OffsetValue: meta.OffsetValue,
	})
	if err != nil {
		return nil, err
	}
	if alreadyProcessed {
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return map[string]any{"orderId": orderID, "idempotent": true, "skipped": true}, nil
	}

	items := normalizeReserveItems(event.Items)
	if len(items) == 0 {
		payload, err := s.insertReservationFailedEvent(ctx, tx, orderID, domain.ErrorCodeValidationFailed, "order.created event has no reservable items", nil, requestID)
		if err != nil {
			return nil, err
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return payload, nil
	}
	for _, item := range items {
		if item.SKU == "" || item.Quantity <= 0 {
			payload, err := s.insertReservationFailedEvent(ctx, tx, orderID, domain.ErrorCodeValidationFailed, "order.created event has invalid reservation item", items, requestID)
			if err != nil {
				return nil, err
			}
			if err := tx.Commit(ctx); err != nil {
				return nil, err
			}
			return payload, nil
		}
	}

	reason := "Order created event"
	result, err := s.reserveInventoryInTx(ctx, tx, systemActor, requestID, orderID, items, s.defaultTTL, &reason)
	if err == nil {
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return result, nil
	}

	var appErr *httpx.AppError
	if errors.As(err, &appErr) && isReservationBusinessFailure(appErr.Code) {
		payload, failureErr := s.insertReservationFailedEvent(ctx, tx, orderID, appErr.Code, appErr.Message, buildFailedReservationLines(items, appErr.Details), requestID)
		if failureErr != nil {
			return nil, failureErr
		}
		if commitErr := tx.Commit(ctx); commitErr != nil {
			return nil, commitErr
		}
		return payload, nil
	}
	return nil, err
}

func (s *InventoryService) reserveInventoryTx(
	ctx context.Context,
	actor InventoryActor,
	requestID, orderID string,
	items []ReserveInventoryItem,
	ttl time.Duration,
	reason *string,
) (map[string]any, error) {
	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	result, err := s.reserveInventoryInTx(ctx, tx, actor, requestID, orderID, items, ttl, reason)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return result, nil
}

func (s *InventoryService) reserveInventoryInTx(
	ctx context.Context,
	tx pgx.Tx,
	actor InventoryActor,
	requestID, orderID string,
	items []ReserveInventoryItem,
	ttl time.Duration,
	reason *string,
) (map[string]any, error) {
	existing, err := s.repo.FindActiveReservationsByOrderIDForUpdate(ctx, tx, orderID)
	if err != nil {
		return nil, err
	}
	if len(existing) > 0 {
		if isSameReservation(existing, items) {
			return toReservationResponse(orderID, existing, true, nil), nil
		}
		return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeInventoryReservationConflict, "Active reservation conflict for order "+orderID, nil)
	}

	inventoryBySKU := make(map[string]*domain.InventoryItem, len(items))
	for _, it := range items {
		inv, findErr := s.repo.FindInventoryBySKUForUpdate(ctx, tx, it.SKU)
		if findErr != nil {
			return nil, findErr
		}
		if inv == nil {
			return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeInventorySkuNotFound, "Inventory SKU not found: "+it.SKU, nil)
		}
		available := inv.OnHand - inv.Reserved
		if available < it.Quantity {
			return nil, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeInventoryInsufficientStock, "Insufficient stock for SKU "+it.SKU, map[string]any{
				"sku":               it.SKU,
				"requestedQuantity": it.Quantity,
				"availableQuantity": available,
			})
		}
		inventoryBySKU[it.SKU] = inv
	}

	expiresAt := time.Now().Add(ttl)
	reservations := make([]domain.InventoryReservation, 0, len(items))
	movements := make([]domain.InventoryMovement, 0, len(items))

	for _, it := range items {
		inv := inventoryBySKU[it.SKU]
		inv.Reserved += it.Quantity
		if err := s.repo.UpdateInventoryItem(ctx, tx, inv); err != nil {
			return nil, err
		}

		reservations = append(reservations, domain.InventoryReservation{
			OrderID:   orderID,
			SKU:       it.SKU,
			Quantity:  it.Quantity,
			Status:    domain.InventoryReservationStatusActive,
			ExpiresAt: expiresAt,
			RequestID: requestID,
		})

		movements = append(movements, domain.InventoryMovement{
			SKU:           it.SKU,
			OrderID:       &orderID,
			MovementType:  domain.InventoryMovementTypeReserve,
			DeltaOnHand:   0,
			DeltaReserved: it.Quantity,
			Reason:        reason,
			ActorID:       actor.UserID,
			ActorRole:     actor.Role,
			RequestID:     requestID,
		})
	}

	savedReservations, err := s.repo.InsertReservations(ctx, tx, reservations)
	if err != nil {
		return nil, err
	}
	if err := s.repo.SaveMovements(ctx, tx, movements); err != nil {
		return nil, err
	}
	if err := s.repo.InsertOutboxEvent(ctx, tx, repository.CreateOutboxEventInput{
		AggregateType: "inventory-reservation",
		AggregateID:   orderID,
		EventType:     EventInventoryReserved,
		Payload:       buildReservationEventPayload(orderID, domain.InventoryReservationStatusActive, savedReservations, actor, requestID, reason),
	}); err != nil {
		return nil, err
	}
	return toReservationResponse(orderID, savedReservations, false, nil), nil
}

func (s *InventoryService) publishReservationFailed(ctx context.Context, orderID, reason, message string, items []ReserveInventoryItem, requestID string) (map[string]any, error) {
	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	payload, err := s.insertReservationFailedEvent(ctx, tx, orderID, reason, message, items, requestID)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return payload, nil
}

func (s *InventoryService) insertReservationFailedEvent(ctx context.Context, tx pgx.Tx, orderID, reason, message string, items []ReserveInventoryItem, requestID string) (map[string]any, error) {
	payloadItems := make([]map[string]any, 0, len(items))
	for _, item := range items {
		payloadItems = append(payloadItems, map[string]any{
			"sku":               item.SKU,
			"requestedQuantity": item.Quantity,
			"availableQuantity": nil,
		})
	}

	payload := map[string]any{
		"orderId":  orderID,
		"reason":   reason,
		"message":  message,
		"items":    payloadItems,
		"metadata": buildEventMetadata(requestID, systemActor),
	}
	if err := s.repo.InsertOutboxEvent(ctx, tx, repository.CreateOutboxEventInput{
		AggregateType: "inventory-reservation",
		AggregateID:   orderID,
		EventType:     EventInventoryReservationFailed,
		Payload:       payload,
	}); err != nil {
		return nil, err
	}
	return payload, nil
}

func (s *InventoryService) ReleaseReservations(ctx context.Context, actor domain.UserContext, requestID, orderID string, reason *string) (map[string]any, error) {
	return s.settleReservations(ctx, InventoryActor{UserID: actor.UserID, Role: actor.Role}, requestID, orderID, domain.InventoryReservationStatusReleased, EventInventoryReleased, reason, false)
}

func (s *InventoryService) ConfirmReservations(ctx context.Context, actor domain.UserContext, requestID, orderID string, reason *string) (map[string]any, error) {
	return s.settleReservations(ctx, InventoryActor{UserID: actor.UserID, Role: actor.Role}, requestID, orderID, domain.InventoryReservationStatusConfirmed, EventInventoryConfirmed, reason, false)
}

func (s *InventoryService) ReleaseReservationsFromOrderCancellation(ctx context.Context, orderID, requestID string) (map[string]any, error) {
	reason := "Order cancelled event"
	return s.settleReservations(ctx, systemActor, requestID, orderID, domain.InventoryReservationStatusReleased, EventInventoryReleased, &reason, true)
}

func (s *InventoryService) ReleaseReservationsFromOrderFailed(ctx context.Context, orderID, requestID string) (map[string]any, error) {
	reason := "Order failed event"
	return s.settleReservations(ctx, systemActor, requestID, orderID, domain.InventoryReservationStatusReleased, EventInventoryReleased, &reason, true)
}

func (s *InventoryService) ConfirmReservationsFromOrderConfirmed(ctx context.Context, orderID, requestID string) (map[string]any, error) {
	reason := "Order confirmed event"
	return s.settleReservations(ctx, systemActor, requestID, orderID, domain.InventoryReservationStatusConfirmed, EventInventoryConfirmed, &reason, true)
}

func (s *InventoryService) ExpireActiveReservationsBatch(ctx context.Context) error {
	expired, err := s.repo.FindExpiredActiveReservations(ctx, s.expireBatchSize)
	if err != nil {
		return err
	}
	if len(expired) == 0 {
		return nil
	}

	orderSet := make(map[string]struct{})
	for _, item := range expired {
		orderSet[item.OrderID] = struct{}{}
	}

	for orderID := range orderSet {
		reason := "Reservation TTL expired"
		_, settleErr := s.settleReservations(ctx, systemActor, "expire-"+orderID+"-"+time.Now().UTC().Format("20060102150405"), orderID, domain.InventoryReservationStatusExpired, EventInventoryExpired, &reason, true)
		if settleErr != nil {
			s.logger.Error("failed to expire reservations", zap.String("order_id", orderID), zap.Error(settleErr))
		}
	}
	return nil
}

func (s *InventoryService) settleReservations(
	ctx context.Context,
	actor InventoryActor,
	requestID, orderID string,
	nextStatus domain.InventoryReservationStatus,
	eventType string,
	reason *string,
	allowMissing bool,
) (map[string]any, error) {
	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	active, err := s.repo.FindActiveReservationsByOrderIDForUpdate(ctx, tx, orderID)
	if err != nil {
		return nil, err
	}
	if len(active) == 0 {
		if allowMissing {
			if err := tx.Commit(ctx); err != nil {
				return nil, err
			}
			return map[string]any{"orderId": orderID, "status": nextStatus, "skipped": true, "items": []any{}}, nil
		}
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeInventoryReservationNotFound, "No active reservations found for order "+orderID, nil)
	}

	movementType := mapReservationStatusToMovementType(nextStatus)
	movements := make([]domain.InventoryMovement, 0, len(active))

	for idx := range active {
		reservation := &active[idx]
		inv, findErr := s.repo.FindInventoryBySKUForUpdate(ctx, tx, reservation.SKU)
		if findErr != nil {
			return nil, findErr
		}
		if inv == nil {
			return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeInventorySkuNotFound, "Inventory SKU not found: "+reservation.SKU, nil)
		}

		if inv.Reserved < reservation.Quantity {
			return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeInventoryNegativeStock, "Reserved quantity mismatch for SKU "+reservation.SKU, nil)
		}

		inv.Reserved -= reservation.Quantity
		if nextStatus == domain.InventoryReservationStatusConfirmed {
			inv.OnHand -= reservation.Quantity
		}
		if inv.OnHand < 0 || inv.OnHand-inv.Reserved < 0 {
			return nil, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeInventoryNegativeStock, "Operation causes negative stock for SKU "+reservation.SKU, nil)
		}

		if err := s.repo.UpdateInventoryItem(ctx, tx, inv); err != nil {
			return nil, err
		}
		if err := s.repo.UpdateReservationStatus(ctx, tx, reservation.ID, nextStatus, requestID); err != nil {
			return nil, err
		}
		reservation.Status = nextStatus
		reservation.RequestID = requestID

		deltaOnHand := 0
		if nextStatus == domain.InventoryReservationStatusConfirmed {
			deltaOnHand = -reservation.Quantity
		}
		movements = append(movements, domain.InventoryMovement{
			SKU:           reservation.SKU,
			OrderID:       &reservation.OrderID,
			MovementType:  movementType,
			DeltaOnHand:   deltaOnHand,
			DeltaReserved: -reservation.Quantity,
			Reason:        reason,
			ActorID:       actor.UserID,
			ActorRole:     actor.Role,
			RequestID:     requestID,
		})
	}

	if err := s.repo.SaveMovements(ctx, tx, movements); err != nil {
		return nil, err
	}
	if err := s.repo.InsertOutboxEvent(ctx, tx, repository.CreateOutboxEventInput{
		AggregateType: "inventory-reservation",
		AggregateID:   orderID,
		EventType:     eventType,
		Payload:       buildReservationEventPayload(orderID, nextStatus, active, actor, requestID, reason),
	}); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return toReservationResponse(orderID, active, false, &nextStatus), nil
}

func (s *InventoryService) handleReservationUniqueConflict(ctx context.Context, orderID string, requested []ReserveInventoryItem) (map[string]any, error) {
	existing, err := s.repo.FindActiveReservationsByOrderID(ctx, orderID)
	if err != nil {
		return nil, err
	}
	if len(existing) > 0 && isSameReservation(existing, requested) {
		return toReservationResponse(orderID, existing, true, nil), nil
	}
	return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeInventoryReservationConflict, "Active reservation conflict for order "+orderID, nil)
}

func toStockSnapshot(item domain.InventoryItem) map[string]any {
	return map[string]any{
		"id":        item.ID,
		"sku":       item.SKU,
		"productId": item.ProductID,
		"sellerId":  item.SellerID,
		"onHand":    item.OnHand,
		"reserved":  item.Reserved,
		"available": item.OnHand - item.Reserved,
		"version":   item.Version,
		"createdAt": item.CreatedAt.UTC().Format(time.RFC3339Nano),
		"updatedAt": item.UpdatedAt.UTC().Format(time.RFC3339Nano),
	}
}

func toReservationResponse(orderID string, reservations []domain.InventoryReservation, idempotent bool, overrideStatus *domain.InventoryReservationStatus) map[string]any {
	status := domain.InventoryReservationStatusActive
	if overrideStatus != nil {
		status = *overrideStatus
	} else if len(reservations) > 0 {
		status = reservations[0].Status
	}
	items := make([]map[string]any, 0, len(reservations))
	for _, item := range reservations {
		items = append(items, map[string]any{
			"sku":      item.SKU,
			"quantity": item.Quantity,
		})
	}
	var expiresAt any = nil
	if len(reservations) > 0 {
		expiresAt = reservations[0].ExpiresAt.UTC().Format(time.RFC3339Nano)
	}
	return map[string]any{
		"orderId":    orderID,
		"status":     status,
		"idempotent": idempotent,
		"expiresAt":  expiresAt,
		"items":      items,
	}
}

func buildReservationEventPayload(orderID string, status domain.InventoryReservationStatus, reservations []domain.InventoryReservation, actor InventoryActor, requestID string, reason *string) map[string]any {
	items := make([]map[string]any, 0, len(reservations))
	for _, item := range reservations {
		items = append(items, map[string]any{
			"sku":      item.SKU,
			"quantity": item.Quantity,
		})
	}

	var expiresAt any = nil
	if len(reservations) > 0 {
		expiresAt = reservations[0].ExpiresAt.UTC().Format(time.RFC3339Nano)
	}

	return map[string]any{
		"orderId":   orderID,
		"status":    status,
		"expiresAt": expiresAt,
		"items":     items,
		"reason":    nullableString(reason),
		"metadata":  buildEventMetadata(requestID, actor),
	}
}

func buildEventMetadata(requestID string, actor InventoryActor) map[string]any {
	return map[string]any{
		"requestId":  requestID,
		"occurredAt": time.Now().UTC().Format(time.RFC3339Nano),
		"actorId":    actor.UserID,
		"actorRole":  actor.Role,
	}
}

func mapReservationStatusToMovementType(status domain.InventoryReservationStatus) domain.InventoryMovementType {
	switch status {
	case domain.InventoryReservationStatusReleased:
		return domain.InventoryMovementTypeRelease
	case domain.InventoryReservationStatusConfirmed:
		return domain.InventoryMovementTypeConfirm
	default:
		return domain.InventoryMovementTypeExpire
	}
}

func isReservationBusinessFailure(code string) bool {
	switch code {
	case domain.ErrorCodeInventoryInsufficientStock,
		domain.ErrorCodeInventorySkuNotFound,
		domain.ErrorCodeInventoryReservationConflict,
		domain.ErrorCodeValidationFailed:
		return true
	default:
		return false
	}
}

func buildFailedReservationLines(items []ReserveInventoryItem, details any) []ReserveInventoryItem {
	if len(items) == 0 {
		return []ReserveInventoryItem{}
	}
	if detailMap, ok := details.(map[string]any); ok {
		if sku, ok := detailMap["sku"].(string); ok && strings.TrimSpace(sku) != "" {
			if requested, ok := numberToInt(detailMap["requestedQuantity"]); ok {
				return []ReserveInventoryItem{{SKU: normalizeSKU(sku), Quantity: requested}}
			}
		}
	}
	return items
}

func numberToInt(v any) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case int32:
		return int(n), true
	case int64:
		return int(n), true
	case float64:
		return int(n), true
	case float32:
		return int(n), true
	default:
		return 0, false
	}
}

func normalizeSKU(sku string) string {
	return strings.ToUpper(strings.TrimSpace(sku))
}

func normalizeReserveItems(items []ReserveInventoryItem) []ReserveInventoryItem {
	m := make(map[string]int)
	for _, item := range items {
		sku := normalizeSKU(item.SKU)
		m[sku] += item.Quantity
	}
	out := make([]ReserveInventoryItem, 0, len(m))
	for sku, qty := range m {
		out = append(out, ReserveInventoryItem{SKU: sku, Quantity: qty})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].SKU < out[j].SKU })
	return out
}

func isSameReservation(existing []domain.InventoryReservation, requested []ReserveInventoryItem) bool {
	if len(existing) != len(requested) {
		return false
	}
	em := make(map[string]int, len(existing))
	for _, e := range existing {
		em[e.SKU] = e.Quantity
	}
	for _, r := range requested {
		if em[r.SKU] != r.Quantity {
			return false
		}
	}
	return true
}

func nullableString(v *string) any {
	if v == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*v)
	if trimmed == "" {
		return nil
	}
	return trimmed
}

func isUUID(v string) bool {
	_, err := uuid.Parse(strings.TrimSpace(v))
	return err == nil
}
