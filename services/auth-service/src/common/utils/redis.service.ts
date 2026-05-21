import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    this.client = new Redis(this.configService.getOrThrow<string>('redis.url'), {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true
    });
  }

  getClient(): Redis {
    return this.client;
  }

  async setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async delete(key: string): Promise<number> {
    return this.client.del(key);
  }

  async incrementWithFixedWindow(key: string, ttlSeconds: number): Promise<{ count: number; ttlSeconds: number }> {
    const result = (await this.client.eval(
      `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return { count, ttl }
`,
      1,
      key,
      ttlSeconds
    )) as [number, number];

    return {
      count: Number(result[0]),
      ttlSeconds: Number(result[1])
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
