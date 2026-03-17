import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisService } from '../../../common/utils/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService
  ) {}

  async getHealth(): Promise<Record<string, unknown>> {
    return {
      status: 'ok',
      service: 'notification-service',
      timestamp: new Date().toISOString()
    };
  }

  async getReadiness(): Promise<Record<string, unknown>> {
    await this.dataSource.query('SELECT 1');

    const redisEnabled = this.redisService.isEnabled();
    let redisHealthy: boolean | null = null;

    if (redisEnabled) {
      const client = this.redisService.getClient();
      await client?.ping();
      redisHealthy = true;
    }

    return {
      status: 'ready',
      dependencies: {
        postgres: true,
        redis: redisHealthy
      },
      timestamp: new Date().toISOString()
    };
  }

  async getLiveness(): Promise<Record<string, unknown>> {
    return {
      status: 'alive',
      service: 'notification-service',
      timestamp: new Date().toISOString()
    };
  }
}
