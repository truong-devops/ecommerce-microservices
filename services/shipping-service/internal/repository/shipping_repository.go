package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"shipping-service/internal/domain"
	"shipping-service/internal/httpx"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ShippingRepository struct {
	pool *pgxpool.Pool
}

type ListShipmentsQuery struct {
	Page     int
	PageSize int

	Status   *domain.ShipmentStatus
	Provider *string
	OrderID  *string
	BuyerID  *string
	SellerID *string
	Search   *string

	SortBy    string
	SortOrder string
}

type CreateShipmentInput struct {
	OrderID          string
	BuyerID          string
	SellerID         string
	Provider         string
	AWB              *string
	TrackingNumber   *string
	Status           domain.ShipmentStatus
	Currency         string
	ShippingFee      float64
	CODAmount        float64
	RecipientName    string
	RecipientPhone   string
	RecipientAddress string
	Note             *string
	Metadata         map[string]any
}

type CreateTrackingEventInput struct {
	ShipmentID  string
	Status      domain.ShipmentStatus
	EventCode   *string
	Description *string
	Location    *string
	OccurredAt  time.Time
	RawPayload  map[string]any
}

type CreateStatusHistoryInput struct {
	ShipmentID    string
	FromStatus    *domain.ShipmentStatus
	ToStatus      domain.ShipmentStatus
	ChangedBy     string
	ChangedByRole domain.Role
	Reason        *string
}

type CreateAuditLogInput struct {
	ShipmentID string
	Action     string
	ActorID    string
	ActorRole  domain.Role
	RequestID  string
	Metadata   map[string]any
}

type CreateOutboxEventInput struct {
	AggregateType string
	AggregateID   string
	EventType     string
	Payload       map[string]any
}

type CreateWebhookIdempotencyInput struct {
	Provider        string
	ProviderEventID string
	RequestHash     string
	ShipmentID      *string
	ResponseStatus  *int
	ResponseBody    map[string]any
	ExpiresAt       time.Time
}

func NewShippingRepository(pool *pgxpool.Pool) *ShippingRepository {
	return &ShippingRepository{pool: pool}
}

func (r *ShippingRepository) Ping(ctx context.Context) error {
	return r.pool.Ping(ctx)
}

func (r *ShippingRepository) BeginTx(ctx context.Context) (pgx.Tx, error) {
	return r.pool.BeginTx(ctx, pgx.TxOptions{})
}

func (r *ShippingRepository) FindShipmentByID(ctx context.Context, shipmentID string) (*domain.Shipment, error) {
	row := r.pool.QueryRow(ctx, shipmentSelect+" WHERE id = $1", shipmentID)
	shipment, err := scanShipmentRow(row)
	if err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, queryFailed("find shipment by id failed", err)
	}
	return &shipment, nil
}

func (r *ShippingRepository) FindShipmentByIDForUpdate(ctx context.Context, tx pgx.Tx, shipmentID string) (*domain.Shipment, error) {
	row := tx.QueryRow(ctx, shipmentSelect+" WHERE id = $1 FOR UPDATE", shipmentID)
	shipment, err := scanShipmentRow(row)
	if err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, queryFailed("find shipment for update failed", err)
	}
	return &shipment, nil
}

func (r *ShippingRepository) FindShipmentByOrderID(ctx context.Context, orderID string, tx pgx.Tx) (*domain.Shipment, error) {
	row := pickQuerier(r.pool, tx).QueryRow(ctx, shipmentSelect+" WHERE order_id = $1", orderID)
	shipment, err := scanShipmentRow(row)
	if err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, queryFailed("find shipment by order id failed", err)
	}
	return &shipment, nil
}

func (r *ShippingRepository) FindShipmentByAWB(ctx context.Context, awb string, tx pgx.Tx) (*domain.Shipment, error) {
	row := pickQuerier(r.pool, tx).QueryRow(ctx, shipmentSelect+" WHERE awb = $1", awb)
	shipment, err := scanShipmentRow(row)
	if err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, queryFailed("find shipment by awb failed", err)
	}
	return &shipment, nil
}

func (r *ShippingRepository) FindShipmentByTrackingNumber(ctx context.Context, trackingNumber string, tx pgx.Tx) (*domain.Shipment, error) {
	row := pickQuerier(r.pool, tx).QueryRow(ctx, shipmentSelect+" WHERE tracking_number = $1", trackingNumber)
	shipment, err := scanShipmentRow(row)
	if err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, queryFailed("find shipment by tracking number failed", err)
	}
	return &shipment, nil
}

func (r *ShippingRepository) CreateShipment(ctx context.Context, tx pgx.Tx, input CreateShipmentInput) (domain.Shipment, error) {
	metadataJSON, err := toJSONB(input.Metadata)
	if err != nil {
		return domain.Shipment{}, queryFailed("marshal shipment metadata failed", err)
	}

	row := tx.QueryRow(ctx, `
		INSERT INTO shipments (
			order_id, buyer_id, seller_id, provider, awb, tracking_number,
			status, currency, shipping_fee, cod_amount,
			recipient_name, recipient_phone, recipient_address, note, metadata
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
		RETURNING id, order_id, buyer_id, seller_id, provider, awb, tracking_number,
			status, currency, shipping_fee, cod_amount,
			recipient_name, recipient_phone, recipient_address, note, metadata,
			created_at, updated_at
	`, input.OrderID, input.BuyerID, input.SellerID, input.Provider, input.AWB, input.TrackingNumber, input.Status,
		input.Currency, input.ShippingFee, input.CODAmount,
		input.RecipientName, input.RecipientPhone, input.RecipientAddress, input.Note, metadataJSON)

	shipment, err := scanShipmentRow(row)
	if err != nil {
		return domain.Shipment{}, queryFailed("create shipment failed", err)
	}
	return shipment, nil
}

func (r *ShippingRepository) UpdateShipmentStatus(ctx context.Context, tx pgx.Tx, shipmentID string, status domain.ShipmentStatus) (domain.Shipment, error) {
	row := tx.QueryRow(ctx, `
		UPDATE shipments
		SET status = $2, updated_at = now()
		WHERE id = $1
		RETURNING id, order_id, buyer_id, seller_id, provider, awb, tracking_number,
			status, currency, shipping_fee, cod_amount,
			recipient_name, recipient_phone, recipient_address, note, metadata,
			created_at, updated_at
	`, shipmentID, status)

	shipment, err := scanShipmentRow(row)
	if err != nil {
		if isNoRows(err) {
			return domain.Shipment{}, httpx.NewAppError(404, domain.ErrorCodeNotFound, "Shipment not found", nil)
		}
		return domain.Shipment{}, queryFailed("update shipment status failed", err)
	}

	return shipment, nil
}

func (r *ShippingRepository) ListShipments(ctx context.Context, q ListShipmentsQuery) ([]domain.Shipment, int, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PageSize < 1 {
		q.PageSize = 20
	}

	where := make([]string, 0, 8)
	args := make([]any, 0, 10)
	idx := 1

	if q.Status != nil {
		where = append(where, fmt.Sprintf("status = $%d", idx))
		args = append(args, *q.Status)
		idx++
	}
	if q.Provider != nil {
		where = append(where, fmt.Sprintf("provider = $%d", idx))
		args = append(args, *q.Provider)
		idx++
	}
	if q.OrderID != nil {
		where = append(where, fmt.Sprintf("order_id = $%d", idx))
		args = append(args, *q.OrderID)
		idx++
	}
	if q.BuyerID != nil {
		where = append(where, fmt.Sprintf("buyer_id = $%d", idx))
		args = append(args, *q.BuyerID)
		idx++
	}
	if q.SellerID != nil {
		where = append(where, fmt.Sprintf("seller_id = $%d", idx))
		args = append(args, *q.SellerID)
		idx++
	}
	if q.Search != nil {
		search := "%" + strings.TrimSpace(*q.Search) + "%"
		where = append(where, fmt.Sprintf(`(
			CAST(order_id AS text) ILIKE $%d
			OR awb ILIKE $%d
			OR tracking_number ILIKE $%d
			OR recipient_name ILIKE $%d
		)`, idx, idx, idx, idx))
		args = append(args, search)
		idx++
	}

	whereSQL := ""
	if len(where) > 0 {
		whereSQL = " WHERE " + strings.Join(where, " AND ")
	}

	countQuery := "SELECT count(*) FROM shipments" + whereSQL
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, queryFailed("count shipments failed", err)
	}

	sortBy := "created_at"
	switch q.SortBy {
	case "shippingFee":
		sortBy = "shipping_fee"
	case "status":
		sortBy = "status"
	}

	sortOrder := "DESC"
	if strings.EqualFold(q.SortOrder, "ASC") {
		sortOrder = "ASC"
	}

	offset := (q.Page - 1) * q.PageSize
	listQuery := shipmentSelect + whereSQL + fmt.Sprintf(" ORDER BY %s %s OFFSET $%d LIMIT $%d", sortBy, sortOrder, idx, idx+1)
	args = append(args, offset, q.PageSize)

	rows, err := r.pool.Query(ctx, listQuery, args...)
	if err != nil {
		return nil, 0, queryFailed("list shipments failed", err)
	}
	defer rows.Close()

	items := make([]domain.Shipment, 0)
	for rows.Next() {
		shipment, scanErr := scanShipmentRows(rows)
		if scanErr != nil {
			return nil, 0, queryFailed("scan shipment failed", scanErr)
		}
		items = append(items, shipment)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, queryFailed("iterate shipments failed", err)
	}

	return items, total, nil
}

func (r *ShippingRepository) CreateTrackingEvent(ctx context.Context, tx pgx.Tx, input CreateTrackingEventInput) (domain.ShipmentTrackingEvent, error) {
	rawPayload, err := toJSONB(input.RawPayload)
	if err != nil {
		return domain.ShipmentTrackingEvent{}, queryFailed("marshal tracking raw payload failed", err)
	}

	row := tx.QueryRow(ctx, `
		INSERT INTO shipment_tracking_events (
			shipment_id, status, event_code, description, location, occurred_at, raw_payload
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING id, shipment_id, status, event_code, description, location, occurred_at, raw_payload, created_at
	`, input.ShipmentID, input.Status, input.EventCode, input.Description, input.Location, input.OccurredAt, rawPayload)

	event, err := scanTrackingEventRow(row)
	if err != nil {
		return domain.ShipmentTrackingEvent{}, queryFailed("create tracking event failed", err)
	}
	return event, nil
}

func (r *ShippingRepository) ListTrackingEvents(ctx context.Context, shipmentID string) ([]domain.ShipmentTrackingEvent, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, shipment_id, status, event_code, description, location, occurred_at, raw_payload, created_at
		FROM shipment_tracking_events
		WHERE shipment_id = $1
		ORDER BY occurred_at DESC
	`, shipmentID)
	if err != nil {
		return nil, queryFailed("list tracking events failed", err)
	}
	defer rows.Close()

	out := make([]domain.ShipmentTrackingEvent, 0)
	for rows.Next() {
		event, scanErr := scanTrackingEventRows(rows)
		if scanErr != nil {
			return nil, queryFailed("scan tracking event failed", scanErr)
		}
		out = append(out, event)
	}
	if err := rows.Err(); err != nil {
		return nil, queryFailed("iterate tracking events failed", err)
	}

	return out, nil
}

func (r *ShippingRepository) InsertStatusHistory(ctx context.Context, tx pgx.Tx, input CreateStatusHistoryInput) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO shipment_status_histories (
			shipment_id, from_status, to_status, changed_by, changed_by_role, reason
		)
		VALUES ($1,$2,$3,$4,$5,$6)
	`, input.ShipmentID, input.FromStatus, input.ToStatus, input.ChangedBy, input.ChangedByRole, input.Reason)
	if err != nil {
		return queryFailed("insert shipment status history failed", err)
	}
	return nil
}

func (r *ShippingRepository) InsertAuditLog(ctx context.Context, tx pgx.Tx, input CreateAuditLogInput) error {
	metadataJSON, err := toJSONB(input.Metadata)
	if err != nil {
		return queryFailed("marshal audit metadata failed", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO shipment_audit_logs (
			shipment_id, action, actor_id, actor_role, request_id, metadata
		)
		VALUES ($1,$2,$3,$4,$5,$6)
	`, input.ShipmentID, input.Action, input.ActorID, input.ActorRole, input.RequestID, metadataJSON)
	if err != nil {
		return queryFailed("insert shipment audit log failed", err)
	}
	return nil
}

func (r *ShippingRepository) InsertOutboxEvent(ctx context.Context, tx pgx.Tx, input CreateOutboxEventInput) error {
	payloadJSON, err := toJSONB(input.Payload)
	if err != nil {
		return queryFailed("marshal outbox payload failed", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO outbox_events (
			aggregate_type, aggregate_id, event_type, payload
		)
		VALUES ($1,$2,$3,$4)
	`, input.AggregateType, input.AggregateID, input.EventType, payloadJSON)
	if err != nil {
		return queryFailed("insert outbox event failed", err)
	}
	return nil
}

func (r *ShippingRepository) FindDispatchableOutboxEvents(ctx context.Context, batchSize int) ([]domain.OutboxEvent, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, aggregate_type, aggregate_id, event_type, payload, status,
			retry_count, next_retry_at, created_at, published_at
		FROM outbox_events
		WHERE status = 'PENDING'
			OR (status = 'FAILED' AND next_retry_at IS NOT NULL AND next_retry_at <= now())
		ORDER BY created_at ASC
		LIMIT $1
	`, batchSize)
	if err != nil {
		return nil, queryFailed("find dispatchable outbox events failed", err)
	}
	defer rows.Close()

	out := make([]domain.OutboxEvent, 0)
	for rows.Next() {
		event, scanErr := scanOutboxEventRows(rows)
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

func (r *ShippingRepository) MarkOutboxPublished(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE outbox_events
		SET status = 'PUBLISHED', published_at = now(), next_retry_at = NULL
		WHERE id = $1
	`, id)
	if err != nil {
		return queryFailed("mark outbox published failed", err)
	}
	return nil
}

func (r *ShippingRepository) MarkOutboxFailed(ctx context.Context, id string, retryCount int, nextRetryAt *time.Time) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE outbox_events
		SET status = 'FAILED', retry_count = $2, next_retry_at = $3
		WHERE id = $1
	`, id, retryCount, nextRetryAt)
	if err != nil {
		return queryFailed("mark outbox failed failed", err)
	}
	return nil
}

func (r *ShippingRepository) FindUnexpiredWebhookRecord(ctx context.Context, provider, providerEventID string) (*domain.WebhookIdempotencyRecord, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, provider, provider_event_id, request_hash, shipment_id,
			response_status, response_body, expires_at, created_at
		FROM webhook_idempotency_records
		WHERE provider = $1 AND provider_event_id = $2 AND expires_at > now()
	`, provider, providerEventID)

	record, err := scanWebhookRecordRow(row)
	if err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, queryFailed("find unexpired webhook record failed", err)
	}
	return &record, nil
}

func (r *ShippingRepository) FindWebhookRecord(ctx context.Context, provider, providerEventID string) (*domain.WebhookIdempotencyRecord, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, provider, provider_event_id, request_hash, shipment_id,
			response_status, response_body, expires_at, created_at
		FROM webhook_idempotency_records
		WHERE provider = $1 AND provider_event_id = $2
	`, provider, providerEventID)

	record, err := scanWebhookRecordRow(row)
	if err != nil {
		if isNoRows(err) {
			return nil, nil
		}
		return nil, queryFailed("find webhook record failed", err)
	}
	return &record, nil
}

func (r *ShippingRepository) InsertWebhookRecord(ctx context.Context, tx pgx.Tx, input CreateWebhookIdempotencyInput) error {
	respBody, err := toJSONB(input.ResponseBody)
	if err != nil {
		return queryFailed("marshal webhook response body failed", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO webhook_idempotency_records (
			provider, provider_event_id, request_hash, shipment_id,
			response_status, response_body, expires_at
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
	`, input.Provider, input.ProviderEventID, input.RequestHash, input.ShipmentID, input.ResponseStatus, respBody, input.ExpiresAt)
	if err != nil {
		return queryFailed("insert webhook idempotency record failed", err)
	}
	return nil
}

func (r *ShippingRepository) IsUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if ok := errors.As(err, &pgErr); ok {
		return pgErr.Code == "23505"
	}
	return false
}

type querier interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}

func pickQuerier(pool *pgxpool.Pool, tx pgx.Tx) querier {
	if tx != nil {
		return tx
	}
	return pool
}

const shipmentSelect = `
	SELECT id, order_id, buyer_id, seller_id, provider, awb, tracking_number,
		status, currency, shipping_fee, cod_amount,
		recipient_name, recipient_phone, recipient_address, note, metadata,
		created_at, updated_at
	FROM shipments
`

func scanShipmentRows(rows pgx.Rows) (domain.Shipment, error) {
	return scanShipment(
		rows.Scan,
	)
}

func scanShipmentRow(row pgx.Row) (domain.Shipment, error) {
	return scanShipment(
		row.Scan,
	)
}

func scanShipment(scanFn func(dest ...any) error) (domain.Shipment, error) {
	var s domain.Shipment
	var status string
	var shippingFee float64
	var codAmount float64
	var metadataRaw []byte

	err := scanFn(
		&s.ID,
		&s.OrderID,
		&s.BuyerID,
		&s.SellerID,
		&s.Provider,
		&s.AWB,
		&s.TrackingNumber,
		&status,
		&s.Currency,
		&shippingFee,
		&codAmount,
		&s.RecipientName,
		&s.RecipientPhone,
		&s.RecipientAddress,
		&s.Note,
		&metadataRaw,
		&s.CreatedAt,
		&s.UpdatedAt,
	)
	if err != nil {
		return domain.Shipment{}, err
	}

	s.Status = domain.ShipmentStatus(status)
	s.ShippingFee = shippingFee
	s.CODAmount = codAmount
	meta, err := parseJSONMap(metadataRaw)
	if err != nil {
		return domain.Shipment{}, err
	}
	s.Metadata = meta
	return s, nil
}

func scanTrackingEventRows(rows pgx.Rows) (domain.ShipmentTrackingEvent, error) {
	return scanTrackingEvent(rows.Scan)
}

func scanTrackingEventRow(row pgx.Row) (domain.ShipmentTrackingEvent, error) {
	return scanTrackingEvent(row.Scan)
}

func scanTrackingEvent(scanFn func(dest ...any) error) (domain.ShipmentTrackingEvent, error) {
	var e domain.ShipmentTrackingEvent
	var status string
	var rawPayload []byte
	if err := scanFn(&e.ID, &e.ShipmentID, &status, &e.EventCode, &e.Description, &e.Location, &e.OccurredAt, &rawPayload, &e.CreatedAt); err != nil {
		return domain.ShipmentTrackingEvent{}, err
	}
	e.Status = domain.ShipmentStatus(status)
	m, err := parseJSONMap(rawPayload)
	if err != nil {
		return domain.ShipmentTrackingEvent{}, err
	}
	e.RawPayload = m
	return e, nil
}

func scanOutboxEventRows(rows pgx.Rows) (domain.OutboxEvent, error) {
	var event domain.OutboxEvent
	var payloadRaw []byte
	var status string
	if err := rows.Scan(&event.ID, &event.AggregateType, &event.AggregateID, &event.EventType, &payloadRaw, &status, &event.RetryCount, &event.NextRetryAt, &event.CreatedAt, &event.PublishedAt); err != nil {
		return domain.OutboxEvent{}, err
	}
	m, err := parseJSONMap(payloadRaw)
	if err != nil {
		return domain.OutboxEvent{}, err
	}
	event.Payload = m
	event.Status = domain.OutboxStatus(status)
	return event, nil
}

func scanWebhookRecordRow(row pgx.Row) (domain.WebhookIdempotencyRecord, error) {
	var rec domain.WebhookIdempotencyRecord
	var rawBody []byte
	if err := row.Scan(&rec.ID, &rec.Provider, &rec.ProviderEventID, &rec.RequestHash, &rec.ShipmentID, &rec.ResponseStatus, &rawBody, &rec.ExpiresAt, &rec.CreatedAt); err != nil {
		return domain.WebhookIdempotencyRecord{}, err
	}
	body, err := parseJSONMap(rawBody)
	if err != nil {
		return domain.WebhookIdempotencyRecord{}, err
	}
	rec.ResponseBody = body
	return rec, nil
}

func toJSONB(value map[string]any) ([]byte, error) {
	if value == nil {
		return []byte("null"), nil
	}
	return json.Marshal(value)
}

func parseJSONMap(raw []byte) (map[string]any, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func isNoRows(err error) bool {
	return err == pgx.ErrNoRows
}

func queryFailed(message string, err error) error {
	if err == nil {
		return nil
	}
	return &httpx.AppError{
		Status:  500,
		Code:    domain.ErrorCodeInternalServerError,
		Message: message,
		Details: map[string]any{"error": err.Error()},
		Err:     err,
	}
}
