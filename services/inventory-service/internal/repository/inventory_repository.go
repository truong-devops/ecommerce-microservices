package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"inventory-service/internal/domain"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type InventoryRepository struct {
	db *pgxpool.Pool
}

type txQuerier interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

type CreateOutboxEventInput struct {
	AggregateType string
	AggregateID   string
	EventType     string
	Payload       map[string]any
}

type ProcessedEventInput struct {
	ConsumerName string
	EventID      string
	EventType    string
	Topic        string
	Partition    int
	OffsetValue  int64
}

func NewInventoryRepository(db *pgxpool.Pool) *InventoryRepository {
	return &InventoryRepository{db: db}
}

func (r *InventoryRepository) BeginTx(ctx context.Context) (pgx.Tx, error) {
	return r.db.BeginTx(ctx, pgx.TxOptions{})
}

func (r *InventoryRepository) Ping(ctx context.Context) error {
	return r.db.Ping(ctx)
}

func (r *InventoryRepository) FindInventoryBySKU(ctx context.Context, sku string) (*domain.InventoryItem, error) {
	return r.findInventoryBySKU(ctx, r.db, sku, false)
}

func (r *InventoryRepository) FindInventoryBySKUForUpdate(ctx context.Context, tx pgx.Tx, sku string) (*domain.InventoryItem, error) {
	return r.findInventoryBySKU(ctx, tx, sku, true)
}

func (r *InventoryRepository) findInventoryBySKU(ctx context.Context, q txQuerier, sku string, forUpdate bool) (*domain.InventoryItem, error) {
	sql := `
		SELECT id, sku, product_id, seller_id, on_hand, reserved, version, created_at, updated_at
		FROM inventory_items
		WHERE sku = $1
	`
	if forUpdate {
		sql += " FOR UPDATE"
	}

	row := q.QueryRow(ctx, sql, sku)
	var item domain.InventoryItem
	if err := row.Scan(&item.ID, &item.SKU, &item.ProductID, &item.SellerID, &item.OnHand, &item.Reserved, &item.Version, &item.CreatedAt, &item.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, queryFailed("find inventory by sku failed", err)
	}
	return &item, nil
}

func (r *InventoryRepository) InsertInventoryItem(ctx context.Context, tx pgx.Tx, item *domain.InventoryItem) error {
	row := tx.QueryRow(ctx, `
		INSERT INTO inventory_items (
			sku, product_id, seller_id, on_hand, reserved
		) VALUES ($1, $2, $3, $4, $5)
		RETURNING id, version, created_at, updated_at
	`, item.SKU, item.ProductID, item.SellerID, item.OnHand, item.Reserved)

	if err := row.Scan(&item.ID, &item.Version, &item.CreatedAt, &item.UpdatedAt); err != nil {
		return queryFailed("insert inventory item failed", err)
	}
	return nil
}

func (r *InventoryRepository) UpdateInventoryItem(ctx context.Context, tx pgx.Tx, item *domain.InventoryItem) error {
	row := tx.QueryRow(ctx, `
		UPDATE inventory_items
		SET product_id = $2,
		    seller_id = $3,
		    on_hand = $4,
		    reserved = $5,
		    version = version + 1,
		    updated_at = now()
		WHERE sku = $1
		RETURNING version, updated_at
	`, item.SKU, item.ProductID, item.SellerID, item.OnHand, item.Reserved)

	if err := row.Scan(&item.Version, &item.UpdatedAt); err != nil {
		return queryFailed("update inventory item failed", err)
	}
	return nil
}

func (r *InventoryRepository) SaveMovements(ctx context.Context, tx pgx.Tx, movements []domain.InventoryMovement) error {
	for _, m := range movements {
		if _, err := tx.Exec(ctx, `
			INSERT INTO inventory_movements (
				sku, order_id, movement_type, delta_on_hand, delta_reserved,
				reason, actor_id, actor_role, request_id
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		`, m.SKU, m.OrderID, m.MovementType, m.DeltaOnHand, m.DeltaReserved, m.Reason, m.ActorID, m.ActorRole, m.RequestID); err != nil {
			return queryFailed("insert inventory movement failed", err)
		}
	}
	return nil
}

func (r *InventoryRepository) FindActiveReservationsByOrderID(ctx context.Context, orderID string) ([]domain.InventoryReservation, error) {
	return r.findActiveReservationsByOrderID(ctx, r.db, orderID, false)
}

func (r *InventoryRepository) FindActiveReservationsByOrderIDForUpdate(ctx context.Context, tx pgx.Tx, orderID string) ([]domain.InventoryReservation, error) {
	return r.findActiveReservationsByOrderID(ctx, tx, orderID, true)
}

func (r *InventoryRepository) findActiveReservationsByOrderID(ctx context.Context, q txQuerier, orderID string, forUpdate bool) ([]domain.InventoryReservation, error) {
	sql := `
		SELECT id, order_id, sku, quantity, status, expires_at, request_id, created_at, updated_at
		FROM inventory_reservations
		WHERE order_id = $1 AND status = 'ACTIVE'
		ORDER BY sku ASC
	`
	if forUpdate {
		sql += " FOR UPDATE"
	}
	rows, err := q.Query(ctx, sql, orderID)
	if err != nil {
		return nil, queryFailed("find active reservations failed", err)
	}
	defer rows.Close()

	out := make([]domain.InventoryReservation, 0)
	for rows.Next() {
		var item domain.InventoryReservation
		var status string
		if err := rows.Scan(&item.ID, &item.OrderID, &item.SKU, &item.Quantity, &status, &item.ExpiresAt, &item.RequestID, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, queryFailed("scan reservation failed", err)
		}
		item.Status = domain.InventoryReservationStatus(status)
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, queryFailed("iterate reservations failed", err)
	}
	return out, nil
}

func (r *InventoryRepository) FindExpiredActiveReservations(ctx context.Context, limit int) ([]domain.InventoryReservation, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, order_id, sku, quantity, status, expires_at, request_id, created_at, updated_at
		FROM inventory_reservations
		WHERE status = 'ACTIVE' AND expires_at <= now()
		ORDER BY expires_at ASC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, queryFailed("find expired active reservations failed", err)
	}
	defer rows.Close()

	out := make([]domain.InventoryReservation, 0)
	for rows.Next() {
		var item domain.InventoryReservation
		var status string
		if err := rows.Scan(&item.ID, &item.OrderID, &item.SKU, &item.Quantity, &status, &item.ExpiresAt, &item.RequestID, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, queryFailed("scan reservation failed", err)
		}
		item.Status = domain.InventoryReservationStatus(status)
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, queryFailed("iterate reservations failed", err)
	}
	return out, nil
}

func (r *InventoryRepository) InsertReservations(ctx context.Context, tx pgx.Tx, items []domain.InventoryReservation) ([]domain.InventoryReservation, error) {
	out := make([]domain.InventoryReservation, 0, len(items))
	for _, item := range items {
		row := tx.QueryRow(ctx, `
			INSERT INTO inventory_reservations (
				order_id, sku, quantity, status, expires_at, request_id
			) VALUES ($1,$2,$3,$4,$5,$6)
			RETURNING id, created_at, updated_at
		`, item.OrderID, item.SKU, item.Quantity, item.Status, item.ExpiresAt, item.RequestID)

		saved := item
		if err := row.Scan(&saved.ID, &saved.CreatedAt, &saved.UpdatedAt); err != nil {
			return nil, queryFailed("insert reservation failed", err)
		}
		out = append(out, saved)
	}
	return out, nil
}

func (r *InventoryRepository) UpdateReservationStatus(ctx context.Context, tx pgx.Tx, id string, status domain.InventoryReservationStatus, requestID string) error {
	_, err := tx.Exec(ctx, `
		UPDATE inventory_reservations
		SET status = $2, request_id = $3, updated_at = now()
		WHERE id = $1
	`, id, status, requestID)
	if err != nil {
		return queryFailed("update reservation status failed", err)
	}
	return nil
}

func (r *InventoryRepository) InsertOutboxEvent(ctx context.Context, tx pgx.Tx, input CreateOutboxEventInput) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO outbox_events (
			aggregate_type, aggregate_id, event_type, payload
		) VALUES ($1, $2, $3, $4)
	`, input.AggregateType, input.AggregateID, input.EventType, input.Payload)
	if err != nil {
		return queryFailed("insert outbox event failed", err)
	}
	return nil
}

func (r *InventoryRepository) TryMarkEventProcessed(ctx context.Context, tx pgx.Tx, input ProcessedEventInput) (bool, error) {
	consumerName := input.ConsumerName
	if consumerName == "" {
		consumerName = "inventory-service"
	}
	eventID := input.EventID
	if eventID == "" {
		eventID = fmt.Sprintf("%s:%d:%d", input.Topic, input.Partition, input.OffsetValue)
	}
	tag, err := tx.Exec(ctx, `
		INSERT INTO processed_events (
			consumer_name, event_id, event_type, topic, partition, offset_value
		) VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT DO NOTHING
	`, consumerName, eventID, input.EventType, input.Topic, input.Partition, input.OffsetValue)
	if err != nil {
		return false, queryFailed("mark event processed failed", err)
	}
	return tag.RowsAffected() == 0, nil
}

func (r *InventoryRepository) FindDispatchableOutboxEvents(ctx context.Context, limit int) ([]domain.OutboxEvent, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, aggregate_type, aggregate_id, event_type, payload, status, retry_count, next_retry_at, created_at, published_at
		FROM outbox_events
		WHERE event_type LIKE 'inventory.%'
			AND (status = 'PENDING' OR (status = 'FAILED' AND next_retry_at IS NOT NULL AND next_retry_at <= now()))
		ORDER BY created_at ASC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, queryFailed("find dispatchable outbox events failed", err)
	}
	defer rows.Close()

	out := make([]domain.OutboxEvent, 0)
	for rows.Next() {
		event, scanErr := scanOutboxEventRow(rows)
		if scanErr != nil {
			return nil, queryFailed("scan outbox event failed", scanErr)
		}
		out = append(out, event)
	}
	if err := rows.Err(); err != nil {
		return nil, queryFailed("iterate outbox events failed", err)
	}
	return out, nil
}

func (r *InventoryRepository) MarkOutboxPublished(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE outbox_events
		SET status = 'PUBLISHED', published_at = now(), next_retry_at = NULL
		WHERE id = $1
	`, id)
	if err != nil {
		return queryFailed("mark outbox published failed", err)
	}
	return nil
}

func (r *InventoryRepository) MarkOutboxFailed(ctx context.Context, id string, retryCount int, nextRetryAt *time.Time) error {
	_, err := r.db.Exec(ctx, `
		UPDATE outbox_events
		SET status = 'FAILED', retry_count = $2, next_retry_at = $3
		WHERE id = $1
	`, id, retryCount, nextRetryAt)
	if err != nil {
		return queryFailed("mark outbox failed failed", err)
	}
	return nil
}

func scanOutboxEventRow(row interface {
	Scan(dest ...any) error
}) (domain.OutboxEvent, error) {
	var event domain.OutboxEvent
	var payload []byte
	var status string
	var nextRetryAt *time.Time
	var publishedAt *time.Time

	if err := row.Scan(
		&event.ID,
		&event.AggregateType,
		&event.AggregateID,
		&event.EventType,
		&payload,
		&status,
		&event.RetryCount,
		&nextRetryAt,
		&event.CreatedAt,
		&publishedAt,
	); err != nil {
		return domain.OutboxEvent{}, err
	}

	event.Status = domain.OutboxStatus(status)
	if len(payload) > 0 {
		if err := json.Unmarshal(payload, &event.Payload); err != nil {
			return domain.OutboxEvent{}, fmt.Errorf("unmarshal payload: %w", err)
		}
	}
	if event.Payload == nil {
		event.Payload = map[string]any{}
	}
	event.NextRetryAt = nextRetryAt
	event.PublishedAt = publishedAt
	return event, nil
}

func queryFailed(message string, err error) error {
	return fmt.Errorf("%s: %w", message, err)
}
