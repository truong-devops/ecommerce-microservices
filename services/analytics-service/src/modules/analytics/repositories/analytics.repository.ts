import { HttpStatus, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClickHouseClient, createClient } from '@clickhouse/client';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { AppException } from '../../../common/utils/app-exception.util';
import { AppLogger } from '../../../common/utils/app-logger.util';
import { AnalyticsDateRange, AnalyticsEventRecord } from '../entities/analytics-event-record.type';

interface OverviewRow {
  totalEvents: string | number;
  uniqueOrders: string | number;
  uniquePayments: string | number;
  uniqueShipments: string | number;
  capturedAmount: string | number;
  refundedAmount: string | number;
}

interface TimeseriesRow {
  bucket: string;
  eventType: string;
  totalEvents: string | number;
}

interface PaymentsSummaryRow {
  eventType: string;
  status: string | null;
  totalEvents: string | number;
  totalAmount: string | number;
  totalRefundedAmount: string | number;
}

interface ShippingSummaryRow {
  eventType: string;
  status: string | null;
  totalEvents: string | number;
}

@Injectable()
export class AnalyticsRepository implements OnModuleDestroy {
  private readonly client: ClickHouseClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger
  ) {
    this.client = createClient({
      url: this.configService.getOrThrow<string>('clickhouse.url'),
      database: this.configService.get<string>('clickhouse.database', 'ecommerce_analytics'),
      username: this.configService.get<string>('clickhouse.username', 'default'),
      password: this.configService.get<string>('clickhouse.password', ''),
      request_timeout: this.configService.get<number>('clickhouse.requestTimeoutMs', 10000)
    });
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  async hasEventKey(eventKey: string): Promise<boolean> {
    try {
      const result = await this.client.query({
        query: `
          SELECT count() AS count
          FROM analytics_events_raw
          WHERE event_key = {eventKey:String}
          LIMIT 1
        `,
        format: 'JSONEachRow',
        query_params: {
          eventKey
        }
      });

      const rows = await result.json<{ count: string | number }>();
      const count = Number(rows[0]?.count ?? 0);
      return count > 0;
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          message: 'ClickHouse query failed for dedupe check',
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
    try {
      await this.client.insert({
        table: 'analytics_events_raw',
        values: [
          {
            event_key: record.eventKey,
            event_type: record.eventType,
            source_service: record.sourceService,
            occurred_at: record.occurredAt,
            seller_id: record.sellerId,
            user_id: record.userId,
            order_id: record.orderId,
            payment_id: record.paymentId,
            shipment_id: record.shipmentId,
            amount: record.amount,
            refunded_amount: record.refundedAmount,
            currency: record.currency,
            status: record.status,
            payload_json: record.payloadJson,
            created_at: record.createdAt
          }
        ],
        format: 'JSONEachRow'
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          message: 'ClickHouse insert failed',
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
    }
  }

  async queryOverview(range: AnalyticsDateRange): Promise<Record<string, number>> {
    const rows = await this.query<OverviewRow>(
      `
        SELECT
          count() AS totalEvents,
          uniqExactIf(order_id, isNotNull(order_id)) AS uniqueOrders,
          uniqExactIf(payment_id, isNotNull(payment_id)) AS uniquePayments,
          uniqExactIf(shipment_id, isNotNull(shipment_id)) AS uniqueShipments,
          sumIf(ifNull(amount, 0), event_type IN ('payment.captured', 'payment.authorized')) AS capturedAmount,
          sumIf(ifNull(refunded_amount, 0), event_type IN ('payment.refunded', 'payment.partially-refunded', 'payment.chargeback')) AS refundedAmount
        FROM analytics_events_raw
        WHERE occurred_at >= parseDateTime64BestEffort({from:String})
          AND occurred_at < parseDateTime64BestEffort({to:String})
          AND ({sellerId:String} = '' OR seller_id = {sellerId:String})
      `,
      { ...range }
    );

    const row = rows[0];
    return {
      totalEvents: toNumber(row?.totalEvents),
      uniqueOrders: toNumber(row?.uniqueOrders),
      uniquePayments: toNumber(row?.uniquePayments),
      uniqueShipments: toNumber(row?.uniqueShipments),
      capturedAmount: toNumber(row?.capturedAmount),
      refundedAmount: toNumber(row?.refundedAmount)
    };
  }

  async queryTimeseries(
    range: AnalyticsDateRange,
    interval: 'hour' | 'day',
    eventType?: string
  ): Promise<Array<{ bucket: string; eventType: string; totalEvents: number }>> {
    const bucketExpression = interval === 'hour' ? 'toStartOfHour(occurred_at)' : 'toStartOfDay(occurred_at)';

    const rows = await this.query<TimeseriesRow>(
      `
        SELECT
          toString(${bucketExpression}) AS bucket,
          event_type AS eventType,
          count() AS totalEvents
        FROM analytics_events_raw
        WHERE occurred_at >= parseDateTime64BestEffort({from:String})
          AND occurred_at < parseDateTime64BestEffort({to:String})
          AND ({sellerId:String} = '' OR seller_id = {sellerId:String})
          AND ({eventType:String} = '' OR event_type = {eventType:String})
        GROUP BY bucket, eventType
        ORDER BY bucket ASC, eventType ASC
      `,
      {
        ...range,
        eventType: (eventType ?? '').trim()
      }
    );

    return rows.map((row) => ({
      bucket: row.bucket,
      eventType: row.eventType,
      totalEvents: toNumber(row.totalEvents)
    }));
  }

  async queryPaymentsSummary(
    range: AnalyticsDateRange
  ): Promise<Array<{ eventType: string; status: string | null; totalEvents: number; totalAmount: number; totalRefundedAmount: number }>> {
    const rows = await this.query<PaymentsSummaryRow>(
      `
        SELECT
          event_type AS eventType,
          status,
          count() AS totalEvents,
          sum(ifNull(amount, 0)) AS totalAmount,
          sum(ifNull(refunded_amount, 0)) AS totalRefundedAmount
        FROM analytics_events_raw
        WHERE occurred_at >= parseDateTime64BestEffort({from:String})
          AND occurred_at < parseDateTime64BestEffort({to:String})
          AND ({sellerId:String} = '' OR seller_id = {sellerId:String})
          AND event_type LIKE 'payment.%'
        GROUP BY eventType, status
        ORDER BY eventType ASC, status ASC NULLS FIRST
      `,
      { ...range }
    );

    return rows.map((row) => ({
      eventType: row.eventType,
      status: row.status,
      totalEvents: toNumber(row.totalEvents),
      totalAmount: toNumber(row.totalAmount),
      totalRefundedAmount: toNumber(row.totalRefundedAmount)
    }));
  }

  async queryShippingSummary(range: AnalyticsDateRange): Promise<Array<{ eventType: string; status: string | null; totalEvents: number }>> {
    const rows = await this.query<ShippingSummaryRow>(
      `
        SELECT
          event_type AS eventType,
          status,
          count() AS totalEvents
        FROM analytics_events_raw
        WHERE occurred_at >= parseDateTime64BestEffort({from:String})
          AND occurred_at < parseDateTime64BestEffort({to:String})
          AND ({sellerId:String} = '' OR seller_id = {sellerId:String})
          AND event_type LIKE 'shipment.%'
        GROUP BY eventType, status
        ORDER BY eventType ASC, status ASC NULLS FIRST
      `,
      { ...range }
    );

    return rows.map((row) => ({
      eventType: row.eventType,
      status: row.status,
      totalEvents: toNumber(row.totalEvents)
    }));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }

  private async query<T>(query: string, queryParams: Record<string, unknown>): Promise<T[]> {
    try {
      const result = await this.client.query({
        query,
        format: 'JSONEachRow',
        query_params: queryParams
      });

      return result.json<T>();
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          message: 'ClickHouse analytics query failed',
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
