import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis | null;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<boolean>('redis.enabled', false);
    if (!this.enabled) {
      this.client = null;
      return;
    }

    this.client = new Redis(this.configService.getOrThrow<string>('redis.url'), {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true
    });
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getClient(): Redis | null {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) {
      return null;
    }

    return this.client.get(key);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
  }
}
