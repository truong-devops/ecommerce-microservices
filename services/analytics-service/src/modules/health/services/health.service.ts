import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { RedisService } from '../../../common/utils/redis.service';
import { AnalyticsRepository } from '../../analytics/repositories/analytics.repository';

@Injectable()
export class HealthService {
  constructor(
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly redisService: RedisService
  ) {}

  async getHealth(): Promise<Record<string, unknown>> {
    return {
      status: 'ok',
      service: 'analytics-service',
      timestamp: new Date().toISOString()
    };
  }

  async getReadiness(): Promise<Record<string, unknown>> {
    const clickhouse = await this.analyticsRepository.ping();
    const redis = this.redisService.isEnabled() ? await this.redisService.ping() : true;

    if (!clickhouse || !redis) {
      throw new ServiceUnavailableException({
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'Dependencies are not ready',
        details: {
          clickhouse,
          redis
        }
      });
    }

    return {
      status: 'ready',
      dependencies: {
        clickhouse,
        redis
      },
      timestamp: new Date().toISOString()
    };
  }

  async getLiveness(): Promise<Record<string, unknown>> {
    return {
      status: 'alive',
      service: 'analytics-service',
      timestamp: new Date().toISOString()
    };
  }
}
