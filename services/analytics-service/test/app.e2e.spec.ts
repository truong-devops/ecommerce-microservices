import { Controller, Get, INestApplication, MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { createHmac } from 'crypto';
import request from 'supertest';
import { ErrorCode } from '../src/common/constants/error-code.enum';
import { Role } from '../src/common/constants/role.enum';
import { Public } from '../src/common/decorators/public.decorator';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { RequestIdMiddleware } from '../src/common/middlewares/request-id.middleware';
import { AppLogger } from '../src/common/utils/app-logger.util';
import { AnalyticsController } from '../src/modules/analytics/controllers/analytics.controller';
import { AnalyticsService } from '../src/modules/analytics/services/analytics.service';

const JWT_SECRET = 'test-analytics-service-secret-min-32';

const analyticsServiceMock = {
  getOverview: jest.fn(),
  getTimeseries: jest.fn(),
  getPaymentsSummary: jest.fn(),
  getShippingSummary: jest.fn()
};

@Controller(['api/v1', 'api'])
@Public()
class TestHealthController {
  @Get('health')
  health(): Record<string, unknown> {
    return {
      status: 'ok',
      service: 'analytics-service',
      timestamp: new Date().toISOString()
    };
  }

  @Get('ready')
  ready(): Record<string, unknown> {
    return {
      status: 'ready',
      dependencies: {
        clickhouse: true,
        redis: true
      },
      timestamp: new Date().toISOString()
    };
  }

  @Get('live')
  live(): Record<string, unknown> {
    return {
      status: 'alive',
      service: 'analytics-service',
      timestamp: new Date().toISOString()
    };
  }
}

function makeToken(userId: string, email: string, role: Role): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      email,
      role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    })
  ).toString('base64url');
  const signature = createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

@Module({
  controllers: [AnalyticsController, TestHealthController],
  providers: [
    AppLogger,
    {
      provide: AnalyticsService,
      useValue: analyticsServiceMock
    },
    {
      provide: ConfigService,
      useValue: {
        get<T = unknown>(key: string, defaultValue?: T): T {
          const values: Record<string, unknown> = {
            'app.name': 'analytics-service',
            'app.env': 'test',
            'jwt.access.secret': JWT_SECRET
          };

          if (key in values) {
            return values[key] as T;
          }

          return defaultValue as T;
        },
        getOrThrow<T = unknown>(key: string): T {
          const values: Record<string, unknown> = {
            'jwt.access.secret': JWT_SECRET
          };

          if (!(key in values)) {
            throw new Error(`Missing config key: ${key}`);
          }

          return values[key] as T;
        }
      }
    },
    {
      provide: APP_FILTER,
      inject: [AppLogger, ConfigService],
      useFactory: (logger: AppLogger, configService: ConfigService) => new HttpExceptionFilter(logger, configService)
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard
    }
  ]
})
class TestAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}

describe('Analytics service e2e', () => {
  let app: INestApplication;

  const sellerToken = makeToken('11111111-1111-4111-8111-111111111111', 'seller@example.com', Role.SELLER);
  const adminToken = makeToken('22222222-2222-4222-8222-222222222222', 'admin@example.com', Role.ADMIN);
  const customerToken = makeToken('33333333-3333-4333-8333-333333333333', 'buyer@example.com', Role.CUSTOMER);

  beforeAll(async () => {
    analyticsServiceMock.getOverview.mockResolvedValue({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-02T00:00:00.000Z',
      sellerId: null,
      totalEvents: 0,
      uniqueOrders: 0,
      uniquePayments: 0,
      uniqueShipments: 0,
      capturedAmount: 0,
      refundedAmount: 0
    });
    analyticsServiceMock.getTimeseries.mockResolvedValue({ items: [] });
    analyticsServiceMock.getPaymentsSummary.mockResolvedValue({ items: [] });
    analyticsServiceMock.getShippingSummary.mockResolvedValue({ items: [] });

    const moduleRef = await Test.createTestingModule({
      imports: [TestAppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true
      })
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should expose health routes', async () => {
    const responseV1 = await request(app.getHttpServer()).get('/api/v1/health');
    expect(responseV1.status).toBe(200);
    expect(responseV1.body.success).toBe(true);

    const responseLegacy = await request(app.getHttpServer()).get('/api/health');
    expect(responseLegacy.status).toBe(200);
    expect(responseLegacy.body.success).toBe(true);
  });

  it('should return unauthorized without bearer token', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/analytics/overview');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it('should return forbidden for customer role', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/analytics/overview')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ErrorCode.FORBIDDEN);
  });

  it('should return validation error for invalid sellerId', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/analytics/overview?sellerId=invalid-uuid')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(ErrorCode.BAD_REQUEST);
  });

  it('should return overview data for seller role', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/analytics/overview')
      .query({
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-02T00:00:00.000Z',
        sellerId: '99999999-9999-4999-8999-999999999999'
      })
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(analyticsServiceMock.getOverview).toHaveBeenCalledTimes(1);
  });
});
