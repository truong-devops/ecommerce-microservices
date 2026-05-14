package repository

import (
	"context"
	"net/http"
	"strings"

	"analytics-service/internal/domain"
	"analytics-service/internal/httpx"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AnalyticsRepository struct {
	pool *pgxpool.Pool
}

type Overview struct {
	TotalEvents     int64
	UniqueOrders    int64
	UniquePayments  int64
	UniqueShipments int64
	CapturedAmount  float64
	RefundedAmount  float64
}

type TimeseriesItem struct {
	Bucket      string
	EventType   string
	TotalEvents int64
}

type PaymentsSummaryItem struct {
	EventType           string
	Status              *string
	TotalEvents         int64
	TotalAmount         float64
	TotalRefundedAmount float64
}

type ShippingSummaryItem struct {
	EventType   string
	Status      *string
	TotalEvents int64
}

func NewAnalyticsRepository(pool *pgxpool.Pool) *AnalyticsRepository {
	return &AnalyticsRepository{pool: pool}
}

func (r *AnalyticsRepository) Ping(ctx context.Context) error {
	return r.pool.Ping(ctx)
}

func (r *AnalyticsRepository) EnsureSchema(ctx context.Context) error {
	ddl := `
      CREATE TABLE IF NOT EXISTS analytics_events_raw (
        event_key TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        source_service TEXT NULL,
        occurred_at TIMESTAMPTZ NOT NULL,
        seller_id TEXT NULL,
        user_id TEXT NULL,
        order_id TEXT NULL,
        payment_id TEXT NULL,
        shipment_id TEXT NULL,
        amount NUMERIC(18, 2) NULL,
        refunded_amount NUMERIC(18, 2) NULL,
        currency TEXT NULL,
        status TEXT NULL,
        payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS seller_daily_metrics (
        bucket_date DATE NOT NULL,
        seller_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        total_events BIGINT NOT NULL DEFAULT 0,
        total_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
        total_refunded_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
        PRIMARY KEY (bucket_date, seller_id, event_type)
      );

      CREATE INDEX IF NOT EXISTS idx_analytics_events_raw_occurred_at
        ON analytics_events_raw (occurred_at);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_raw_seller_id
        ON analytics_events_raw (seller_id);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_raw_event_type
        ON analytics_events_raw (event_type);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_raw_order_id
        ON analytics_events_raw (order_id);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_raw_payment_id
        ON analytics_events_raw (payment_id);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_raw_shipment_id
        ON analytics_events_raw (shipment_id);
    `

	if _, err := r.pool.Exec(ctx, ddl); err != nil {
		return queryFailed("ensure analytics schema failed", err)
	}
	return nil
}

func (r *AnalyticsRepository) HasEventKey(ctx context.Context, eventKey string) (bool, error) {
	const query = `
      SELECT 1
      FROM analytics_events_raw
      WHERE event_key = $1
      LIMIT 1
    `

	var exists int
	err := r.pool.QueryRow(ctx, query, eventKey).Scan(&exists)
	if err == pgx.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, queryFailed("dedupe check failed", err)
	}
	return true, nil
}

func (r *AnalyticsRepository) InsertEvent(ctx context.Context, record domain.AnalyticsEventRecord) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return queryFailed("begin transaction failed", err)
	}
	defer tx.Rollback(ctx)

	inserted, err := tx.Exec(ctx, `
      INSERT INTO analytics_events_raw (
        event_key,
        event_type,
        source_service,
        occurred_at,
        seller_id,
        user_id,
        order_id,
        payment_id,
        shipment_id,
        amount,
        refunded_amount,
        currency,
        status,
        payload_json,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15
      )
      ON CONFLICT (event_key) DO NOTHING
    `,
		record.EventKey,
		record.EventType,
		record.SourceService,
		record.OccurredAt,
		record.SellerID,
		record.UserID,
		record.OrderID,
		record.PaymentID,
		record.ShipmentID,
		record.Amount,
		record.RefundedAmount,
		record.Currency,
		record.Status,
		record.PayloadJSON,
		record.CreatedAt,
	)
	if err != nil {
		return queryFailed("insert analytics raw event failed", err)
	}

	if inserted.RowsAffected() == 0 {
		return tx.Commit(ctx)
	}

	sellerID := ""
	if record.SellerID != nil {
		sellerID = strings.TrimSpace(*record.SellerID)
	}

	amount := 0.0
	if record.Amount != nil {
		amount = *record.Amount
	}
	refundedAmount := 0.0
	if record.RefundedAmount != nil {
		refundedAmount = *record.RefundedAmount
	}

	_, err = tx.Exec(ctx, `
      INSERT INTO seller_daily_metrics (
        bucket_date,
        seller_id,
        event_type,
        total_events,
        total_amount,
        total_refunded_amount
      )
      VALUES (
        date_trunc('day', $1::timestamptz)::date,
        $2,
        $3,
        1,
        $4::numeric(18,2),
        $5::numeric(18,2)
      )
      ON CONFLICT (bucket_date, seller_id, event_type)
      DO UPDATE SET
        total_events = seller_daily_metrics.total_events + 1,
        total_amount = seller_daily_metrics.total_amount + EXCLUDED.total_amount,
        total_refunded_amount = seller_daily_metrics.total_refunded_amount + EXCLUDED.total_refunded_amount
    `,
		record.OccurredAt,
		sellerID,
		record.EventType,
		amount,
		refundedAmount,
	)
	if err != nil {
		return queryFailed("upsert seller daily metrics failed", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return queryFailed("commit transaction failed", err)
	}
	return nil
}

func (r *AnalyticsRepository) QueryOverview(ctx context.Context, rangeInput domain.AnalyticsDateRange) (Overview, error) {
	const query = `
      SELECT
        (
          SELECT COALESCE(SUM(total_events), 0)
          FROM seller_daily_metrics
          WHERE bucket_date >= ($1::timestamptz AT TIME ZONE 'UTC')::date
            AND bucket_date < ($2::timestamptz AT TIME ZONE 'UTC')::date
            AND ($3 = '' OR seller_id = $3)
        ) AS total_events,
        COUNT(DISTINCT order_id) FILTER (WHERE order_id IS NOT NULL) AS unique_orders,
        COUNT(DISTINCT payment_id) FILTER (WHERE payment_id IS NOT NULL) AS unique_payments,
        COUNT(DISTINCT shipment_id) FILTER (WHERE shipment_id IS NOT NULL) AS unique_shipments,
        COALESCE(SUM(CASE WHEN event_type IN ('payment.captured', 'payment.authorized') THEN COALESCE(amount, 0) ELSE 0 END), 0) AS captured_amount,
        COALESCE(SUM(CASE WHEN event_type IN ('payment.refunded', 'payment.partially-refunded', 'payment.chargeback') THEN COALESCE(refunded_amount, 0) ELSE 0 END), 0) AS refunded_amount
      FROM analytics_events_raw
      WHERE occurred_at >= $1::timestamptz
        AND occurred_at < $2::timestamptz
        AND ($3 = '' OR seller_id = $3)
    `

	var resp Overview
	if err := r.pool.QueryRow(ctx, query, rangeInput.From, rangeInput.To, rangeInput.SellerID).Scan(
		&resp.TotalEvents,
		&resp.UniqueOrders,
		&resp.UniquePayments,
		&resp.UniqueShipments,
		&resp.CapturedAmount,
		&resp.RefundedAmount,
	); err != nil {
		return Overview{}, queryFailed("query overview failed", err)
	}
	return resp, nil
}

func (r *AnalyticsRepository) QueryTimeseries(ctx context.Context, rangeInput domain.AnalyticsDateRange, interval string, eventType string) ([]TimeseriesItem, error) {
	sellerID := rangeInput.SellerID
	eventType = strings.TrimSpace(eventType)

	var rows pgx.Rows
	var err error

	if interval == "day" {
		rows, err = r.pool.Query(ctx, `
        SELECT
          to_char(bucket_date::timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"00:00:00.000"Z"') AS bucket,
          event_type,
          SUM(total_events)::bigint AS total_events
        FROM seller_daily_metrics
        WHERE bucket_date >= ($1::timestamptz AT TIME ZONE 'UTC')::date
          AND bucket_date < ($2::timestamptz AT TIME ZONE 'UTC')::date
          AND ($3 = '' OR seller_id = $3)
          AND ($4 = '' OR event_type = $4)
        GROUP BY bucket, event_type
        ORDER BY bucket ASC, event_type ASC
      `, rangeInput.From, rangeInput.To, sellerID, eventType)
	} else {
		rows, err = r.pool.Query(ctx, `
        SELECT
          to_char(date_trunc('hour', occurred_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:00:00.000"Z"') AS bucket,
          event_type,
          COUNT(*)::bigint AS total_events
        FROM analytics_events_raw
        WHERE occurred_at >= $1::timestamptz
          AND occurred_at < $2::timestamptz
          AND ($3 = '' OR seller_id = $3)
          AND ($4 = '' OR event_type = $4)
        GROUP BY bucket, event_type
        ORDER BY bucket ASC, event_type ASC
      `, rangeInput.From, rangeInput.To, sellerID, eventType)
	}
	if err != nil {
		return nil, queryFailed("query timeseries failed", err)
	}
	defer rows.Close()

	items := make([]TimeseriesItem, 0)
	for rows.Next() {
		var item TimeseriesItem
		if err := rows.Scan(&item.Bucket, &item.EventType, &item.TotalEvents); err != nil {
			return nil, queryFailed("scan timeseries failed", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, queryFailed("query timeseries cursor failed", err)
	}

	return items, nil
}

func (r *AnalyticsRepository) QueryPaymentsSummary(ctx context.Context, rangeInput domain.AnalyticsDateRange) ([]PaymentsSummaryItem, error) {
	rows, err := r.pool.Query(ctx, `
      SELECT
        event_type,
        status,
        COUNT(*)::bigint AS total_events,
        COALESCE(SUM(COALESCE(amount, 0)), 0) AS total_amount,
        COALESCE(SUM(COALESCE(refunded_amount, 0)), 0) AS total_refunded_amount
      FROM analytics_events_raw
      WHERE occurred_at >= $1::timestamptz
        AND occurred_at < $2::timestamptz
        AND ($3 = '' OR seller_id = $3)
        AND event_type LIKE 'payment.%'
      GROUP BY event_type, status
      ORDER BY event_type ASC, status ASC NULLS FIRST
    `, rangeInput.From, rangeInput.To, rangeInput.SellerID)
	if err != nil {
		return nil, queryFailed("query payments summary failed", err)
	}
	defer rows.Close()

	items := make([]PaymentsSummaryItem, 0)
	for rows.Next() {
		var item PaymentsSummaryItem
		if err := rows.Scan(&item.EventType, &item.Status, &item.TotalEvents, &item.TotalAmount, &item.TotalRefundedAmount); err != nil {
			return nil, queryFailed("scan payments summary failed", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, queryFailed("query payments summary cursor failed", err)
	}

	return items, nil
}

func (r *AnalyticsRepository) QueryShippingSummary(ctx context.Context, rangeInput domain.AnalyticsDateRange) ([]ShippingSummaryItem, error) {
	rows, err := r.pool.Query(ctx, `
      SELECT
        event_type,
        status,
        COUNT(*)::bigint AS total_events
      FROM analytics_events_raw
      WHERE occurred_at >= $1::timestamptz
        AND occurred_at < $2::timestamptz
        AND ($3 = '' OR seller_id = $3)
        AND event_type LIKE 'shipment.%'
      GROUP BY event_type, status
      ORDER BY event_type ASC, status ASC NULLS FIRST
    `, rangeInput.From, rangeInput.To, rangeInput.SellerID)
	if err != nil {
		return nil, queryFailed("query shipping summary failed", err)
	}
	defer rows.Close()

	items := make([]ShippingSummaryItem, 0)
	for rows.Next() {
		var item ShippingSummaryItem
		if err := rows.Scan(&item.EventType, &item.Status, &item.TotalEvents); err != nil {
			return nil, queryFailed("scan shipping summary failed", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, queryFailed("query shipping summary cursor failed", err)
	}

	return items, nil
}

func (r *AnalyticsRepository) QueryVideoSummary(ctx context.Context, rangeInput domain.AnalyticsDateRange, videoID string) ([]domain.VideoSummaryItem, error) {
	rows, err := r.pool.Query(ctx, `
      WITH video_events AS (
        SELECT
          COALESCE(payload_json->>'videoId', payload_json->'video'->>'videoId') AS video_id,
          COALESCE(seller_id, payload_json->>'sellerId', payload_json->'video'->>'sellerId') AS resolved_seller_id,
          event_type
        FROM analytics_events_raw
        WHERE occurred_at >= $1::timestamptz
          AND occurred_at < $2::timestamptz
          AND event_type LIKE 'video.%'
          AND ($3 = '' OR COALESCE(seller_id, payload_json->>'sellerId', payload_json->'video'->>'sellerId') = $3)
          AND ($4 = '' OR COALESCE(payload_json->>'videoId', payload_json->'video'->>'videoId') = $4)
      )
      SELECT
        COALESCE(video_id, '') AS video_id,
        COALESCE(resolved_seller_id, '') AS seller_id,
        COUNT(*) FILTER (WHERE event_type IN ('video.view_started', 'video.view-started'))::bigint AS view_started_count,
        COUNT(*) FILTER (WHERE event_type IN ('video.view_qualified', 'video.view-qualified'))::bigint AS qualified_view_count,
        COUNT(*) FILTER (WHERE event_type IN ('video.product_clicked', 'video.product-clicked'))::bigint AS product_click_count,
        COUNT(*) FILTER (WHERE event_type IN ('video.add_to_cart', 'video.add-to-cart'))::bigint AS add_to_cart_count
      FROM video_events
      WHERE COALESCE(video_id, '') <> ''
      GROUP BY video_id, resolved_seller_id
      ORDER BY qualified_view_count DESC, product_click_count DESC
    `, rangeInput.From, rangeInput.To, rangeInput.SellerID, strings.TrimSpace(videoID))
	if err != nil {
		return nil, queryFailed("query video summary failed", err)
	}
	defer rows.Close()

	items := make([]domain.VideoSummaryItem, 0)
	for rows.Next() {
		var item domain.VideoSummaryItem
		if err := rows.Scan(
			&item.VideoID,
			&item.SellerID,
			&item.ViewStartedCount,
			&item.QualifiedViewCount,
			&item.ProductClickCount,
			&item.AddToCartCount,
		); err != nil {
			return nil, queryFailed("scan video summary failed", err)
		}
		if item.QualifiedViewCount > 0 {
			item.ProductClickCTR = float64(item.ProductClickCount) / float64(item.QualifiedViewCount)
		}
		if item.ProductClickCount > 0 {
			item.VideoToCartRate = float64(item.AddToCartCount) / float64(item.ProductClickCount)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, queryFailed("query video summary cursor failed", err)
	}

	return items, nil
}

func queryFailed(message string, err error) error {
	return httpx.NewAppError(
		http.StatusServiceUnavailable,
		domain.ErrorCodeAnalyticsQueryFailed,
		"Analytics storage query failed",
		map[string]any{
			"message": message,
			"error":   err.Error(),
		},
	)
}
