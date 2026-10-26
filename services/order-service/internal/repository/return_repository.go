package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"order-service/internal/domain"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type CreateReturnRequestInput struct {
	ReturnNumber string
	OrderID      string
	CustomerID   string
	SellerID     string
	ReasonCode   string
	ReasonDetail string
	EvidenceURLs []string
	RefundAmount float64
	Currency     string
}

type ListReturnRequestsQuery struct {
	Page       int
	PageSize   int
	Status     *domain.ReturnRequestStatus
	Search     *string
	CustomerID *string
	SellerID   *string
}

type UpdateReturnRequestStatusInput struct {
	ID          string
	Status      domain.ReturnRequestStatus
	SellerNote  *string
	RespondedAt *time.Time
	ShippedAt   *time.Time
	ReceivedAt  *time.Time
	RefundedAt  *time.Time
}

func (r *OrderRepository) ReturnRequestExistsForOrder(ctx context.Context, tx pgx.Tx, orderID string) (bool, error) {
	var exists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM return_requests WHERE order_id = $1)`, orderID).Scan(&exists); err != nil {
		return false, queryFailed("check return request existence failed", err)
	}
	return exists, nil
}

func (r *OrderRepository) FindOrderDeliveredAt(ctx context.Context, tx pgx.Tx, orderID string) (*time.Time, error) {
	var deliveredAt time.Time
	err := tx.QueryRow(ctx, `
		SELECT created_at
		FROM order_status_histories
		WHERE order_id = $1 AND to_status = $2
		ORDER BY created_at DESC
		LIMIT 1
	`, orderID, domain.OrderStatusDelivered).Scan(&deliveredAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, queryFailed("find order delivery time failed", err)
	}
	return &deliveredAt, nil
}

func (r *OrderRepository) CreateReturnRequest(ctx context.Context, tx pgx.Tx, input CreateReturnRequestInput) (domain.ReturnRequest, error) {
	evidence, err := json.Marshal(input.EvidenceURLs)
	if err != nil {
		return domain.ReturnRequest{}, queryFailed("marshal return evidence failed", err)
	}
	row := tx.QueryRow(ctx, `
		INSERT INTO return_requests (
			return_number, order_id, customer_id, seller_id, status, reason_code,
			reason_detail, evidence_urls, refund_amount, currency
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		RETURNING id, return_number, order_id, '', customer_id, seller_id, status,
			reason_code, reason_detail, evidence_urls, seller_note, refund_amount,
			currency, requested_at, responded_at, shipped_at, received_at, refunded_at, updated_at
	`, input.ReturnNumber, input.OrderID, input.CustomerID, input.SellerID,
		domain.ReturnRequestStatusRequested, input.ReasonCode, input.ReasonDetail,
		evidence, input.RefundAmount, input.Currency)
	request, err := scanReturnRequestRow(row)
	if err != nil {
		return domain.ReturnRequest{}, queryFailed("create return request failed", err)
	}
	return request, nil
}

func (r *OrderRepository) FindReturnRequestByOrderID(ctx context.Context, orderID string) (*domain.ReturnRequest, error) {
	row := r.pool.QueryRow(ctx, returnRequestSelect+` WHERE rr.order_id = $1`, orderID)
	request, err := scanReturnRequestRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, queryFailed("find return request by order failed", err)
	}
	items, err := r.ListOrderItems(ctx, nil, request.OrderID)
	if err != nil {
		return nil, err
	}
	request.OrderItems = items
	return &request, nil
}

func (r *OrderRepository) FindReturnRequestByIDForUpdate(ctx context.Context, tx pgx.Tx, id string) (*domain.ReturnRequest, error) {
	row := tx.QueryRow(ctx, returnRequestSelect+` WHERE rr.id = $1 FOR UPDATE`, id)
	request, err := scanReturnRequestRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, queryFailed("find return request for update failed", err)
	}
	items, err := r.ListOrderItems(ctx, tx, request.OrderID)
	if err != nil {
		return nil, err
	}
	request.OrderItems = items
	return &request, nil
}

func (r *OrderRepository) UpdateReturnRequestStatus(ctx context.Context, tx pgx.Tx, input UpdateReturnRequestStatusInput) (domain.ReturnRequest, error) {
	row := tx.QueryRow(ctx, `
		UPDATE return_requests
		SET status = $2,
			seller_note = COALESCE($3, seller_note),
			responded_at = COALESCE($4, responded_at),
			shipped_at = COALESCE($5, shipped_at),
			received_at = COALESCE($6, received_at),
			refunded_at = COALESCE($7, refunded_at),
			updated_at = now()
		WHERE id = $1
		RETURNING id, return_number, order_id, '', customer_id, seller_id, status,
			reason_code, reason_detail, evidence_urls, seller_note, refund_amount,
			currency, requested_at, responded_at, shipped_at, received_at, refunded_at, updated_at
	`, input.ID, input.Status, input.SellerNote, input.RespondedAt, input.ShippedAt, input.ReceivedAt, input.RefundedAt)
	request, err := scanReturnRequestRow(row)
	if err != nil {
		return domain.ReturnRequest{}, queryFailed("update return request failed", err)
	}
	items, err := r.ListOrderItems(ctx, tx, request.OrderID)
	if err != nil {
		return domain.ReturnRequest{}, err
	}
	request.OrderItems = items
	return request, nil
}

func (r *OrderRepository) MarkReturnRequestRefundedByOrderID(ctx context.Context, tx pgx.Tx, orderID string) (*domain.ReturnRequest, error) {
	now := time.Now().UTC()
	row := tx.QueryRow(ctx, `
		UPDATE return_requests
		SET status = $2, refunded_at = $3, updated_at = now()
		WHERE order_id = $1 AND status = $4
		RETURNING id, return_number, order_id, '', customer_id, seller_id, status,
			reason_code, reason_detail, evidence_urls, seller_note, refund_amount,
			currency, requested_at, responded_at, shipped_at, received_at, refunded_at, updated_at
	`, orderID, domain.ReturnRequestStatusRefunded, now, domain.ReturnRequestStatusRefundPending)
	request, err := scanReturnRequestRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, queryFailed("mark return request refunded failed", err)
	}
	return &request, nil
}

func (r *OrderRepository) ListReturnRequests(ctx context.Context, query ListReturnRequestsQuery) ([]domain.ReturnRequest, int, error) {
	where := []string{"1=1"}
	args := make([]any, 0, 8)
	if query.Status != nil {
		args = append(args, *query.Status)
		where = append(where, fmt.Sprintf("rr.status = $%d", len(args)))
	}
	if query.CustomerID != nil {
		args = append(args, *query.CustomerID)
		where = append(where, fmt.Sprintf("rr.customer_id = $%d::uuid", len(args)))
	}
	if query.SellerID != nil {
		args = append(args, *query.SellerID)
		where = append(where, fmt.Sprintf("rr.seller_id = $%d::uuid", len(args)))
	}
	if query.Search != nil {
		args = append(args, "%"+strings.TrimSpace(*query.Search)+"%")
		where = append(where, fmt.Sprintf("(rr.return_number ILIKE $%d OR o.order_number ILIKE $%d)", len(args), len(args)))
	}
	whereSQL := strings.Join(where, " AND ")
	var total int
	if err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM return_requests rr JOIN orders o ON o.id = rr.order_id WHERE `+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, queryFailed("count return requests failed", err)
	}
	args = append(args, (query.Page-1)*query.PageSize, query.PageSize)
	offsetPos, limitPos := len(args)-1, len(args)
	rows, err := r.pool.Query(ctx, returnRequestSelect+` WHERE `+whereSQL+`
		ORDER BY rr.requested_at DESC OFFSET $`+fmt.Sprint(offsetPos)+` LIMIT $`+fmt.Sprint(limitPos), args...)
	if err != nil {
		return nil, 0, queryFailed("list return requests failed", err)
	}
	defer rows.Close()
	requests := make([]domain.ReturnRequest, 0)
	for rows.Next() {
		request, scanErr := scanReturnRequestRow(rows)
		if scanErr != nil {
			return nil, 0, queryFailed("scan return request failed", scanErr)
		}
		items, itemErr := r.ListOrderItems(ctx, nil, request.OrderID)
		if itemErr != nil {
			return nil, 0, itemErr
		}
		request.OrderItems = items
		requests = append(requests, request)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, queryFailed("iterate return requests failed", err)
	}
	return requests, total, nil
}

const returnRequestSelect = `
	SELECT rr.id, rr.return_number, rr.order_id, o.order_number, rr.customer_id,
		rr.seller_id, rr.status, rr.reason_code, rr.reason_detail, rr.evidence_urls,
		rr.seller_note, rr.refund_amount, rr.currency, rr.requested_at,
		rr.responded_at, rr.shipped_at, rr.received_at, rr.refunded_at, rr.updated_at
	FROM return_requests rr
	JOIN orders o ON o.id = rr.order_id`

func scanReturnRequestRow(row interface{ Scan(dest ...any) error }) (domain.ReturnRequest, error) {
	var request domain.ReturnRequest
	var status string
	var evidence []byte
	var refundAmount pgtype.Numeric
	if err := row.Scan(
		&request.ID, &request.ReturnNumber, &request.OrderID, &request.OrderNumber,
		&request.CustomerID, &request.SellerID, &status, &request.ReasonCode,
		&request.ReasonDetail, &evidence, &request.SellerNote, &refundAmount,
		&request.Currency, &request.RequestedAt, &request.RespondedAt,
		&request.ShippedAt, &request.ReceivedAt, &request.RefundedAt, &request.UpdatedAt,
	); err != nil {
		return domain.ReturnRequest{}, err
	}
	request.Status = domain.ReturnRequestStatus(status)
	request.RefundAmount = numericToFloat64(refundAmount)
	if len(evidence) > 0 {
		if err := json.Unmarshal(evidence, &request.EvidenceURLs); err != nil {
			return domain.ReturnRequest{}, err
		}
	}
	if request.EvidenceURLs == nil {
		request.EvidenceURLs = []string{}
	}
	return request, nil
}
