import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ErrorCode } from '../../../common/constants/error-code.enum';

@Injectable()
export class HealthService {
  constructor(
    private readonly configService: ConfigService,
    @InjectConnection() private readonly connection: Connection
  ) {}

  async getHealth(): Promise<Record<string, unknown>> {
    return {
      service: this.configService.get<string>('app.name', 'review-service'),
      env: this.configService.get<string>('app.env', 'development'),
      mongodb: this.getMongoState(),
      uptimeSec: process.uptime(),
      now: new Date().toISOString()
    };
  }

  async getReadiness(): Promise<Record<string, unknown>> {
    if (this.connection.readyState !== 1) {
      throw new ServiceUnavailableException({
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'MongoDB is not ready'
      });
    }

    return {
      ready: true,
      mongodb: this.getMongoState()
    };
  }

  async getLiveness(): Promise<Record<string, unknown>> {
    return {
      alive: true,
      now: new Date().toISOString()
    };
  }

  private getMongoState(): string {
    const states: Record<number, string> = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    return states[this.connection.readyState] ?? 'unknown';
  }
}
