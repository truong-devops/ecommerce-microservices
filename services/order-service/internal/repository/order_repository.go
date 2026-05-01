package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"order-service/internal/domain"
	"order-service/internal/httpx"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type OrderRepository struct {
	pool *pgxpool.Pool
}

type CreateOrderInput struct {
	OrderNumber    string
	UserID         string
	Status         domain.OrderStatus
	Currency       string
	SubtotalAmount float64
	ShippingAmount float64
	DiscountAmount float64
	TotalAmount    float64
	Note           *string
}

type CreateOrderItemInput struct {
	ProductID           string
	SKU                 string
	ProductNameSnapshot string
	Quantity            int
	UnitPrice           float64
	TotalPrice          float64
}

type CreateStatusHistoryInput struct {
	OrderID       string
	FromStatus    *domain.OrderStatus
	ToStatus      domain.OrderStatus
	ChangedBy     string
	ChangedByRole domain.Role
	Reason        *string
}

type CreateAuditLogInput struct {
	OrderID    string
	Action     string
	ActorID    string
	ActorRole  domain.Role
	RequestID  string
	Metadata   map[string]any
	OccurredAt time.Time
}

type CreateOutboxEventInput struct {
	AggregateType string
	AggregateID   string
	EventType     string
	Payload       map[string]any
}

type ListOrdersQuery struct {
	Page      int
	PageSize  int
	Status    *domain.OrderStatus
	SortBy    string
	SortOrder string
	UserID    *string
	Search    *string
}

type IdempotencyRecord struct {
	ID             string
	UserID         string
	IdempotencyKey string
	RequestHash    string
	OrderID        *string
	ResponseStatus *int
	ResponseBody   map[string]any
	ExpiresAt      time.Time
	CreatedAt      time.Time
}

func NewOrderRepository(pool *pgxpool.Pool) *OrderRepository {
	return &OrderRepository{pool: pool}
}

func (r *OrderRepository) Ping(ctx context.Context) error {
	return r.pool.Ping(ctx)
}

func (r *OrderRepository) BeginTx(ctx context.Context) (pgx.Tx, error) {
	return r.pool.BeginTx(ctx, pgx.TxOptions{})
}

func (r *OrderRepository) CreateOrder(ctx context.Context, tx pgx.Tx, input CreateOrderInput) (domain.Order, error) {
	row := tx.QueryRow(ctx, `
		INSERT INTO orders (
			order_number, user_id, status, currency,
			subtotal_amount, shipping_amount, discount_amount, total_amount, note
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		RETURNING id, order_number, user_id, status, currency,
			subtotal_amount, shipping_amount, discount_amount, total_amount, note,
			created_at, updated_at
	`,
		input.OrderNumber,
		input.UserID,
		input.Status,
		input.Currency,
		input.SubtotalAmount,
		input.ShippingAmount,
		input.DiscountAmount,
		input.TotalAmount,
		input.Note,
	)

	order, err := scanOrderRow(row)
	if err != nil {
		return domain.Order{}, queryFailed("create order failed", err)
	}
	return order, nil
}

func (r *OrderRepository) CreateOrderItems(ctx context.Context, tx pgx.Tx, orderID string, items []CreateOrderItemInput) ([]domain.OrderItem, error) {
	if len(items) == 0 {
		return []domain.OrderItem{}, nil
	}

	query := `
		INSERT INTO order_items (
			order_id, product_id, sku, product_name_snapshot,
			quantity, unit_price, total_price
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING id, order_id, product_id, sku, product_name_snapshot, quantity, unit_price, total_price
	`

	out := make([]domain.OrderItem, 0, len(items))
	for _, item := range items {
		row := tx.QueryRow(ctx, query,
			orderID,
			item.ProductID,
			item.SKU,
			item.ProductNameSnapshot,
			item.Quantity,
			item.UnitPrice,
			item.TotalPrice,
		)

		saved, err := scanOrderItemRow(row)
		if err != nil {
			return nil, queryFailed("create order item failed", err)
		}
		out = append(out, saved)
	}

	return out, nil
}

func (r *OrderRepository) InsertStatusHistory(ctx context.Context, tx pgx.Tx, input CreateStatusHistoryInput) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO order_status_histories (
			order_id, from_status, to_status, changed_by, changed_by_role, reason
		)
		VALUES ($1,$2,$3,$4,$5,$6)
	`, input.OrderID, input.FromStatus, input.ToStatus, input.ChangedBy, input.ChangedByRole, input.Reason)
	if err != nil {
		return queryFailed("insert order status history failed", err)
	}
	return nil
}

func (r *OrderRepository) InsertAuditLog(ctx context.Context, tx pgx.Tx, input CreateAuditLogInput) error {
	metadataJSON, err := toJSONB(input.Metadata)
	if err != nil {
		return queryFailed("marshal audit metadata failed", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO order_audit_logs (
			order_id, action, actor_id, actor_role, request_id, metadata
		)
		VALUES ($1,$2,$3,$4,$5,$6)
	`, input.OrderID, input.Action, input.ActorID, input.ActorRole, input.RequestID, metadataJSON)
	if err != nil {
		return queryFailed("insert order audit log failed", err)
	}
	return nil
}

func (r *OrderRepository) InsertOutboxEvent(ctx context.Context, tx pgx.Tx, input CreateOutboxEventInput) error {
	payload, err := toJSONB(input.Payload)
	if err != nil {
		return queryFailed("marshal outbox payload failed", err)
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO outbox_events (
			aggregate_type, aggregate_id, event_type, payload
		)
		VALUES ($1,$2,$3,$4)
	`, input.AggregateType, input.AggregateID, input.EventType, payload)
	if err != nil {
		return queryFailed("insert outbox event failed", err)
	}
	return nil
}

func (r *OrderRepository) FindOrderByID(ctx context.Context, id string) (*domain.Order, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, order_number, user_id, status, currency,
			subtotal_amount, shipping_amount, discount_amount, total_amount, note,
			created_at, updated_at
		FROM orders
		WHERE id = $1
	`, id)

	order, err := scanOrderRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, queryFailed("get order by id failed", err)
	}

	items, err := r.ListOrderItems(ctx, nil, order.ID)
	if err != nil {
		return nil, err
	}
	order.Items = items
	return &order, nil
}

func (r *OrderRepository) FindOrderByIDForUpdate(ctx context.Context, tx pgx.Tx, id string) (*domain.Order, error) {
	row := tx.QueryRow(ctx, `
		SELECT id, order_number, user_id, status, currency,
			subtotal_amount, shipping_amount, discount_amount, total_amount, note,
			created_at, updated_at
		FROM orders
		WHERE id = $1
		FOR UPDATE
	`, id)

	order, err := scanOrderRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, queryFailed("get order by id for update failed", err)
	}

	items, err := r.ListOrderItems(ctx, tx, order.ID)
	if err != nil {
		return nil, err
	}
	order.Items = items
	return &order, nil
}

func (r *OrderRepository) ListOrderItems(ctx context.Context, tx pgx.Tx, orderID string) ([]domain.OrderItem, error) {
	queryer := tx
	if queryer == nil {
		rows, err := r.pool.Query(ctx, `
			SELECT id, order_id, product_id, sku, product_name_snapshot, quantity, unit_price, total_price
			FROM order_items
			WHERE order_id = $1
			ORDER BY id ASC
		`, orderID)
		if err != nil {
			return nil, queryFailed("list order items failed", err)
		}
		defer rows.Close()

		items := make([]domain.OrderItem, 0)
		for rows.Next() {
			item, scanErr := scanOrderItemRow(rows)
			if scanErr != nil {
				return nil, queryFailed("scan order item failed", scanErr)
			}
			items = append(items, item)
		}
		if err := rows.Err(); err != nil {
			return nil, queryFailed("iterate order items failed", err)
		}
		return items, nil
	}

	rows, err := queryer.Query(ctx, `
		SELECT id, order_id, product_id, sku, product_name_snapshot, quantity, unit_price, total_price
		FROM order_items
		WHERE order_id = $1
		ORDER BY id ASC
	`, orderID)
	if err != nil {
		return nil, queryFailed("list order items failed", err)
	}
	defer rows.Close()

	items := make([]domain.OrderItem, 0)
	for rows.Next() {
		item, scanErr := scanOrderItemRow(rows)
		if scanErr != nil {
			return nil, queryFailed("scan order item failed", scanErr)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, queryFailed("iterate order items failed", err)
	}
	return items, nil
}

func (r *OrderRepository) UpdateOrderStatus(ctx context.Context, tx pgx.Tx, orderID string, status domain.OrderStatus) (domain.Order, error) {
	row := tx.QueryRow(ctx, `
		UPDATE orders
		SET status = $2, updated_at = now()
		WHERE id = $1
		RETURNING id, order_number, user_id, status, currency,
			subtotal_amount, shipping_amount, discount_amount, total_amount, note,
			created_at, updated_at
	`, orderID, status)

	order, err := scanOrderRow(row)
	if err != nil {
		return domain.Order{}, queryFailed("update order status failed", err)
	}

	items, err := r.ListOrderItems(ctx, tx, order.ID)
	if err != nil {
		return domain.Order{}, err
	}
	order.Items = items
	return order, nil
}

func (r *OrderRepository) ListOrders(ctx context.Context, query ListOrdersQuery, forcedUserID *string) ([]domain.Order, int, error) {
	where := []string{"1=1"}
	args := make([]any, 0)

	if query.Status != nil {
		args = append(args, *query.Status)
		where = append(where, fmt.Sprintf("status = $%d", len(args)))
	}

	if forcedUserID != nil {
		args = append(args, *forcedUserID)
		where = append(where, fmt.Sprintf("user_id = $%d", len(args)))
	} else if query.UserID != nil {
		args = append(args, *query.UserID)
		where = append(where, fmt.Sprintf("user_id = $%d", len(args)))
	}

	if query.Search != nil {
		search := "%" + strings.TrimSpace(*query.Search) + "%"
		args = append(args, search)
		where = append(where, fmt.Sprintf("order_number ILIKE $%d", len(args)))
	}

	whereSQL := strings.Join(where, " AND ")

	countQuery := "SELECT COUNT(*) FROM orders WHERE " + whereSQL
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, queryFailed("count orders failed", err)
	}

	sortCol := "created_at"
	switch query.SortBy {
	case "totalAmount":
		sortCol = "total_amount"
	case "orderNumber":
		sortCol = "order_number"
	}

	orderDir := "DESC"
	if strings.ToUpper(strings.TrimSpace(query.SortOrder)) == "ASC" {
		orderDir = "ASC"
	}

	args = append(args, query.PageSize, (query.Page-1)*query.PageSize)
	offsetPos := len(args) - 1
	limitPos := len(args)

	rows, err := r.pool.Query(ctx, `
		SELECT id, order_number, user_id, status, currency,
			subtotal_amount, shipping_amount, discount_amount, total_amount, note,
			created_at, updated_at
		FROM orders
		WHERE `+whereSQL+`
		ORDER BY `+sortCol+` `+orderDir+`
		OFFSET $`+fmt.Sprint(offsetPos)+`
		LIMIT $`+fmt.Sprint(limitPos), args...)
	if err != nil {
		return nil, 0, queryFailed("list orders failed", err)
	}
	defer rows.Close()

	orders := make([]domain.Order, 0)
	ids := make([]string, 0)
	for rows.Next() {
		order, scanErr := scanOrderRow(rows)
		if scanErr != nil {
			return nil, 0, queryFailed("scan order failed", scanErr)
		}
		orders = append(orders, order)
		ids = append(ids, order.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, queryFailed("iterate orders failed", err)
	}

	itemsByOrder, err := r.listOrderItemsByOrderIDs(ctx, ids)
	if err != nil {
		return nil, 0, err
	}
	for i := range orders {
		orders[i].Items = itemsByOrder[orders[i].ID]
	}

	return orders, total, nil
}

func (r *OrderRepository) ListOrderStatusHistory(ctx context.Context, orderID string) ([]domain.OrderStatusHistory, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, order_id, from_status, to_status, changed_by, changed_by_role, reason, created_at
		FROM order_status_histories
		WHERE order_id = $1
		ORDER BY created_at ASC
	`, orderID)
	if err != nil {
		return nil, queryFailed("list order history failed", err)
	}
	defer rows.Close()

	out := make([]domain.OrderStatusHistory, 0)
	for rows.Next() {
		item, scanErr := scanOrderStatusHistoryRow(rows)
		if scanErr != nil {
			return nil, queryFailed("scan order history failed", scanErr)
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, queryFailed("iterate order history failed", err)
	}
	return out, nil
}

func (r *OrderRepository) FindIdempotencyRecord(ctx context.Context, userID, key string) (*IdempotencyRecord, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, user_id, idempotency_key, request_hash, order_id,
			response_status, response_body, expires_at, created_at
		FROM idempotency_records
		WHERE user_id = $1 AND idempotency_key = $2
	`, userID, key)

	record, err := scanIdempotencyRecordRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, queryFailed("get idempotency record failed", err)
	}
	return &record, nil
}

func (r *OrderRepository) CreateIdempotencyRecord(ctx context.Context, tx pgx.Tx, record IdempotencyRecord) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO idempotency_records (
			user_id, idempotency_key, request_hash, order_id,
			response_status, response_body, expires_at
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
	`,
		record.UserID,
		record.IdempotencyKey,
		record.RequestHash,
		record.OrderID,
		record.ResponseStatus,
		mustJSONB(record.ResponseBody),
		record.ExpiresAt,
	)
	if err != nil {
		return queryFailed("create idempotency record failed", err)
	}
	return nil
}

func (r *OrderRepository) UpdateIdempotencyResult(ctx context.Context, tx pgx.Tx, userID, key string, requestHash string, responseStatus int, responseBody map[string]any, orderID string, expiresAt time.Time) error {
	payload, err := toJSONB(responseBody)
	if err != nil {
		return queryFailed("marshal idempotency response failed", err)
	}
	_, err = tx.Exec(ctx, `
		UPDATE idempotency_records
		SET response_status = $4,
			response_body = $5,
			order_id = $6,
			expires_at = $7
		WHERE user_id = $1 AND idempotency_key = $2 AND request_hash = $3
	`, userID, key, requestHash, responseStatus, payload, orderID, expiresAt)
	if err != nil {
		return queryFailed("update idempotency result failed", err)
	}
	return nil
}

func (r *OrderRepository) FindDispatchableOutboxEvents(ctx context.Context, batchSize int) ([]domain.OutboxEvent, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, aggregate_type, aggregate_id, event_type, payload, status,
			retry_count, next_retry_at, created_at, published_at
		FROM outbox_events
		WHERE status = $1
			OR (status = $2 AND next_retry_at IS NOT NULL AND next_retry_at <= now())
		ORDER BY created_at ASC
		LIMIT $3
	`, domain.OutboxStatusPending, domain.OutboxStatusFailed, batchSize)
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

func (r *OrderRepository) MarkOutboxPublished(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE outbox_events
		SET status = $2, published_at = now(), next_retry_at = NULL
		WHERE id = $1
	`, id, domain.OutboxStatusPublished)
	if err != nil {
		return queryFailed("mark outbox published failed", err)
	}
	return nil
}

func (r *OrderRepository) MarkOutboxFailed(ctx context.Context, id string, retryCount int, nextRetryAt *time.Time) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE outbox_events
		SET status = $2, retry_count = $3, next_retry_at = $4
		WHERE id = $1
	`, id, domain.OutboxStatusFailed, retryCount, nextRetryAt)
	if err != nil {
		return queryFailed("mark outbox failed failed", err)
	}
	return nil
}

func (r *OrderRepository) listOrderItemsByOrderIDs(ctx context.Context, orderIDs []string) (map[string][]domain.OrderItem, error) {
	result := map[string][]domain.OrderItem{}
	if len(orderIDs) == 0 {
		return result, nil
	}

	rows, err := r.pool.Query(ctx, `
		SELECT id, order_id, product_id, sku, product_name_snapshot, quantity, unit_price, total_price
		FROM order_items
		WHERE order_id = ANY($1)
		ORDER BY id ASC
	`, orderIDs)
	if err != nil {
		return nil, queryFailed("list order items by ids failed", err)
	}
	defer rows.Close()

	for rows.Next() {
		item, scanErr := scanOrderItemRow(rows)
		if scanErr != nil {
			return nil, queryFailed("scan order item failed", scanErr)
		}
		result[item.OrderID] = append(result[item.OrderID], item)
	}
	if err := rows.Err(); err != nil {
		return nil, queryFailed("iterate order items failed", err)
	}

	for _, id := range orderIDs {
		if _, ok := result[id]; !ok {
			result[id] = []domain.OrderItem{}
		}
	}
	return result, nil
}

func scanOrderRow(row interface{ Scan(dest ...any) error }) (domain.Order, error) {
	var order domain.Order
	var subtotal pgtype.Numeric
	var shipping pgtype.Numeric
	var discount pgtype.Numeric
	var total pgtype.Numeric
	var note *string
	var status string

	err := row.Scan(
		&order.ID,
		&order.OrderNumber,
		&order.UserID,
		&status,
		&order.Currency,
		&subtotal,
		&shipping,
		&discount,
		&total,
		&note,
		&order.CreatedAt,
		&order.UpdatedAt,
	)
	if err != nil {
		return domain.Order{}, err
	}

	order.Status = domain.OrderStatus(status)
	order.SubtotalAmount = numericToFloat64(subtotal)
	order.ShippingAmount = numericToFloat64(shipping)
	order.DiscountAmount = numericToFloat64(discount)
	order.TotalAmount = numericToFloat64(total)
	order.Note = note
	if order.Items == nil {
		order.Items = []domain.OrderItem{}
	}
	return order, nil
}

func scanOrderItemRow(row interface{ Scan(dest ...any) error }) (domain.OrderItem, error) {
	var item domain.OrderItem
	var unitPrice pgtype.Numeric
	var totalPrice pgtype.Numeric

	err := row.Scan(
		&item.ID,
		&item.OrderID,
		&item.ProductID,
		&item.SKU,
		&item.ProductNameSnapshot,
		&item.Quantity,
		&unitPrice,
		&totalPrice,
	)
	if err != nil {
		return domain.OrderItem{}, err
	}
	item.UnitPrice = numericToFloat64(unitPrice)
	item.TotalPrice = numericToFloat64(totalPrice)
	return item, nil
}

func scanOrderStatusHistoryRow(row interface{ Scan(dest ...any) error }) (domain.OrderStatusHistory, error) {
	var history domain.OrderStatusHistory
	var fromStatus *string
	var toStatus string
	var role string
	var reason *string

	err := row.Scan(
		&history.ID,
		&history.OrderID,
		&fromStatus,
		&toStatus,
		&history.ChangedBy,
		&role,
		&reason,
		&history.CreatedAt,
	)
	if err != nil {
		return domain.OrderStatusHistory{}, err
	}

	if fromStatus != nil {
		v := domain.OrderStatus(*fromStatus)
		history.FromStatus = &v
	}
	history.ToStatus = domain.OrderStatus(toStatus)
	history.ChangedByRole = domain.Role(role)
	history.Reason = reason
	return history, nil
}

func scanIdempotencyRecordRow(row interface{ Scan(dest ...any) error }) (IdempotencyRecord, error) {
	var record IdempotencyRecord
	var responseBody []byte

	err := row.Scan(
		&record.ID,
		&record.UserID,
		&record.IdempotencyKey,
		&record.RequestHash,
		&record.OrderID,
		&record.ResponseStatus,
		&responseBody,
		&record.ExpiresAt,
		&record.CreatedAt,
	)
	if err != nil {
		return IdempotencyRecord{}, err
	}

	if len(responseBody) > 0 {
		if err := json.Unmarshal(responseBody, &record.ResponseBody); err != nil {
			return IdempotencyRecord{}, err
		}
	}

	return record, nil
}

func scanOutboxEventRow(row interface{ Scan(dest ...any) error }) (domain.OutboxEvent, error) {
	var event domain.OutboxEvent
	var payload []byte
	var status string

	err := row.Scan(
		&event.ID,
		&event.AggregateType,
		&event.AggregateID,
		&event.EventType,
		&payload,
		&status,
		&event.RetryCount,
		&event.NextRetryAt,
		&event.CreatedAt,
		&event.PublishedAt,
	)
	if err != nil {
		return domain.OutboxEvent{}, err
	}

	event.Status = domain.OutboxStatus(status)
	if len(payload) > 0 {
		if err := json.Unmarshal(payload, &event.Payload); err != nil {
			return domain.OutboxEvent{}, err
		}
	}
	if event.Payload == nil {
		event.Payload = map[string]any{}
	}
	return event, nil
}

func numericToFloat64(n pgtype.Numeric) float64 {
	f, err := n.Float64Value()
	if err != nil || !f.Valid {
		return 0
	}
	return f.Float64
}

func toJSONB(value any) ([]byte, error) {
	if value == nil {
		return nil, nil
	}
	return json.Marshal(value)
}

func mustJSONB(value any) []byte {
	if value == nil {
		return nil
	}
	b, _ := json.Marshal(value)
	return b
}

func queryFailed(message string, err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return httpx.NewAppError(500, domain.ErrorCodeServiceUnavailable, message, map[string]any{"pgCode": pgErr.Code})
	}
	return httpx.NewAppError(500, domain.ErrorCodeServiceUnavailable, message, nil)
}
