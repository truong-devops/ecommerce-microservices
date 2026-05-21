import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { RequestWithContext } from '../../../common/types/request-context.type';
import { sha256 } from '../../../common/utils/hash.util';
import { RedisService } from '../../../common/utils/redis.service';

interface RateLimitRule {
  key: string;
  limit: number;
  windowSeconds: number;
  message: string;
}

@Injectable()
export class RateLimiterService {
  constructor(private readonly redisService: RedisService) {}

  async assertLoginAllowed(request: RequestWithContext, email: string): Promise<void> {
    await this.assertAllowed({
      key: `rate:auth:login:ip:${this.clientIP(request)}`,
      limit: 20,
      windowSeconds: 60,
      message: 'Too many login attempts'
    });
    await this.assertAllowed({
      key: `rate:auth:login:email:${this.emailHash(email)}`,
      limit: 10,
      windowSeconds: 15 * 60,
      message: 'Too many login attempts for this email'
    });
  }

  async assertRegisterAllowed(request: RequestWithContext): Promise<void> {
    await this.assertAllowed({
      key: `rate:auth:register:ip:${this.clientIP(request)}`,
      limit: 10,
      windowSeconds: 10 * 60,
      message: 'Too many registration attempts'
    });
  }

  async assertForgotPasswordAllowed(email: string): Promise<void> {
    await this.assertAllowed({
      key: `rate:auth:forgot-password:email:${this.emailHash(email)}`,
      limit: 3,
      windowSeconds: 15 * 60,
      message: 'Too many forgot password attempts'
    });
  }

  async assertResendVerifyEmailAllowed(email: string): Promise<void> {
    await this.assertAllowed({
      key: `rate:auth:resend-verify-email:email:${this.emailHash(email)}`,
      limit: 3,
      windowSeconds: 15 * 60,
      message: 'Too many verification email requests'
    });
  }

  async assertOauthAllowed(request: RequestWithContext): Promise<void> {
    await this.assertAllowed({
      key: `rate:auth:oauth:ip:${this.clientIP(request)}`,
      limit: 60,
      windowSeconds: 60,
      message: 'Too many OAuth attempts'
    });
  }

  private async assertAllowed(rule: RateLimitRule): Promise<void> {
    const result = await this.redisService.incrementWithFixedWindow(rule.key, rule.windowSeconds);
    if (result.count <= rule.limit) {
      return;
    }

    throw new HttpException(
      {
        code: ErrorCode.TOO_MANY_REQUESTS,
        message: rule.message,
        details: {
          retryAfterSeconds: Math.max(1, result.ttlSeconds)
        }
      },
      HttpStatus.TOO_MANY_REQUESTS
    );
  }

  private emailHash(email: string): string {
    return sha256(email.toLowerCase().trim());
  }

  private clientIP(request: RequestWithContext): string {
    const forwarded = request.header('x-forwarded-for');
    if (forwarded) {
      return forwarded.split(',')[0]?.trim() || 'unknown';
    }
    return request.ip || 'unknown';
  }
}
