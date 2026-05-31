package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"payment-service-go/internal/domain"
	"payment-service-go/internal/httpx"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PaymentRepository struct {
	pool *pgxpool.Pool
}

type IdempotencyRecord struct {
	ID             string
	UserID         string
	IdempotencyKey string
	RequestHash    string
	PaymentID      *string
	ResponseStatus *int
	ResponseBody   map[string]any
	ExpiresAt      time.Time
	CreatedAt      time.Time
}

type WebhookIdempotencyRecord struct {
	ID              string
	Provider        string
	ProviderEventID string
	RequestHash     string
	PaymentID       *string
	ResponseStatus  *int
	ResponseBody    map[string]any
	ExpiresAt       time.Time
	CreatedAt       time.Time
}

type PaymentProviderEvent struct {
	ID                   string
	Provider             string
	ProviderEventID      string
	GatewayTransactionID *string
	ProviderPaymentID    *string
	PaymentID            *string
	EventType            string
	ProcessStatus        string
	FailureCode          *string
	FailureReason        *string
	CreatedAt            time.Time
	ProcessedAt          *time.Time
}

type ReconciliationCursor struct {
	Provider     string
	SinceID      *string
	LastSyncedAt *time.Time
	UpdatedAt    time.Time
}

type CreatePaymentInput struct {
	OrderID           string
	UserID            string
	SellerID          *string
	Provider          string
	ProviderPaymentID *string
	Status            domain.PaymentStatus
	Currency          string
	Amount            float64
	RefundedAmount    float64
	Description       *string
	Metadata          map[string]any
	ExpiresAt         *time.Time
	CapturedAt        *time.Time
}

type CreatePaymentTransactionInput struct {
	PaymentID            string
	TransactionType      string
	GatewayTransactionID *string
	Amount               float64
	Currency             string
	Status               string
	RequestID            string
	RawPayload           map[string]any
}

type CreatePaymentStatusHistoryInput struct {
	PaymentID     string
	FromStatus    *domain.PaymentStatus
	ToStatus      domain.PaymentStatus
	ChangedBy     string
	ChangedByRole domain.Role
	Reason        *string
}

type CreatePaymentAuditLogInput struct {
	PaymentID string
	Action    string
	ActorID   string
	ActorRole domain.Role
	RequestID string
	Metadata  map[string]any
}

type CreatePaymentProviderEventInput struct {
	Provider             string
	ProviderEventID      string
	GatewayTransactionID *string
	ProviderPaymentID    *string
	PaymentID            *string
	EventType            string
	ProcessStatus        string
	FailureCode          *string
	FailureReason        *string
	RawPayload           map[string]any
	RawBody              *string
}

type CreateRefundInput struct {
	PaymentID        string
	ProviderRefundID *string
	Amount           float64
	Currency         string
	Status           domain.RefundStatus
	Reason           *string
	Metadata         map[string]any
	RequestedBy      string
	RequestedByRole  domain.Role
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

type ListPaymentsQuery struct {
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

const findIdempotencyRecordQuery = `
	SELECT id, user_id, idempotency_key, request_hash, payment_id, response_status,
		response_body, expires_at, created_at
	FROM idempotency_records
	WHERE user_id = $1 AND idempotency_key = $2
`

const createIdempotencyRecordQuery = `
	INSERT INTO idempotency_records (
		user_id, idempotency_key, request_hash, payment_id,
		response_status, response_body, expires_at
	)
	VALUES ($1,$2,$3,$4,$5,$6,$7)
`

const updateIdempotencyResultQuery = `
	UPDATE idempotency_records
	SET response_status = $1,
		response_body = $2,
		payment_id = $3,
		expires_at = $4
	WHERE user_id = $5 AND idempotency_key = $6 AND request_hash = $7
`

func NewPaymentRepository(pool *pgxpool.Pool) *PaymentRepository {
	return &PaymentRepository{pool: pool}
}

func (r *PaymentRepository) Ping(ctx context.Context) error {
	return r.pool.Ping(ctx)
}

func (r *PaymentRepository) BeginTx(ctx context.Context) (pgx.Tx, error) {
	return r.pool.BeginTx(ctx, pgx.TxOptions{})
}

func (r *PaymentRepository) CreatePayment(ctx context.Context, tx pgx.Tx, input CreatePaymentInput) (domain.Payment, error) {
	metadata, err := toJSONB(input.Metadata)
	if err != nil {
		return domain.Payment{}, queryFailed("marshal payment metadata failed", err)
	}

	row := tx.QueryRow(ctx, `
		INSERT INTO payments (
			order_id, user_id, seller_id, provider, provider_payment_id, status,
			currency, amount, refunded_amount, description, metadata, expires_at, captured_at
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		RETURNING id, order_id, user_id, seller_id, provider, provider_payment_id, status,
			currency, amount, refunded_amount, description, metadata, expires_at, captured_at, created_at, updated_at
	`,
		input.OrderID,
		input.UserID,
		input.SellerID,
		input.Provider,
		input.ProviderPaymentID,
		input.Status,
		input.Currency,
		input.Amount,
		input.RefundedAmount,
		input.Description,
		metadata,
		input.ExpiresAt,
		input.CapturedAt,
	)

	payment, err := scanPaymentRow(row)
	if err != nil {
		return domain.Payment{}, queryFailed("create payment failed", err)
	}
	return payment, nil
}

func (r *PaymentRepository) SavePayment(ctx context.Context, tx pgx.Tx, payment domain.Payment) (domain.Payment, error) {
	metadata, err := toJSONB(payment.Metadata)
	if err != nil {
		return domain.Payment{}, queryFailed("marshal payment metadata failed", err)
	}

	row := tx.QueryRow(ctx, `
		UPDATE payments
		SET seller_id=$2,
			provider=$3,
			provider_payment_id=$4,
			status=$5,
			currency=$6,
			amount=$7,
			refunded_amount=$8,
			description=$9,
			metadata=$10,
			expires_at=$11,
			captured_at=$12,
			updated_at=now()
		WHERE id=$1
		RETURNING id, order_id, user_id, seller_id, provider, provider_payment_id, status,
			currency, amount, refunded_amount, description, metadata, expires_at, captured_at, created_at, updated_at
	`,
		payment.ID,
		payment.SellerID,
		payment.Provider,
		payment.ProviderPaymentID,
		payment.Status,
		payment.Currency,
		payment.Amount,
		payment.RefundedAmount,
		payment.Description,
		metadata,
		payment.ExpiresAt,
		payment.CapturedAt,
	)

	updated, err := scanPaymentRow(row)
	if err != nil {
		return domain.Payment{}, queryFailed("update payment failed", err)
	}
	return updated, nil
}

func (r *PaymentRepository) FindPaymentByID(ctx context.Context, id string) (*domain.Payment, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, order_id, user_id, seller_id, provider, provider_payment_id, status,
			currency, amount, refunded_amount, description, metadata, expires_at, captured_at, created_at, updated_at
		FROM payments
		WHERE id = $1
	`, id)

	payment, err := scanPaymentRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, queryFailed("get payment by id failed", err)
	}
	return &payment, nil
}

func (r *PaymentRepository) FindPaymentByIDForUpdate(ctx context.Context, tx pgx.Tx, id string) (*domain.Payment, error) {
	row := tx.QueryRow(ctx, `
		SELECT id, order_id, user_id, seller_id, provider, provider_payment_id, status,
			currency, amount, refunded_amount, description, metadata, expires_at, captured_at, created_at, updated_at
		FROM payments
		WHERE id = $1
		FOR UPDATE
	`, id)

	payment, err := scanPaymentRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, queryFailed("get payment by id for update failed", err)
	}
	return &payment, nil
}

func (r *PaymentRepository) FindPaymentByOrderID(ctx context.Context, orderID string) (*domain.Payment, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, order_id, user_id, seller_id, provider, provider_payment_id, status,
			currency, amount, refunded_amount, description, metadata, expires_at, captured_at, created_at, updated_at
		FROM payments
		WHERE order_id = $1
	`, orderID)

	payment, err := scanPaymentRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, queryFailed("get payment by order id failed", err)
	}
	return &payment, nil
}

func (r *PaymentRepository) FindPaymentByOrderIDForUpdate(ctx context.Context, tx pgx.Tx, orderID string) (*domain.Payment, error) {
	row := tx.QueryRow(ctx, `
		SELECT id, order_id, user_id, seller_id, provider, provider_payment_id, status,
			currency, amount, refunded_amount, description, metadata, expires_at, captured_at, created_at, updated_at
		FROM payments
		WHERE order_id = $1
		FOR UPDATE
	`, orderID)

	payment, err := scanPaymentRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, queryFailed("get payment by order id for update failed", err)
	}
	return &payment, nil
}

func (r *PaymentRepository) FindPaymentByProviderPaymentID(ctx context.Context, providerPaymentID string) (*domain.Payment, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, order_id, user_id, seller_id, provider, provider_payment_id, status,
			currency, amount, refunded_amount, description, metadata, expires_at, captured_at, created_at, updated_at
		FROM payments
		WHERE provider_payment_id = $1
	`, providerPaymentID)

	payment, err := scanPaymentRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, queryFailed("get payment by provider payment id failed", err)
	}
	return &payment, nil
}

func (r *PaymentRepository) FindPaymentByProviderPaymentIDForUpdate(ctx context.Context, tx pgx.Tx, providerPaymentID string) (*domain.Payment, error) {
	row := tx.QueryRow(ctx, `
		SELECT id, order_id, user_id, seller_id, provider, provider_payment_id, status,
			currency, amount, refunded_amount, description, metadata, expires_at, captured_at, created_at, updated_at
		FROM payments
		WHERE provider_payment_id = $1
		FOR UPDATE
	`, providerPaymentID)

	payment, err := scanPaymentRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, queryFailed("get payment by provider payment id for update failed", err)
	}
	return &payment, nil
}

func (r *PaymentRepository) ListPayments(ctx context.Context, query ListPaymentsQuery, forcedUserID *string) ([]domain.Payment, int, error) {
	page := query.Page
	if page < 1 {
		page = 1
	}
	pageSize := query.PageSize
	if pageSize < 1 {
		pageSize = 20
	}

	sortBy := "created_at"
	switch query.SortBy {
	case "amount":
		sortBy = "amount"
	case "status":
		sortBy = "status"
	}

	sortOrder := "DESC"
	if strings.EqualFold(query.SortOrder, "ASC") {
		sortOrder = "ASC"
	}

	base := `FROM payments WHERE 1=1`
	args := make([]any, 0, 12)
	idx := 1

	appendFilter := func(sql string, value any) {
		base += " AND " + strings.ReplaceAll(sql, "?", fmt.Sprintf("$%d", idx))
		args = append(args, value)
		idx++
	}

	if query.Status != nil {
		appendFilter("status = ?", *query.Status)
	}
	if query.OrderID != nil && strings.TrimSpace(*query.OrderID) != "" {
		appendFilter("order_id = ?", strings.TrimSpace(*query.OrderID))
	}
	if query.Provider != nil && strings.TrimSpace(*query.Provider) != "" {
		appendFilter("provider = ?", strings.TrimSpace(*query.Provider))
	}
	if forcedUserID != nil && strings.TrimSpace(*forcedUserID) != "" {
		appendFilter("user_id = ?", strings.TrimSpace(*forcedUserID))
	} else if query.UserID != nil && strings.TrimSpace(*query.UserID) != "" {
		appendFilter("user_id = ?", strings.TrimSpace(*query.UserID))
	}
	if query.SellerID != nil && strings.TrimSpace(*query.SellerID) != "" {
		appendFilter("seller_id = ?", strings.TrimSpace(*query.SellerID))
	}
	if query.Search != nil && strings.TrimSpace(*query.Search) != "" {
		search := "%" + strings.TrimSpace(*query.Search) + "%"
		base += fmt.Sprintf(" AND (CAST(order_id AS text) ILIKE $%d OR CAST(id AS text) ILIKE $%d OR provider_payment_id ILIKE $%d)", idx, idx, idx)
		args = append(args, search)
		idx++
	}

	countQuery := "SELECT COUNT(*) " + base
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, queryFailed("count payments failed", err)
	}

	listQuery := fmt.Sprintf(`
		SELECT id, order_id, user_id, seller_id, provider, provider_payment_id, status,
			currency, amount, refunded_amount, description, metadata, expires_at, captured_at, created_at, updated_at
		%s
		ORDER BY %s %s
		LIMIT $%d OFFSET $%d
	`, base, sortBy, sortOrder, idx, idx+1)
	args = append(args, pageSize, (page-1)*pageSize)

	rows, err := r.pool.Query(ctx, listQuery, args...)
	if err != nil {
		return nil, 0, queryFailed("list payments failed", err)
	}
	defer rows.Close()

	items := make([]domain.Payment, 0)
	for rows.Next() {
		payment, scanErr := scanPaymentRows(rows)
		if scanErr != nil {
			return nil, 0, queryFailed("scan payment failed", scanErr)
		}
		items = append(items, payment)
	}
	if rows.Err() != nil {
		return nil, 0, queryFailed("iterate payments failed", rows.Err())
	}

	return items, total, nil
}

func (r *PaymentRepository) CreatePaymentTransaction(ctx context.Context, tx pgx.Tx, input CreatePaymentTransactionInput) error {
	rawPayload, err := toJSONB(input.RawPayload)
	if err != nil {
		return queryFailed("marshal payment transaction raw payload failed", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO payment_transactions (
			payment_id, transaction_type, gateway_transaction_id, amount,
			currency, status, request_id, raw_payload
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
	`,
		input.PaymentID,
		input.TransactionType,
		input.GatewayTransactionID,
		input.Amount,
		input.Currency,
		input.Status,
		input.RequestID,
		rawPayload,
	)
	if err != nil {
		return queryFailed("create payment transaction failed", err)
	}
	return nil
}

func (r *PaymentRepository) FindTransactionByGatewayTransactionID(ctx context.Context, gatewayTxnID string) (*domain.PaymentTransaction, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, payment_id, transaction_type, gateway_transaction_id, amount, currency, status, request_id, raw_payload, created_at
		FROM payment_transactions
		WHERE gateway_transaction_id = $1
	`, gatewayTxnID)

	item, err := scanPaymentTransactionRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, queryFailed("get payment transaction by gateway transaction id failed", err)
	}

	return &item, nil
}

func (r *PaymentRepository) CreatePaymentStatusHistory(ctx context.Context, tx pgx.Tx, input CreatePaymentStatusHistoryInput) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO payment_status_histories (
			payment_id, from_status, to_status, changed_by, changed_by_role, reason
		)
		VALUES ($1,$2,$3,$4,$5,$6)
	`,
		input.PaymentID,
		input.FromStatus,
		input.ToStatus,
		input.ChangedBy,
		input.ChangedByRole,
		input.Reason,
	)
	if err != nil {
		return queryFailed("create payment status history failed", err)
	}
	return nil
}

func (r *PaymentRepository) CreatePaymentAuditLog(ctx context.Context, tx pgx.Tx, input CreatePaymentAuditLogInput) error {
	metadata, err := toJSONB(input.Metadata)
	if err != nil {
		return queryFailed("marshal payment audit metadata failed", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO payment_audit_logs (
			payment_id, action, actor_id, actor_role, request_id, metadata
		)
		VALUES ($1,$2,$3,$4,$5,$6)
	`,
		input.PaymentID,
		input.Action,
		input.ActorID,
		input.ActorRole,
		input.RequestID,
		metadata,
	)
	if err != nil {
		return queryFailed("create payment audit log failed", err)
	}
	return nil
}

func (r *PaymentRepository) UpsertPaymentProviderEvent(ctx context.Context, tx pgx.Tx, input CreatePaymentProviderEventInput) error {
	rawPayload, err := toJSONB(input.RawPayload)
	if err != nil {
		return queryFailed("marshal payment provider event raw payload failed", err)
	}
	status := strings.TrimSpace(input.ProcessStatus)
	if status == "" {
		status = "RECEIVED"
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO payment_provider_events (
			provider, provider_event_id, gateway_transaction_id, provider_payment_id,
			payment_id, event_type, process_status, failure_code, failure_reason,
			raw_payload, raw_body, processed_at
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7::varchar,$8,$9,$10,$11, CASE WHEN $7::text IN ('PROCESSED','FAILED','IGNORED') THEN now() ELSE NULL END)
		ON CONFLICT (provider, provider_event_id)
		DO UPDATE SET
			gateway_transaction_id = COALESCE(EXCLUDED.gateway_transaction_id, payment_provider_events.gateway_transaction_id),
			provider_payment_id = COALESCE(EXCLUDED.provider_payment_id, payment_provider_events.provider_payment_id),
			payment_id = COALESCE(EXCLUDED.payment_id, payment_provider_events.payment_id),
			event_type = EXCLUDED.event_type,
			process_status = EXCLUDED.process_status,
			failure_code = EXCLUDED.failure_code,
			failure_reason = EXCLUDED.failure_reason,
			raw_payload = EXCLUDED.raw_payload,
			raw_body = EXCLUDED.raw_body,
			processed_at = CASE WHEN EXCLUDED.process_status IN ('PROCESSED','FAILED','IGNORED') THEN now() ELSE payment_provider_events.processed_at END
	`,
		input.Provider,
		input.ProviderEventID,
		input.GatewayTransactionID,
		input.ProviderPaymentID,
		input.PaymentID,
		input.EventType,
		status,
		input.FailureCode,
		input.FailureReason,
		rawPayload,
		input.RawBody,
	)
	if err != nil {
		return queryFailed("upsert payment provider event failed", err)
	}
	return nil
}

func (r *PaymentRepository) UpdatePaymentProviderEventStatus(
	ctx context.Context,
	tx pgx.Tx,
	provider string,
	providerEventID string,
	paymentID *string,
	processStatus string,
	failureCode *string,
	failureReason *string,
) error {
	_, err := tx.Exec(ctx, `
		UPDATE payment_provider_events
		SET payment_id = COALESCE($3::uuid, payment_id),
			process_status = $4,
			failure_code = $5,
			failure_reason = $6,
			processed_at = now()
		WHERE provider = $1 AND provider_event_id = $2
	`,
		provider,
		providerEventID,
		paymentID,
		processStatus,
		failureCode,
		failureReason,
	)
	if err != nil {
		return queryFailed("update payment provider event status failed", err)
	}
	return nil
}

func (r *PaymentRepository) FindPaymentProviderEvent(ctx context.Context, provider string, providerEventID string) (*PaymentProviderEvent, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, provider, provider_event_id, gateway_transaction_id, provider_payment_id,
			payment_id::text, event_type, process_status, failure_code, failure_reason,
			received_at, processed_at
		FROM payment_provider_events
		WHERE provider = $1 AND provider_event_id = $2
	`, strings.TrimSpace(provider), strings.TrimSpace(providerEventID))

	event, err := scanPaymentProviderEventRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, queryFailed("get payment provider event failed", err)
	}
	return &event, nil
}

func (r *PaymentRepository) GetReconciliationCursor(ctx context.Context, provider string) (*ReconciliationCursor, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT provider, since_id, last_synced_at, updated_at
		FROM payment_reconciliation_cursors
		WHERE provider = $1
	`, strings.TrimSpace(provider))

	cursor, err := scanReconciliationCursorRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, queryFailed("get payment reconciliation cursor failed", err)
	}
	return &cursor, nil
}

func (r *PaymentRepository) UpsertReconciliationCursor(ctx context.Context, provider string, sinceID string, lastSyncedAt time.Time) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO payment_reconciliation_cursors (provider, since_id, last_synced_at, updated_at)
		VALUES ($1,$2,$3,now())
		ON CONFLICT (provider)
		DO UPDATE SET
			since_id = EXCLUDED.since_id,
			last_synced_at = EXCLUDED.last_synced_at,
			updated_at = now()
	`, strings.TrimSpace(provider), strings.TrimSpace(sinceID), lastSyncedAt)
	if err != nil {
		return queryFailed("upsert payment reconciliation cursor failed", err)
	}
	return nil
}

func (r *PaymentRepository) CreateRefund(ctx context.Context, tx pgx.Tx, input CreateRefundInput) (domain.Refund, error) {
	metadata, err := toJSONB(input.Metadata)
	if err != nil {
		return domain.Refund{}, queryFailed("marshal refund metadata failed", err)
	}

	row := tx.QueryRow(ctx, `
		INSERT INTO refunds (
			payment_id, provider_refund_id, amount, currency, status,
			reason, metadata, requested_by, requested_by_role
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		RETURNING id, payment_id, provider_refund_id, amount, currency, status,
			reason, metadata, requested_by, requested_by_role, created_at, updated_at
	`,
		input.PaymentID,
		input.ProviderRefundID,
		input.Amount,
		input.Currency,
		input.Status,
		input.Reason,
		metadata,
		input.RequestedBy,
		input.RequestedByRole,
	)

	refund, err := scanRefundRow(row)
	if err != nil {
		return domain.Refund{}, queryFailed("create refund failed", err)
	}
	return refund, nil
}

func (r *PaymentRepository) ListRefundsByPaymentID(ctx context.Context, paymentID string) ([]domain.Refund, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, payment_id, provider_refund_id, amount, currency, status,
			reason, metadata, requested_by, requested_by_role, created_at, updated_at
		FROM refunds
		WHERE payment_id = $1
		ORDER BY created_at DESC, id DESC
	`, paymentID)
	if err != nil {
		return nil, queryFailed("list refunds failed", err)
	}
	defer rows.Close()

	items := make([]domain.Refund, 0)
	for rows.Next() {
		item, scanErr := scanRefundRows(rows)
		if scanErr != nil {
			return nil, queryFailed("scan refund failed", scanErr)
		}
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, queryFailed("iterate refunds failed", rows.Err())
	}
	return items, nil
}

func (r *PaymentRepository) FindIdempotencyRecord(ctx context.Context, userID, key string) (*IdempotencyRecord, error) {
	row := r.pool.QueryRow(ctx, findIdempotencyRecordQuery, userID, key)

	rec, err := scanIdempotencyRecordRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, queryFailed("get idempotency record failed", err)
	}
	return &rec, nil
}

func (r *PaymentRepository) CreateIdempotencyRecord(ctx context.Context, tx pgx.Tx, rec IdempotencyRecord) error {
	responseBody, err := toJSONB(rec.ResponseBody)
	if err != nil {
		return queryFailed("marshal idempotency response body failed", err)
	}

	_, err = tx.Exec(ctx, createIdempotencyRecordQuery,
		rec.UserID,
		rec.IdempotencyKey,
		rec.RequestHash,
		rec.PaymentID,
		rec.ResponseStatus,
		responseBody,
		rec.ExpiresAt,
	)
	if err != nil {
		return queryFailed("create idempotency record failed", err)
	}
	return nil
}

func (r *PaymentRepository) UpdateIdempotencyResult(
	ctx context.Context,
	tx pgx.Tx,
	userID,
	idempotencyKey,
	requestHash string,
	responseStatus int,
	responseBody map[string]any,
	paymentID string,
	expiresAt time.Time,
) error {
	responseBodyJSON, err := toJSONB(responseBody)
	if err != nil {
		return queryFailed("marshal idempotency response failed", err)
	}

	cmd, err := tx.Exec(ctx, updateIdempotencyResultQuery,
		responseStatus,
		responseBodyJSON,
		paymentID,
		expiresAt,
		userID,
		idempotencyKey,
		requestHash,
	)
	if err != nil {
		return queryFailed("update idempotency result failed", err)
	}
	if cmd.RowsAffected() == 0 {
		return httpx.NewAppError(409, domain.ErrorCodeIdempotencyConflict, "Idempotency record not found", nil)
	}
	return nil
}

func (r *PaymentRepository) FindWebhookIdempotencyRecord(ctx context.Context, provider, providerEventID string) (*WebhookIdempotencyRecord, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, provider, provider_event_id, request_hash, payment_id, response_status,
			response_body, expires_at, created_at
		FROM webhook_idempotency_records
		WHERE provider = $1 AND provider_event_id = $2
	`, provider, providerEventID)

	rec, err := scanWebhookIdempotencyRecordRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, queryFailed("get webhook idempotency record failed", err)
	}
	return &rec, nil
}

func (r *PaymentRepository) FindUnexpiredWebhookIdempotencyRecord(ctx context.Context, provider, providerEventID string) (*WebhookIdempotencyRecord, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, provider, provider_event_id, request_hash, payment_id, response_status,
			response_body, expires_at, created_at
		FROM webhook_idempotency_records
		WHERE provider = $1 AND provider_event_id = $2 AND expires_at > now()
	`, provider, providerEventID)

	rec, err := scanWebhookIdempotencyRecordRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, queryFailed("get unexpired webhook idempotency record failed", err)
	}
	return &rec, nil
}

func (r *PaymentRepository) UpsertWebhookIdempotencyRecord(ctx context.Context, tx pgx.Tx, rec WebhookIdempotencyRecord) error {
	responseBody, err := toJSONB(rec.ResponseBody)
	if err != nil {
		return queryFailed("marshal webhook idempotency response body failed", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO webhook_idempotency_records (
			provider, provider_event_id, request_hash, payment_id,
			response_status, response_body, expires_at
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT (provider, provider_event_id)
		DO UPDATE SET
			request_hash = EXCLUDED.request_hash,
			payment_id = EXCLUDED.payment_id,
			response_status = EXCLUDED.response_status,
			response_body = EXCLUDED.response_body,
			expires_at = EXCLUDED.expires_at
	`,
		rec.Provider,
		rec.ProviderEventID,
		rec.RequestHash,
		rec.PaymentID,
		rec.ResponseStatus,
		responseBody,
		rec.ExpiresAt,
	)
	if err != nil {
		return queryFailed("upsert webhook idempotency record failed", err)
	}
	return nil
}

func (r *PaymentRepository) InsertOutboxEvent(ctx context.Context, tx pgx.Tx, input CreateOutboxEventInput) error {
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

func (r *PaymentRepository) TryMarkEventProcessed(ctx context.Context, tx pgx.Tx, input ProcessedEventInput) (bool, error) {
	consumerName := strings.TrimSpace(input.ConsumerName)
	if consumerName == "" {
		consumerName = "payment-service"
	}
	eventID := strings.TrimSpace(input.EventID)
	if eventID == "" {
		eventID = fmt.Sprintf("%s:%d:%d", strings.TrimSpace(input.Topic), input.Partition, input.OffsetValue)
	}
	tag, err := tx.Exec(ctx, `
		INSERT INTO processed_events (
			consumer_name, event_id, event_type, topic, partition, offset_value
		)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT DO NOTHING
	`, consumerName, eventID, input.EventType, input.Topic, input.Partition, input.OffsetValue)
	if err != nil {
		return false, queryFailed("mark event processed failed", err)
	}
	return tag.RowsAffected() == 0, nil
}

func (r *PaymentRepository) FindExpiredPendingPaymentIDs(ctx context.Context, provider string, limit int) ([]string, error) {
	if limit < 1 {
		limit = 100
	}
	rows, err := r.pool.Query(ctx, `
		SELECT id
		FROM payments
		WHERE provider = $1
			AND status IN ('PENDING','REQUIRES_ACTION')
			AND expires_at IS NOT NULL
			AND expires_at <= now()
		ORDER BY expires_at ASC
		LIMIT $2
	`, strings.TrimSpace(provider), limit)
	if err != nil {
		return nil, queryFailed("list expired pending payments failed", err)
	}
	defer rows.Close()

	ids := make([]string, 0)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, queryFailed("scan expired payment id failed", err)
		}
		ids = append(ids, id)
	}
	if rows.Err() != nil {
		return nil, queryFailed("iterate expired payment ids failed", rows.Err())
	}
	return ids, nil
}

func (r *PaymentRepository) FindDispatchableOutboxEvents(ctx context.Context, limit int) ([]domain.OutboxEvent, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, aggregate_type, aggregate_id, event_type, payload, status, retry_count, next_retry_at, created_at, published_at
		FROM outbox_events
		WHERE event_type LIKE 'payment.%'
			AND (status = 'PENDING' OR (status = 'FAILED' AND next_retry_at <= now()))
		ORDER BY created_at ASC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, queryFailed("list dispatchable outbox events failed", err)
	}
	defer rows.Close()

	items := make([]domain.OutboxEvent, 0)
	for rows.Next() {
		item, scanErr := scanOutboxRows(rows)
		if scanErr != nil {
			return nil, queryFailed("scan outbox event failed", scanErr)
		}
		items = append(items, item)
	}
	if rows.Err() != nil {
		return nil, queryFailed("iterate outbox events failed", rows.Err())
	}
	return items, nil
}

func (r *PaymentRepository) MarkOutboxPublished(ctx context.Context, id string) error {
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

func (r *PaymentRepository) MarkOutboxFailed(ctx context.Context, id string, retryCount int, nextRetryAt *time.Time) error {
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

func IsUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return false
}

func scanPaymentRow(row pgx.Row) (domain.Payment, error) {
	var (
		payment           domain.Payment
		sellerID          pgtype.Text
		providerPaymentID pgtype.Text
		description       pgtype.Text
		status            string
		metadataRaw       []byte
		expiresAt         pgtype.Timestamptz
		capturedAt        pgtype.Timestamptz
	)

	err := row.Scan(
		&payment.ID,
		&payment.OrderID,
		&payment.UserID,
		&sellerID,
		&payment.Provider,
		&providerPaymentID,
		&status,
		&payment.Currency,
		&payment.Amount,
		&payment.RefundedAmount,
		&description,
		&metadataRaw,
		&expiresAt,
		&capturedAt,
		&payment.CreatedAt,
		&payment.UpdatedAt,
	)
	if err != nil {
		return domain.Payment{}, err
	}

	if sellerID.Valid {
		v := sellerID.String
		payment.SellerID = &v
	}
	if providerPaymentID.Valid {
		v := providerPaymentID.String
		payment.ProviderPaymentID = &v
	}
	if description.Valid {
		v := description.String
		payment.Description = &v
	}
	payment.Status = domain.PaymentStatus(status)
	payment.Metadata = decodeJSONMap(metadataRaw)
	if expiresAt.Valid {
		t := expiresAt.Time
		payment.ExpiresAt = &t
	}
	if capturedAt.Valid {
		t := capturedAt.Time
		payment.CapturedAt = &t
	}

	return payment, nil
}

func scanPaymentRows(rows pgx.Rows) (domain.Payment, error) {
	var (
		payment           domain.Payment
		sellerID          pgtype.Text
		providerPaymentID pgtype.Text
		description       pgtype.Text
		status            string
		metadataRaw       []byte
		expiresAt         pgtype.Timestamptz
		capturedAt        pgtype.Timestamptz
	)

	err := rows.Scan(
		&payment.ID,
		&payment.OrderID,
		&payment.UserID,
		&sellerID,
		&payment.Provider,
		&providerPaymentID,
		&status,
		&payment.Currency,
		&payment.Amount,
		&payment.RefundedAmount,
		&description,
		&metadataRaw,
		&expiresAt,
		&capturedAt,
		&payment.CreatedAt,
		&payment.UpdatedAt,
	)
	if err != nil {
		return domain.Payment{}, err
	}

	if sellerID.Valid {
		v := sellerID.String
		payment.SellerID = &v
	}
	if providerPaymentID.Valid {
		v := providerPaymentID.String
		payment.ProviderPaymentID = &v
	}
	if description.Valid {
		v := description.String
		payment.Description = &v
	}
	payment.Status = domain.PaymentStatus(status)
	payment.Metadata = decodeJSONMap(metadataRaw)
	if expiresAt.Valid {
		t := expiresAt.Time
		payment.ExpiresAt = &t
	}
	if capturedAt.Valid {
		t := capturedAt.Time
		payment.CapturedAt = &t
	}

	return payment, nil
}

func scanPaymentTransactionRow(row pgx.Row) (domain.PaymentTransaction, error) {
	var (
		item                 domain.PaymentTransaction
		gatewayTransactionID pgtype.Text
		rawPayload           []byte
	)

	err := row.Scan(
		&item.ID,
		&item.PaymentID,
		&item.TransactionType,
		&gatewayTransactionID,
		&item.Amount,
		&item.Currency,
		&item.Status,
		&item.RequestID,
		&rawPayload,
		&item.CreatedAt,
	)
	if err != nil {
		return domain.PaymentTransaction{}, err
	}
	if gatewayTransactionID.Valid {
		v := gatewayTransactionID.String
		item.GatewayTransactionID = &v
	}
	item.RawPayload = decodeJSONMap(rawPayload)
	return item, nil
}

func scanPaymentProviderEventRow(row pgx.Row) (PaymentProviderEvent, error) {
	var (
		event                PaymentProviderEvent
		gatewayTransactionID pgtype.Text
		providerPaymentID    pgtype.Text
		paymentID            pgtype.Text
		failureCode          pgtype.Text
		failureReason        pgtype.Text
		processedAt          pgtype.Timestamptz
	)

	err := row.Scan(
		&event.ID,
		&event.Provider,
		&event.ProviderEventID,
		&gatewayTransactionID,
		&providerPaymentID,
		&paymentID,
		&event.EventType,
		&event.ProcessStatus,
		&failureCode,
		&failureReason,
		&event.CreatedAt,
		&processedAt,
	)
	if err != nil {
		return PaymentProviderEvent{}, err
	}

	if gatewayTransactionID.Valid {
		v := gatewayTransactionID.String
		event.GatewayTransactionID = &v
	}
	if providerPaymentID.Valid {
		v := providerPaymentID.String
		event.ProviderPaymentID = &v
	}
	if paymentID.Valid {
		v := paymentID.String
		event.PaymentID = &v
	}
	if failureCode.Valid {
		v := failureCode.String
		event.FailureCode = &v
	}
	if failureReason.Valid {
		v := failureReason.String
		event.FailureReason = &v
	}
	if processedAt.Valid {
		t := processedAt.Time
		event.ProcessedAt = &t
	}

	return event, nil
}

func scanReconciliationCursorRow(row pgx.Row) (ReconciliationCursor, error) {
	var (
		cursor       ReconciliationCursor
		sinceID      pgtype.Text
		lastSyncedAt pgtype.Timestamptz
	)

	err := row.Scan(&cursor.Provider, &sinceID, &lastSyncedAt, &cursor.UpdatedAt)
	if err != nil {
		return ReconciliationCursor{}, err
	}
	if sinceID.Valid {
		v := sinceID.String
		cursor.SinceID = &v
	}
	if lastSyncedAt.Valid {
		t := lastSyncedAt.Time
		cursor.LastSyncedAt = &t
	}
	return cursor, nil
}

func scanRefundRow(row pgx.Row) (domain.Refund, error) {
	var (
		refund           domain.Refund
		providerRefundID pgtype.Text
		reason           pgtype.Text
		status           string
		requestedByRole  string
		metadataRaw      []byte
	)

	err := row.Scan(
		&refund.ID,
		&refund.PaymentID,
		&providerRefundID,
		&refund.Amount,
		&refund.Currency,
		&status,
		&reason,
		&metadataRaw,
		&refund.RequestedBy,
		&requestedByRole,
		&refund.CreatedAt,
		&refund.UpdatedAt,
	)
	if err != nil {
		return domain.Refund{}, err
	}

	if providerRefundID.Valid {
		v := providerRefundID.String
		refund.ProviderRefundID = &v
	}
	if reason.Valid {
		v := reason.String
		refund.Reason = &v
	}
	refund.Status = domain.RefundStatus(status)
	refund.RequestedByRole = domain.Role(requestedByRole)
	refund.Metadata = decodeJSONMap(metadataRaw)
	return refund, nil
}

func scanRefundRows(rows pgx.Rows) (domain.Refund, error) {
	var (
		refund           domain.Refund
		providerRefundID pgtype.Text
		reason           pgtype.Text
		status           string
		requestedByRole  string
		metadataRaw      []byte
	)

	err := rows.Scan(
		&refund.ID,
		&refund.PaymentID,
		&providerRefundID,
		&refund.Amount,
		&refund.Currency,
		&status,
		&reason,
		&metadataRaw,
		&refund.RequestedBy,
		&requestedByRole,
		&refund.CreatedAt,
		&refund.UpdatedAt,
	)
	if err != nil {
		return domain.Refund{}, err
	}

	if providerRefundID.Valid {
		v := providerRefundID.String
		refund.ProviderRefundID = &v
	}
	if reason.Valid {
		v := reason.String
		refund.Reason = &v
	}
	refund.Status = domain.RefundStatus(status)
	refund.RequestedByRole = domain.Role(requestedByRole)
	refund.Metadata = decodeJSONMap(metadataRaw)
	return refund, nil
}

func scanIdempotencyRecordRow(row pgx.Row) (IdempotencyRecord, error) {
	var (
		rec            IdempotencyRecord
		paymentID      pgtype.Text
		responseStatus pgtype.Int4
		responseBody   []byte
	)

	err := row.Scan(
		&rec.ID,
		&rec.UserID,
		&rec.IdempotencyKey,
		&rec.RequestHash,
		&paymentID,
		&responseStatus,
		&responseBody,
		&rec.ExpiresAt,
		&rec.CreatedAt,
	)
	if err != nil {
		return IdempotencyRecord{}, err
	}

	if paymentID.Valid {
		v := paymentID.String
		rec.PaymentID = &v
	}
	if responseStatus.Valid {
		v := int(responseStatus.Int32)
		rec.ResponseStatus = &v
	}
	rec.ResponseBody = decodeJSONMap(responseBody)
	return rec, nil
}

func scanWebhookIdempotencyRecordRow(row pgx.Row) (WebhookIdempotencyRecord, error) {
	var (
		rec            WebhookIdempotencyRecord
		paymentID      pgtype.Text
		responseStatus pgtype.Int4
		responseBody   []byte
	)

	err := row.Scan(
		&rec.ID,
		&rec.Provider,
		&rec.ProviderEventID,
		&rec.RequestHash,
		&paymentID,
		&responseStatus,
		&responseBody,
		&rec.ExpiresAt,
		&rec.CreatedAt,
	)
	if err != nil {
		return WebhookIdempotencyRecord{}, err
	}

	if paymentID.Valid {
		v := paymentID.String
		rec.PaymentID = &v
	}
	if responseStatus.Valid {
		v := int(responseStatus.Int32)
		rec.ResponseStatus = &v
	}
	rec.ResponseBody = decodeJSONMap(responseBody)
	return rec, nil
}

func scanOutboxRows(rows pgx.Rows) (domain.OutboxEvent, error) {
	var (
		item       domain.OutboxEvent
		payloadRaw []byte
		status     string
		nextRetry  pgtype.Timestamptz
		published  pgtype.Timestamptz
	)

	err := rows.Scan(
		&item.ID,
		&item.AggregateType,
		&item.AggregateID,
		&item.EventType,
		&payloadRaw,
		&status,
		&item.RetryCount,
		&nextRetry,
		&item.CreatedAt,
		&published,
	)
	if err != nil {
		return domain.OutboxEvent{}, err
	}

	item.Payload = decodeJSONMap(payloadRaw)
	item.Status = domain.OutboxStatus(status)
	if nextRetry.Valid {
		t := nextRetry.Time
		item.NextRetryAt = &t
	}
	if published.Valid {
		t := published.Time
		item.PublishedAt = &t
	}
	return item, nil
}

func toJSONB(value map[string]any) ([]byte, error) {
	if value == nil {
		return nil, nil
	}
	return json.Marshal(value)
}

func decodeJSONMap(raw []byte) map[string]any {
	if len(raw) == 0 {
		return nil
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil
	}
	return out
}

func queryFailed(msg string, err error) error {
	return fmt.Errorf("%s: %w", msg, err)
}
