package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"order-service/internal/domain"
	"order-service/internal/metrics"
	"order-service/internal/repository"

	"github.com/jackc/pgx/v5"
	"go.uber.org/zap"
)

const (
	EventInventoryReserved          = "inventory.reserved"
	EventInventoryReservationFailed = "inventory.reservation-failed"
	EventInventoryExpired           = "inventory.expired"
	EventPaymentCaptured            = "payment.captured"
	EventPaymentFailed              = "payment.failed"

	orderSagaSystemActorID = "00000000-0000-0000-0000-000000000000"
)

type SagaEventMeta struct {
	EventID     string
	EventType   string
	Topic       string
	Partition   int
	OffsetValue int64
	RequestID   string
}

type InventoryReservedEvent struct {
	OrderID string
}

type InventoryFailureEvent struct {
	OrderID string
	Reason  string
	Message string
}

type PaymentEvent struct {
	OrderID   string
	PaymentID string
	Status    string
}

type OrderSagaService struct {
	repo              *repository.OrderRepository
	logger            *zap.Logger
	sagaMetrics       *metrics.CheckoutSagaMetrics
	defaultStatusTime func() time.Time
}

func NewOrderSagaService(repo *repository.OrderRepository, logger *zap.Logger, sagaMetrics ...*metrics.CheckoutSagaMetrics) *OrderSagaService {
	if logger == nil {
		logger = zap.NewNop()
	}
	var checkoutMetrics *metrics.CheckoutSagaMetrics
	if len(sagaMetrics) > 0 {
		checkoutMetrics = sagaMetrics[0]
	}
	return &OrderSagaService{
		repo:              repo,
		logger:            logger,
		sagaMetrics:       checkoutMetrics,
		defaultStatusTime: func() time.Time { return time.Now().UTC() },
	}
}

func (s *OrderSagaService) HandleInventoryReserved(ctx context.Context, event InventoryReservedEvent, meta SagaEventMeta) error {
	return s.withSagaState(ctx, strings.TrimSpace(event.OrderID), meta, func(order domain.Order, state *domain.OrderSagaState) (domain.OrderStatus, *string) {
		state.InventoryStatus = domain.SagaInventoryStatusReserved
		state.InventoryEventID = stringPtr(eventIDOrOffset(meta))
		if canConfirmCheckout(state) && order.Status == domain.OrderStatusPending {
			state.SagaStatus = domain.SagaStatusCompleted
			return domain.OrderStatusConfirmed, stringPtr("Inventory reserved and mock payment captured")
		}
		return "", nil
	})
}

func (s *OrderSagaService) HandleInventoryReservationFailed(ctx context.Context, event InventoryFailureEvent, meta SagaEventMeta) error {
	return s.withSagaState(ctx, strings.TrimSpace(event.OrderID), meta, func(order domain.Order, state *domain.OrderSagaState) (domain.OrderStatus, *string) {
		state.InventoryStatus = domain.SagaInventoryStatusFailed
		state.InventoryEventID = stringPtr(eventIDOrOffset(meta))
		state.SagaStatus = domain.SagaStatusFailed
		state.FailureCode = stringPtr(trimOrDefault(event.Reason, domain.ErrorCodeValidationFailed))
		state.FailureReason = stringPtr(trimOrDefault(event.Message, "Inventory reservation failed"))
		if order.Status == domain.OrderStatusPending {
			return domain.OrderStatusFailed, stringPtr(trimOrDefault(event.Message, "Inventory reservation failed"))
		}
		return "", nil
	})
}

func (s *OrderSagaService) HandleInventoryExpired(ctx context.Context, event InventoryFailureEvent, meta SagaEventMeta) error {
	return s.withSagaState(ctx, strings.TrimSpace(event.OrderID), meta, func(order domain.Order, state *domain.OrderSagaState) (domain.OrderStatus, *string) {
		state.InventoryStatus = domain.SagaInventoryStatusExpired
		state.InventoryEventID = stringPtr(eventIDOrOffset(meta))
		state.SagaStatus = domain.SagaStatusFailed
		state.FailureCode = stringPtr("INVENTORY_RESERVATION_EXPIRED")
		state.FailureReason = stringPtr(trimOrDefault(event.Message, "Inventory reservation expired"))
		if order.Status == domain.OrderStatusPending {
			return domain.OrderStatusFailed, stringPtr("Inventory reservation expired")
		}
		return "", nil
	})
}

func (s *OrderSagaService) HandlePaymentCaptured(ctx context.Context, event PaymentEvent, meta SagaEventMeta) error {
	return s.withSagaState(ctx, strings.TrimSpace(event.OrderID), meta, func(order domain.Order, state *domain.OrderSagaState) (domain.OrderStatus, *string) {
		state.PaymentStatus = domain.SagaPaymentStatusCaptured
		state.PaymentEventID = stringPtr(eventIDOrOffset(meta))
		if canConfirmCheckout(state) && order.Status == domain.OrderStatusPending {
			state.SagaStatus = domain.SagaStatusCompleted
			return domain.OrderStatusConfirmed, stringPtr("Inventory reserved and mock payment captured")
		}
		return "", nil
	})
}

func (s *OrderSagaService) HandlePaymentFailed(ctx context.Context, event PaymentEvent, meta SagaEventMeta) error {
	return s.withSagaState(ctx, strings.TrimSpace(event.OrderID), meta, func(order domain.Order, state *domain.OrderSagaState) (domain.OrderStatus, *string) {
		state.PaymentStatus = domain.SagaPaymentStatusFailed
		state.PaymentEventID = stringPtr(eventIDOrOffset(meta))
		state.SagaStatus = domain.SagaStatusFailed
		state.FailureCode = stringPtr("PAYMENT_FAILED")
		state.FailureReason = stringPtr("Mock payment failed")
		if order.Status == domain.OrderStatusPending {
			return domain.OrderStatusFailed, stringPtr("Mock payment failed")
		}
		return "", nil
	})
}

func (s *OrderSagaService) FailStalePendingSagas(ctx context.Context, timeoutAfter time.Duration, batchSize int) (int, error) {
	if timeoutAfter <= 0 || batchSize <= 0 {
		return 0, nil
	}
	orderIDs, err := s.repo.FindStalePendingSagaOrderIDs(ctx, time.Now().UTC().Add(-timeoutAfter), batchSize)
	if err != nil {
		return 0, err
	}
	s.sagaMetrics.SetStuckPendingTotal(len(orderIDs))

	failed := 0
	for _, orderID := range orderIDs {
		if err := s.failSagaTimeout(ctx, orderID); err != nil {
			return failed, err
		}
		failed++
	}
	return failed, nil
}

func (s *OrderSagaService) failSagaTimeout(ctx context.Context, orderID string) error {
	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	order, err := s.repo.FindOrderByIDForUpdate(ctx, tx, orderID)
	if err != nil {
		return err
	}
	if order == nil || order.Status != domain.OrderStatusPending {
		return tx.Commit(ctx)
	}

	state, err := s.repo.FindOrderSagaStateForUpdate(ctx, tx, orderID)
	if err != nil {
		return err
	}
	if state == nil || state.SagaStatus != domain.SagaStatusPending {
		return tx.Commit(ctx)
	}

	state.SagaStatus = domain.SagaStatusFailed
	state.FailureCode = stringPtr("CHECKOUT_SAGA_TIMEOUT")
	state.FailureReason = stringPtr("Checkout saga timed out")

	updatedOrder, err := s.repo.UpdateOrderStatus(ctx, tx, order.ID, domain.OrderStatusFailed)
	if err != nil {
		return err
	}
	if err := s.repo.InsertStatusHistory(ctx, tx, repository.CreateStatusHistoryInput{
		OrderID:       order.ID,
		FromStatus:    &order.Status,
		ToStatus:      domain.OrderStatusFailed,
		ChangedBy:     orderSagaSystemActorID,
		ChangedByRole: domain.RoleSuperAdmin,
		Reason:        stringPtr("Checkout saga timed out"),
	}); err != nil {
		return err
	}
	if err := s.repo.InsertAuditLog(ctx, tx, repository.CreateAuditLogInput{
		OrderID:   order.ID,
		Action:    "CHECKOUT_SAGA_TIMEOUT",
		ActorID:   orderSagaSystemActorID,
		ActorRole: domain.RoleSuperAdmin,
		RequestID: "checkout-saga-timeout",
		Metadata: map[string]any{
			"inventoryStatus": state.InventoryStatus,
			"paymentStatus":   state.PaymentStatus,
			"sagaStatus":      state.SagaStatus,
		},
		OccurredAt: s.defaultStatusTime(),
	}); err != nil {
		return err
	}
	if err := insertOrderStatusUpdatedEvent(ctx, s.repo, tx, updatedOrder, domain.UserContext{UserID: orderSagaSystemActorID, Role: domain.RoleSuperAdmin}, "checkout-saga-timeout"); err != nil {
		return err
	}
	if err := s.repo.UpdateOrderSagaState(ctx, tx, *state); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	s.logger.Warn("checkout saga timed out",
		zap.String("orderId", order.ID),
		zap.String("fromStatus", string(order.Status)),
		zap.String("toStatus", string(domain.OrderStatusFailed)),
		zap.String("sagaStatus", string(state.SagaStatus)),
		zap.String("inventoryStatus", string(state.InventoryStatus)),
		zap.String("paymentStatus", string(state.PaymentStatus)),
	)
	s.sagaMetrics.IncFailed()
	s.observeSagaDuration(*state)
	return nil
}

func (s *OrderSagaService) withSagaState(
	ctx context.Context,
	orderID string,
	meta SagaEventMeta,
	apply func(order domain.Order, state *domain.OrderSagaState) (domain.OrderStatus, *string),
) error {
	if orderID == "" {
		return nil
	}

	tx, err := s.repo.BeginTx(ctx)
	if err != nil {
		return err
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
		return err
	}
	if alreadyProcessed {
		s.sagaMetrics.IncDuplicateEvent()
		s.logger.Info("checkout saga duplicate event skipped",
			zap.String("requestId", requestIDOrDefault(meta)),
			zap.String("eventId", eventIDOrOffset(meta)),
			zap.String("eventType", meta.EventType),
			zap.String("orderId", orderID),
		)
		return tx.Commit(ctx)
	}

	order, err := s.repo.FindOrderByIDForUpdate(ctx, tx, orderID)
	if err != nil {
		return err
	}
	if order == nil {
		return tx.Commit(ctx)
	}

	state, err := s.repo.FindOrderSagaStateForUpdate(ctx, tx, orderID)
	if err != nil {
		return err
	}
	if state == nil {
		if err := s.repo.CreateOrderSagaState(ctx, tx, orderID); err != nil {
			return err
		}
		state, err = s.repo.FindOrderSagaStateForUpdate(ctx, tx, orderID)
		if err != nil || state == nil {
			return err
		}
	}

	nextStatus, reason := apply(*order, state)
	fromStatus := order.Status
	var updatedOrder domain.Order
	if nextStatus != "" && nextStatus != order.Status {
		updatedOrder, err = s.repo.UpdateOrderStatus(ctx, tx, order.ID, nextStatus)
		if err != nil {
			return err
		}
		if err := s.repo.InsertStatusHistory(ctx, tx, repository.CreateStatusHistoryInput{
			OrderID:       order.ID,
			FromStatus:    &order.Status,
			ToStatus:      nextStatus,
			ChangedBy:     orderSagaSystemActorID,
			ChangedByRole: domain.RoleSuperAdmin,
			Reason:        reason,
		}); err != nil {
			return err
		}
		if err := s.repo.InsertAuditLog(ctx, tx, repository.CreateAuditLogInput{
			OrderID:   order.ID,
			Action:    "CHECKOUT_SAGA_STATUS_UPDATED",
			ActorID:   orderSagaSystemActorID,
			ActorRole: domain.RoleSuperAdmin,
			RequestID: requestIDOrDefault(meta),
			Metadata: map[string]any{
				"eventType":       meta.EventType,
				"inventoryStatus": state.InventoryStatus,
				"paymentStatus":   state.PaymentStatus,
				"sagaStatus":      state.SagaStatus,
			},
			OccurredAt: s.defaultStatusTime(),
		}); err != nil {
			return err
		}
		if err := insertOrderStatusUpdatedEvent(ctx, s.repo, tx, updatedOrder, domain.UserContext{UserID: orderSagaSystemActorID, Role: domain.RoleSuperAdmin}, requestIDOrDefault(meta)); err != nil {
			return err
		}
	}

	if err := s.repo.UpdateOrderSagaState(ctx, tx, *state); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}
	s.logger.Info("checkout saga event applied",
		zap.String("requestId", requestIDOrDefault(meta)),
		zap.String("eventId", eventIDOrOffset(meta)),
		zap.String("eventType", meta.EventType),
		zap.String("orderId", order.ID),
		zap.String("sagaStatus", string(state.SagaStatus)),
		zap.String("inventoryStatus", string(state.InventoryStatus)),
		zap.String("paymentStatus", string(state.PaymentStatus)),
		zap.String("fromStatus", string(fromStatus)),
		zap.String("toStatus", string(nextStatus)),
	)
	if state.SagaStatus == domain.SagaStatusCompleted {
		s.sagaMetrics.IncConfirmed()
		s.observeSagaDuration(*state)
	}
	if state.SagaStatus == domain.SagaStatusFailed {
		s.sagaMetrics.IncFailed()
		s.observeSagaDuration(*state)
	}
	return nil
}

func (s *OrderSagaService) observeSagaDuration(state domain.OrderSagaState) {
	if state.CreatedAt.IsZero() {
		return
	}
	s.sagaMetrics.ObserveDurationMillis(time.Since(state.CreatedAt).Milliseconds())
}

func insertOrderStatusUpdatedEvent(ctx context.Context, repo *repository.OrderRepository, tx pgx.Tx, order domain.Order, actor domain.UserContext, requestID string) error {
	return repo.InsertOutboxEvent(ctx, tx, repository.CreateOutboxEventInput{
		AggregateType: "order",
		AggregateID:   order.ID,
		EventType:     EventOrderStatusUpdated,
		Payload: map[string]any{
			"orderId":        order.ID,
			"orderNumber":    order.OrderNumber,
			"orderCode":      formatOrderCode(order.OrderNumber, order.ID),
			"userId":         order.UserID,
			"userCode":       formatCode(order.UserID, "CUS"),
			"status":         order.Status,
			"subtotalAmount": order.SubtotalAmount,
			"shippingAmount": order.ShippingAmount,
			"discountAmount": order.DiscountAmount,
			"totalAmount":    order.TotalAmount,
			"currency":       order.Currency,
			"items":          mapOrderItemsForEvent(order.Items),
			"metadata": map[string]any{
				"requestId":  requestID,
				"occurredAt": time.Now().UTC().Format(time.RFC3339Nano),
				"actorId":    actor.UserID,
				"actorRole":  actor.Role,
			},
		},
	})
}

func eventIDOrOffset(meta SagaEventMeta) string {
	if strings.TrimSpace(meta.EventID) != "" {
		return strings.TrimSpace(meta.EventID)
	}
	return fmt.Sprintf("%s:%d:%d", meta.Topic, meta.Partition, meta.OffsetValue)
}

func requestIDOrDefault(meta SagaEventMeta) string {
	if strings.TrimSpace(meta.RequestID) != "" {
		return strings.TrimSpace(meta.RequestID)
	}
	return eventIDOrOffset(meta)
}

func trimOrDefault(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}

func stringPtr(value string) *string {
	v := value
	return &v
}

func canConfirmCheckout(state *domain.OrderSagaState) bool {
	return state != nil &&
		state.InventoryStatus == domain.SagaInventoryStatusReserved &&
		state.PaymentStatus == domain.SagaPaymentStatusCaptured
}
