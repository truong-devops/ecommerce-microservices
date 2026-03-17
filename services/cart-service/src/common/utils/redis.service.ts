import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppLogger } from './app-logger.util';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger
  ) {
    const enabled = this.configService.get<boolean>('redis.enabled', true);
    const redisUrl = this.configService.get<string>('redis.url');

    if (enabled && redisUrl) {
      this.client = new Redis(redisUrl);
      this.client.on('error', (error) => {
        this.logger.error(`Redis connection error: ${String(error)}`, undefined, RedisService.name);
      });
      return;
    }

    this.client = null;
  }

  getClient(): Redis | null {
    return this.client;
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  async ping(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    const response = await this.client.ping();
    return response === 'PONG';
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
  }
}
