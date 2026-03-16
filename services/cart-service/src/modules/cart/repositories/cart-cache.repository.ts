import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { RedisService } from '../../../common/utils/redis.service';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { CartSnapshot } from '../entities/cart.types';

export interface CartCacheRepository {
  getByUserId(userId: string): Promise<CartSnapshot | null>;
  save(cart: CartSnapshot, ttlSeconds: number): Promise<void>;
  deleteByUserId(userId: string): Promise<void>;
}

@Injectable()
export class RedisCartCacheRepository implements CartCacheRepository {
  constructor(private readonly redisService: RedisService) {}

  async getByUserId(userId: string): Promise<CartSnapshot | null> {
    const client = this.redisService.getClient();
    if (!client) {
      return null;
    }

    const raw = await client.get(this.buildKey(userId));
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as CartSnapshot;
    } catch {
      return null;
    }
  }

  async save(cart: CartSnapshot, ttlSeconds: number): Promise<void> {
    const client = this.redisService.getClient();
    if (!client) {
      throw new ServiceUnavailableException({
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'Redis is not available'
      });
    }

    await client.set(this.buildKey(cart.userId), JSON.stringify(cart), 'EX', ttlSeconds);
  }

  async deleteByUserId(userId: string): Promise<void> {
    const client = this.redisService.getClient();
    if (!client) {
      return;
    }

    await client.del(this.buildKey(userId));
  }

  private buildKey(userId: string): string {
    return `cart:${userId}`;
  }
}
