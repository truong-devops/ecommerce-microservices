import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly enabled: boolean;
  private readonly client: Redis | null;

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<boolean>('redis.enabled', false);

    const redisUrl = this.configService.get<string>('redis.url', '').trim();
    if (!this.enabled || !redisUrl) {
      this.client = null;
      return;
    }

    this.client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true
    });
  }

  isEnabled(): boolean {
    return this.enabled && this.client !== null;
  }

  async ping(): Promise<boolean> {
    if (!this.client) {
      return true;
    }

    try {
      await this.client.connect();
    } catch {
      // Ignore, connect can throw if already connecting/connected.
    }

    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  async setNxWithTtl(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      await this.client.connect();
    } catch {
      // Ignore, connect can throw if already connecting/connected.
    }

    const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async deleteKey(key: string): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.connect();
    } catch {
      // Ignore, connect can throw if already connecting/connected.
    }

    await this.client.del(key);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
  }
}
