import { HttpStatus, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResultRow } from 'pg';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { AppException } from '../../../common/utils/app-exception.util';
import { AppLogger } from '../../../common/utils/app-logger.util';
import { AnalyticsDateRange, AnalyticsEventRecord } from '../entities/analytics-event-record.type';

interface OverviewRow {
  total_events: string | number | null;
  unique_orders: string | number | null;
  unique_payments: string | number | null;
  unique_shipments: string | number | null;
  captured_amount: string | number | null;
  refunded_amount: string | number | null;
}

interface TimeseriesRow {
  bucket: string;
  event_type: string;
  total_events: string | number;
}

interface PaymentsSummaryRow {
  event_type: string;
  status: string | null;
  total_events: string | number;
  total_amount: string | number;
  total_refunded_amount: string | number;
}

interface ShippingSummaryRow {
  event_type: string;
  status: string | null;
  total_events: string | number;
}

@Injectable()
export class AnalyticsRepository implements OnModuleDestroy {
  private readonly pool: Pool;
  private readonly schemaPromise: Promise<void>;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger
  ) {
    this.pool = new Pool({
      connectionString: this.configService.getOrThrow<string>('postgres.url'),
      ssl: this.configService.get<boolean>('postgres.ssl', false) ? { rejectUnauthorized: false } : undefined,
      max: this.configService.get<number>('postgres.poolMax', 10)
    });
    this.schemaPromise = this.ensureSchema();
  }

  async ping(): Promise<boolean> {
    try {
      await this.schemaPromise;
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async hasEventKey(eventKey: string): Promise<boolean> {
    try {
      await this.schemaPromise;
      const result = await this.pool.query<{ exists: number }>(
        `
          SELECT 1::int AS exists
          FROM analytics_events_raw
          WHERE event_key = $1
          LIMIT 1
        `,
        [eventKey]
      );

      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          message: 'Postgres query failed for dedupe check',
          error: (error as Error).message
        }),
        undefined,
        'analytics-repository'
      );

      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, {
        code: ErrorCode.ANALYTICS_QUERY_FAILED,
        message: 'Analytics storage is unavailable'
      });
    }
  }

  async insertEvent(record: AnalyticsEventRecord): Promise<void> {
    await this.schemaPromise;
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `
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
        [
          record.eventKey,
          record.eventType,
          record.sourceService,
          record.occurredAt,
          record.sellerId,
          record.userId,
          record.orderId,
          record.paymentId,
          record.shipmentId,
          record.amount,
          record.refundedAmount,
          record.currency,
          record.status,
          record.payloadJson,
          record.createdAt
        ]
      );

      if (inserted.rowCount === 0) {
        await client.query('ROLLBACK');
        return;
      }

      const sellerId = record.sellerId ?? '';
      const amount = record.amount ?? 0;
      const refundedAmount = record.refundedAmount ?? 0;
      await client.query(
        `
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
        [record.occurredAt, sellerId, record.eventType, amount, refundedAmount]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(
        JSON.stringify({
          message: 'Postgres insert failed',
          eventKey: record.eventKey,
          eventType: record.eventType,
          error: (error as Error).message
        }),
        undefined,
        'analytics-repository'
      );

      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, {
        code: ErrorCode.ANALYTICS_QUERY_FAILED,
        message: 'Failed to persist analytics event'
      });
    } finally {
      client.release();
    }
  }

  async queryOverview(range: AnalyticsDateRange): Promise<Record<string, number>> {
    await this.schemaPromise;
    const rows = await this.query<OverviewRow>(
      `
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
      `,
      [range.from, range.to, range.sellerId]
    );

    const row = rows[0];
    return {
      totalEvents: toNumber(row?.total_events),
      uniqueOrders: toNumber(row?.unique_orders),
      uniquePayments: toNumber(row?.unique_payments),
      uniqueShipments: toNumber(row?.unique_shipments),
      capturedAmount: toNumber(row?.captured_amount),
      refundedAmount: toNumber(row?.refunded_amount)
    };
  }

  async queryTimeseries(
    range: AnalyticsDateRange,
    interval: 'hour' | 'day',
    eventType?: string
  ): Promise<Array<{ bucket: string; eventType: string; totalEvents: number }>> {
    await this.schemaPromise;
    const trimmedEventType = (eventType ?? '').trim();
    const sellerId = range.sellerId;
    const rows = interval === 'day'
      ? await this.query<TimeseriesRow>(
          `
            SELECT
              to_char(bucket_date::timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"00:00:00.000\"Z\"') AS bucket,
              event_type,
              SUM(total_events)::bigint AS total_events
            FROM seller_daily_metrics
            WHERE bucket_date >= ($1::timestamptz AT TIME ZONE 'UTC')::date
              AND bucket_date < ($2::timestamptz AT TIME ZONE 'UTC')::date
              AND ($3 = '' OR seller_id = $3)
              AND ($4 = '' OR event_type = $4)
            GROUP BY bucket, event_type
            ORDER BY bucket ASC, event_type ASC
          `,
          [range.from, range.to, sellerId, trimmedEventType]
        )
      : await this.query<TimeseriesRow>(
          `
            SELECT
              to_char(date_trunc('hour', occurred_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:00:00.000\"Z\"') AS bucket,
              event_type,
              COUNT(*)::bigint AS total_events
            FROM analytics_events_raw
            WHERE occurred_at >= $1::timestamptz
              AND occurred_at < $2::timestamptz
              AND ($3 = '' OR seller_id = $3)
              AND ($4 = '' OR event_type = $4)
            GROUP BY bucket, event_type
            ORDER BY bucket ASC, event_type ASC
          `,
          [range.from, range.to, sellerId, trimmedEventType]
        );

    return rows.map((row) => ({
      bucket: row.bucket,
      eventType: row.event_type,
      totalEvents: toNumber(row.total_events)
    }));
  }

  async queryPaymentsSummary(
    range: AnalyticsDateRange
  ): Promise<Array<{ eventType: string; status: string | null; totalEvents: number; totalAmount: number; totalRefundedAmount: number }>> {
    await this.schemaPromise;
    const rows = await this.query<PaymentsSummaryRow>(
      `
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
      `,
      [range.from, range.to, range.sellerId]
    );

    return rows.map((row) => ({
      eventType: row.event_type,
      status: row.status,
      totalEvents: toNumber(row.total_events),
      totalAmount: toNumber(row.total_amount),
      totalRefundedAmount: toNumber(row.total_refunded_amount)
    }));
  }

  async queryShippingSummary(range: AnalyticsDateRange): Promise<Array<{ eventType: string; status: string | null; totalEvents: number }>> {
    await this.schemaPromise;
    const rows = await this.query<ShippingSummaryRow>(
      `
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
      `,
      [range.from, range.to, range.sellerId]
    );

    return rows.map((row) => ({
      eventType: row.event_type,
      status: row.status,
      totalEvents: toNumber(row.total_events)
    }));
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  private async query<T extends QueryResultRow>(query: string, params: unknown[]): Promise<T[]> {
    try {
      const result = await this.pool.query<T>(query, params);
      return result.rows;
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          message: 'Postgres analytics query failed',
          error: (error as Error).message
        }),
        undefined,
        'analytics-repository'
      );

      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, {
        code: ErrorCode.ANALYTICS_QUERY_FAILED,
        message: 'Analytics storage query failed'
      });
    }
  }

  private async ensureSchema(): Promise<void> {
    const ddl = `
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
    `;

    await this.pool.query(ddl);
  }
}

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return numeric;
}
