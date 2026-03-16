import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { RedisService } from '../../../common/utils/redis.service';

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService
  ) {}

  async getHealth(): Promise<Record<string, unknown>> {
    return {
      status: 'ok',
      service: this.configService.get<string>('app.name', 'product-service'),
      timestamp: new Date().toISOString()
    };
  }

  async getReadiness(): Promise<Record<string, unknown>> {
    const mongoReady = this.connection.readyState === 1;
    if (!mongoReady) {
      throw new ServiceUnavailableException({
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'MongoDB is not ready'
      });
    }

    let redisReady = true;
    if (this.redisService.isEnabled()) {
      redisReady = await this.redisService.ping();
      if (!redisReady) {
        throw new ServiceUnavailableException({
          code: ErrorCode.SERVICE_UNAVAILABLE,
          message: 'Redis is not ready'
        });
      }
    }

    return {
      status: 'ready',
      dependencies: {
        mongo: mongoReady,
        redis: redisReady
      },
      timestamp: new Date().toISOString()
    };
  }

  async getLiveness(): Promise<Record<string, unknown>> {
    return {
      status: 'alive',
      service: this.configService.get<string>('app.name', 'product-service'),
      timestamp: new Date().toISOString()
    };
  }
}
