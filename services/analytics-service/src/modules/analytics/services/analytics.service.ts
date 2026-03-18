import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { Role } from '../../../common/constants/role.enum';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import { RedisService } from '../../../common/utils/redis.service';
import {
  QueryOverviewDto,
  QueryPaymentsSummaryDto,
  QueryShippingSummaryDto,
  QueryTimeseriesDto
} from '../dto';
import { AnalyticsDateRange } from '../entities/analytics-event-record.type';
import { AnalyticsRepository } from '../repositories/analytics.repository';
import { AnalyticsEventNormalizerService } from './analytics-event-normalizer.service';

@Injectable()
export class AnalyticsService {
  private readonly maxRangeDays = 365;

  constructor(
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly analyticsEventNormalizerService: AnalyticsEventNormalizerService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService
  ) {}

  async ingestKafkaMessage(messageKey: string | null, messageValue: string): Promise<Record<string, unknown>> {
    const normalized = this.analyticsEventNormalizerService.normalize(messageKey, messageValue);
    if (!normalized.record) {
      return {
        ingested: false,
        reason: normalized.reason ?? 'normalization-failed'
      };
    }

    const record = normalized.record;
    const dedupe = await this.isDuplicate(record.eventKey);

    if (dedupe.duplicate) {
      return {
        ingested: false,
        duplicate: true,
        eventKey: record.eventKey,
        eventType: record.eventType
      };
    }

    try {
      await this.analyticsRepository.insertEvent(record);
    } catch (error) {
      if (dedupe.redisClaimed) {
        await this.safeReleaseRedisClaim(record.eventKey);
      }
      throw error;
    }

    return {
      ingested: true,
      eventKey: record.eventKey,
      eventType: record.eventType
    };
  }

  async getOverview(user: AuthenticatedUserContext, query: QueryOverviewDto): Promise<Record<string, unknown>> {
    const range = this.resolveDateRange(user, query.from, query.to, query.sellerId);
    const overview = await this.analyticsRepository.queryOverview(range);

    return {
      from: range.from,
      to: range.to,
      sellerId: range.sellerId || null,
      ...overview
    };
  }

  async getTimeseries(user: AuthenticatedUserContext, query: QueryTimeseriesDto): Promise<Record<string, unknown>> {
    const range = this.resolveDateRange(user, query.from, query.to, query.sellerId);
    const interval = query.interval ?? 'day';
    const eventType = query.eventType?.trim();

    const items = await this.analyticsRepository.queryTimeseries(range, interval, eventType);

    return {
      from: range.from,
      to: range.to,
      sellerId: range.sellerId || null,
      interval,
      eventType: eventType ?? null,
      items
    };
  }

  async getPaymentsSummary(user: AuthenticatedUserContext, query: QueryPaymentsSummaryDto): Promise<Record<string, unknown>> {
    const range = this.resolveDateRange(user, query.from, query.to, query.sellerId);
    const items = await this.analyticsRepository.queryPaymentsSummary(range);

    return {
      from: range.from,
      to: range.to,
      sellerId: range.sellerId || null,
      items
    };
  }

  async getShippingSummary(user: AuthenticatedUserContext, query: QueryShippingSummaryDto): Promise<Record<string, unknown>> {
    const range = this.resolveDateRange(user, query.from, query.to, query.sellerId);
    const items = await this.analyticsRepository.queryShippingSummary(range);

    return {
      from: range.from,
      to: range.to,
      sellerId: range.sellerId || null,
      items
    };
  }

  private async isDuplicate(eventKey: string): Promise<{ duplicate: boolean; redisClaimed: boolean }> {
    const dedupeTtlSeconds = this.configService.get<number>('ingest.dedupeTtlSeconds', 172800);

    if (this.redisService.isEnabled()) {
      const redisKey = this.buildRedisDedupeKey(eventKey);

      try {
        const inserted = await this.redisService.setNxWithTtl(redisKey, '1', dedupeTtlSeconds);
        if (!inserted) {
          return {
            duplicate: true,
            redisClaimed: false
          };
        }
      } catch {
        // Fall through to storage-level check when Redis is unavailable.
      }

      let alreadyPersisted = false;
      try {
        alreadyPersisted = await this.analyticsRepository.hasEventKey(eventKey);
      } catch (error) {
        await this.safeReleaseRedisClaim(eventKey);
        throw error;
      }

      if (alreadyPersisted) {
        return {
          duplicate: true,
          redisClaimed: true
        };
      }

      return {
        duplicate: false,
        redisClaimed: true
      };
    }

    const alreadyPersisted = await this.analyticsRepository.hasEventKey(eventKey);
    return {
      duplicate: alreadyPersisted,
      redisClaimed: false
    };
  }

  private resolveDateRange(
    user: AuthenticatedUserContext,
    fromInput?: string,
    toInput?: string,
    sellerIdInput?: string
  ): AnalyticsDateRange {
    const toDate = toInput ? new Date(toInput) : new Date();
    const fromDate = fromInput ? new Date(fromInput) : new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate >= toDate) {
      throw new BadRequestException({
        code: ErrorCode.ANALYTICS_INVALID_TIME_RANGE,
        message: 'Invalid time range. Ensure from < to and both are valid ISO-8601 values.'
      });
    }

    const rangeDays = (toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000);
    if (rangeDays > this.maxRangeDays) {
      throw new BadRequestException({
        code: ErrorCode.ANALYTICS_INVALID_TIME_RANGE,
        message: `Time range cannot exceed ${this.maxRangeDays} days.`
      });
    }

    const scopedSellerId = this.resolveSellerScope(user, sellerIdInput);

    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      sellerId: scopedSellerId
    };
  }

  private resolveSellerScope(user: AuthenticatedUserContext, sellerIdInput?: string): string {
    if (user.role === Role.SELLER) {
      return user.userId;
    }

    return sellerIdInput?.trim() ?? '';
  }

  private buildRedisDedupeKey(eventKey: string): string {
    return `analytics:event:${eventKey}`;
  }

  private async safeReleaseRedisClaim(eventKey: string): Promise<void> {
    if (!this.redisService.isEnabled()) {
      return;
    }

    try {
      await this.redisService.deleteKey(this.buildRedisDedupeKey(eventKey));
    } catch {
      // Best effort cleanup only.
    }
  }
}
