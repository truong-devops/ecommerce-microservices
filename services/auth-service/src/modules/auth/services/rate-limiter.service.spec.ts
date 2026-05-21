import { HttpException, HttpStatus } from '@nestjs/common';
import { RateLimiterService } from './rate-limiter.service';

describe('RateLimiterService', () => {
  function createService(overrides?: { count?: number; ttlSeconds?: number }) {
    const redisService = {
      incrementWithFixedWindow: jest.fn().mockResolvedValue({
        count: overrides?.count ?? 1,
        ttlSeconds: overrides?.ttlSeconds ?? 60
      })
    };

    return {
      service: new RateLimiterService(redisService as never),
      redisService
    };
  }

  it('uses IP and hashed normalized email keys for login limits', async () => {
    const { service, redisService } = createService();
    const request = {
      ip: '10.0.0.10',
      header: jest.fn().mockReturnValue(undefined)
    };

    await service.assertLoginAllowed(request as never, ' USER@Example.COM ');

    expect(redisService.incrementWithFixedWindow).toHaveBeenCalledTimes(2);
    expect(redisService.incrementWithFixedWindow).toHaveBeenNthCalledWith(1, 'rate:auth:login:ip:10.0.0.10', 60);
    expect(redisService.incrementWithFixedWindow.mock.calls[1][0]).toMatch(/^rate:auth:login:email:[a-f0-9]{64}$/);
    expect(redisService.incrementWithFixedWindow.mock.calls[1][0]).not.toContain('USER');
    expect(redisService.incrementWithFixedWindow.mock.calls[1][1]).toBe(900);
  });

  it('uses x-forwarded-for first IP when available', async () => {
    const { service, redisService } = createService();
    const request = {
      ip: '10.0.0.10',
      header: jest.fn().mockReturnValue('203.0.113.1, 10.0.0.10')
    };

    await service.assertRegisterAllowed(request as never);

    expect(redisService.incrementWithFixedWindow).toHaveBeenCalledWith('rate:auth:register:ip:203.0.113.1', 600);
  });

  it('throws 429 with retry metadata when limit is exceeded', async () => {
    const { service } = createService({ count: 4, ttlSeconds: 123 });

    await expect(service.assertForgotPasswordAllowed('user@example.com')).rejects.toBeInstanceOf(HttpException);
    await expect(service.assertForgotPasswordAllowed('user@example.com')).rejects.toMatchObject({
      response: {
        code: 'TOO_MANY_REQUESTS',
        details: {
          retryAfterSeconds: 123
        }
      },
      status: HttpStatus.TOO_MANY_REQUESTS
    });
  });
});
