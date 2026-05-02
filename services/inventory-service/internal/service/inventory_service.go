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
	"github.com/jackc/pgx/v5/pgconn"
	"go.uber.org/zap"
)

const (
	EventInventoryReserved  = "inventory.reserved"
	EventInventoryReleased  = "inventory.released"
	EventInventoryAdjusted  = "inventory.adjusted"
	EventInventoryConfirmed = "inventory.confirmed"
	EventInventoryExpired   = "inventory.expired"
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
	DeltaOnHand     int
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

func (s *InventoryService) GetStockBySKU(ctx context.Context, sku string) (map[string]any, error) {
	normalized := normalizeSKU(sku)
	item, err := s.repo.FindInventoryBySKU(ctx, normalized)
	if err != nil {
		return nil, err
	}
	if item == nil {
		return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeInventorySkuNotFound, "Inventory SKU not found: "+normalized, nil)
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

	if item == nil {
		if req.DeltaOnHand <= 0 {
			return nil, httpx.NewAppError(http.StatusNotFound, domain.ErrorCodeInventorySkuNotFound, "Inventory SKU not found: "+normalized, nil)
		}
		if req.ProductID == nil || req.SellerID == nil || strings.TrimSpace(*req.ProductID) == "" || strings.TrimSpace(*req.SellerID) == "" {
			return nil, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeInventoryInvalidAdjustment, "productId and sellerId are required when creating stock", nil)
		}
		if !isUUID(*req.ProductID) || !isUUID(*req.SellerID) {
			return nil, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "productId and sellerId must be valid UUID", nil)
		}

		item = &domain.InventoryItem{
			SKU:       normalized,
			ProductID: strings.TrimSpace(*req.ProductID),
			SellerID:  strings.TrimSpace(*req.SellerID),
			OnHand:    req.DeltaOnHand,
			Reserved:  0,
		}
		if err := s.repo.InsertInventoryItem(ctx, tx, item); err != nil {
			return nil, err
		}
	} else {
		if req.ExpectedVersion != nil && *req.ExpectedVersion != item.Version {
			return nil, httpx.NewAppError(http.StatusConflict, domain.ErrorCodeConflict, "Version conflict for SKU "+normalized, nil)
		}

		nextOnHand := item.OnHand + req.DeltaOnHand
		if nextOnHand < 0 || nextOnHand-item.Reserved < 0 {
			return nil, httpx.NewAppError(http.StatusUnprocessableEntity, domain.ErrorCodeInventoryNegativeStock, "Stock adjustment causes negative available quantity for SKU "+normalized, nil)
		}

		item.OnHand = nextOnHand
		if req.ProductID != nil && strings.TrimSpace(*req.ProductID) != "" {
			if !isUUID(*req.ProductID) {
				return nil, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "productId must be valid UUID", nil)
			}
			item.ProductID = strings.TrimSpace(*req.ProductID)
		}
		if req.SellerID != nil && strings.TrimSpace(*req.SellerID) != "" {
			if !isUUID(*req.SellerID) {
				return nil, httpx.NewAppError(http.StatusBadRequest, domain.ErrorCodeBadRequest, "sellerId must be valid UUID", nil)
			}
			item.SellerID = strings.TrimSpace(*req.SellerID)
		}

		if err := s.repo.UpdateInventoryItem(ctx, tx, item); err != nil {
			return nil, err
		}
	}

	movement := domain.InventoryMovement{
		SKU:           item.SKU,
		OrderID:       nil,
		MovementType:  domain.InventoryMovementTypeAdjust,
		DeltaOnHand:   req.DeltaOnHand,
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
			"deltaOnHand": req.DeltaOnHand,
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

	existing, err := s.repo.FindActiveReservationsByOrderIDForUpdate(ctx, tx, orderID)
	if err != nil {
		return nil, err
	}
	if len(existing) > 0 {
		if isSameReservation(existing, items) {
			if err := tx.Commit(ctx); err != nil {
				return nil, err
			}
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

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return toReservationResponse(orderID, savedReservations, false, nil), nil
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
