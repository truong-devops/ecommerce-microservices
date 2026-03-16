import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { RedisService } from '../../../common/utils/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    @Optional() private readonly dataSource?: DataSource
  ) {}

  async getHealth(): Promise<Record<string, unknown>> {
    return {
      status: 'ok',
      service: this.configService.get<string>('app.name', 'cart-service'),
      timestamp: new Date().toISOString()
    };
  }

  async getReadiness(): Promise<Record<string, unknown>> {
    const redisReady = await this.redisService.ping();
    if (!redisReady) {
      throw new ServiceUnavailableException({
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'Redis is not ready'
      });
    }

    const persistenceEnabled = this.configService.get<boolean>('cart.persistenceEnabled', false);
    if (persistenceEnabled && (!this.dataSource || !this.dataSource.isInitialized)) {
      throw new ServiceUnavailableException({
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'PostgreSQL persistence is not ready'
      });
    }

    return {
      status: 'ready',
      dependencies: {
        redis: redisReady,
        postgres: persistenceEnabled ? this.dataSource?.isInitialized ?? false : 'disabled'
      },
      timestamp: new Date().toISOString()
    };
  }

  async getLiveness(): Promise<Record<string, unknown>> {
    return {
      status: 'alive',
      service: this.configService.get<string>('app.name', 'cart-service'),
      timestamp: new Date().toISOString()
    };
  }
}
