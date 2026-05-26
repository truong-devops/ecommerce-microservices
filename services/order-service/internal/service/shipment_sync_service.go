package service

import (
	"context"
	"strings"

	"order-service/internal/domain"
	"order-service/internal/repository"

	"go.uber.org/zap"
)

const (
	EventShipmentStatusUpdated = "shipment.status-updated"
	EventShipmentDelivered     = "shipment.delivered"

	shipmentEventsConsumerName = "order-service-shipping-events"
)

type ShipmentEvent struct {
	OrderID        string
	ShipmentID     string
	Status         string
	AWB            string
	TrackingNumber string
}

// HandleShipmentStatusUpdated projects shipment progress onto the buyer-facing
// order lifecycle while preserving the order transition rules.
func (s *OrderSagaService) HandleShipmentStatusUpdated(ctx context.Context, event ShipmentEvent, meta SagaEventMeta) error {
	orderID := strings.TrimSpace(event.OrderID)
	targetStatus, ok := targetOrderStatusForShipment(event.Status)
	if orderID == "" || !ok {
		return nil
	}

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	alreadyProcessed, err := s.repo.TryMarkEventProcessed(ctx, tx, repository.ProcessedEventInput{
		ConsumerName: shipmentEventsConsumerName,
		EventID:      meta.EventID,
		EventType:    meta.EventType,
		Topic:        meta.Topic,
		Partition:    meta.Partition,
		OffsetValue:  meta.OffsetValue,
	})
	if err != nil {
		return err
	}
	if alreadyProcessed {
		return tx.Commit(ctx)
	}

	order, err := s.repo.FindOrderByIDForUpdate(ctx, tx, orderID)
	if err != nil {
		return err
	}
	if order == nil {
		return tx.Commit(ctx)
	}

	transitions := orderTransitionsForShipment(order.Status, targetStatus)
	if len(transitions) == 0 {
		return tx.Commit(ctx)
	}

	current := *order
	actor := domain.UserContext{UserID: orderSagaSystemActorID, Role: domain.RoleSuperAdmin}
	reason := stringPtr("Shipment status synchronized from " + strings.ToUpper(strings.TrimSpace(event.Status)))
	for _, status := range transitions {
		previousStatus := current.Status
		current, err = s.repo.UpdateOrderStatus(ctx, tx, current.ID, status)
		if err != nil {
			return err
		}
		if err := s.repo.InsertStatusHistory(ctx, tx, repository.CreateStatusHistoryInput{
			OrderID:       current.ID,
			FromStatus:    &previousStatus,
			ToStatus:      status,
			ChangedBy:     actor.UserID,
			ChangedByRole: actor.Role,
			Reason:        reason,
		}); err != nil {
			return err
		}
		if err := s.repo.InsertAuditLog(ctx, tx, repository.CreateAuditLogInput{
			OrderID:   current.ID,
			Action:    "SHIPMENT_STATUS_SYNCED",
			ActorID:   actor.UserID,
			ActorRole: actor.Role,
			RequestID: requestIDOrDefault(meta),
			Metadata: map[string]any{
				"eventType":      meta.EventType,
				"shipmentId":     event.ShipmentID,
				"shipmentStatus": strings.ToUpper(strings.TrimSpace(event.Status)),
				"awb":            event.AWB,
				"fromStatus":     previousStatus,
				"toStatus":       status,
			},
			OccurredAt: s.defaultStatusTime(),
		}); err != nil {
			return err
		}
		if err := insertOrderStatusUpdatedEvent(ctx, s.repo, tx, current, actor, requestIDOrDefault(meta)); err != nil {
			return err
		}
		if status == domain.OrderStatusDelivered {
			if err := insertOrderDeliveredEvent(ctx, s.repo, tx, current, actor, requestIDOrDefault(meta)); err != nil {
				return err
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}
	s.logger.Info("shipment status synchronized to order",
		zap.String("requestId", requestIDOrDefault(meta)),
		zap.String("orderId", orderID),
		zap.String("shipmentStatus", strings.ToUpper(strings.TrimSpace(event.Status))),
		zap.String("orderStatus", string(current.Status)),
	)
	return nil
}

func targetOrderStatusForShipment(status string) (domain.OrderStatus, bool) {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "AWB_CREATED":
		return domain.OrderStatusProcessing, true
	case "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY":
		return domain.OrderStatusShipped, true
	case "DELIVERED":
		return domain.OrderStatusDelivered, true
	default:
		return "", false
	}
}

func orderTransitionsForShipment(current, target domain.OrderStatus) []domain.OrderStatus {
	progress := []domain.OrderStatus{
		domain.OrderStatusConfirmed,
		domain.OrderStatusProcessing,
		domain.OrderStatusShipped,
		domain.OrderStatusDelivered,
	}
	currentIndex := -1
	targetIndex := -1
	for index, status := range progress {
		if status == current {
			currentIndex = index
		}
		if status == target {
			targetIndex = index
		}
	}
	if currentIndex < 0 || targetIndex <= currentIndex {
		return nil
	}
	return progress[currentIndex+1 : targetIndex+1]
}
