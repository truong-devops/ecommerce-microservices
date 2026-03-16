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
      service: 'shipping-service',
      timestamp: new Date().toISOString()
    };
  }

  async getReadiness(): Promise<Record<string, unknown>> {
    await this.dataSource.query('SELECT 1');
    await this.redisService.getClient().ping();

    return {
      status: 'ready',
      dependencies: {
        postgres: true,
        redis: true
      },
      timestamp: new Date().toISOString()
    };
  }

  async getLiveness(): Promise<Record<string, unknown>> {
    return {
      status: 'alive',
      service: 'shipping-service',
      timestamp: new Date().toISOString()
    };
  }
}
