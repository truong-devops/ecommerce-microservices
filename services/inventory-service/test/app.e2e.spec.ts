import { Controller, Get, INestApplication, MiddlewareConsumer, Module, NestModule, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { randomUUID, createHmac } from 'crypto';
import { DataSource } from 'typeorm';
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
import { InventoryController } from '../src/modules/inventory/controllers/inventory.controller';
import { InventoryItemEntity } from '../src/modules/inventory/entities/inventory-item.entity';
import { InventoryReservationStatus } from '../src/modules/inventory/entities/inventory-reservation-status.enum';
import { InventoryReservationEntity } from '../src/modules/inventory/entities/inventory-reservation.entity';
import { InventoryItemRepository } from '../src/modules/inventory/repositories/inventory-item.repository';
import { InventoryMovementRepository } from '../src/modules/inventory/repositories/inventory-movement.repository';
import { InventoryReservationRepository } from '../src/modules/inventory/repositories/inventory-reservation.repository';
import { OutboxEventRepository } from '../src/modules/inventory/repositories/outbox-event.repository';
import { InventoryService } from '../src/modules/inventory/services/inventory.service';

const JWT_SECRET = 'test-inventory-service-secret-min-32';

class InMemoryInventoryItemRepository {
  private readonly map = new Map<string, InventoryItemEntity>();

  async findBySku(sku: string): Promise<InventoryItemEntity | null> {
    return this.map.get(sku) ?? null;
  }

  async findBySkuForUpdate(sku: string): Promise<InventoryItemEntity | null> {
    return this.findBySku(sku);
  }

  async save(entity: InventoryItemEntity): Promise<InventoryItemEntity> {
    const existing = this.map.get(entity.sku);
    const now = new Date();

    if (!entity.id) {
      entity.id = randomUUID();
      entity.createdAt = now;
      entity.version = 1;
    } else if (existing) {
      entity.version = existing.version + 1;
    } else {
      entity.version = entity.version || 1;
      entity.createdAt = entity.createdAt ?? now;
    }

    entity.updatedAt = now;
    this.map.set(entity.sku, { ...entity });
    return { ...entity };
  }
}

class InMemoryInventoryReservationRepository {
  private readonly reservations: InventoryReservationEntity[] = [];

  async findActiveByOrderId(orderId: string): Promise<InventoryReservationEntity[]> {
    return this.reservations
      .filter((item) => item.orderId === orderId && item.status === InventoryReservationStatus.ACTIVE)
      .sort((a, b) => a.sku.localeCompare(b.sku))
      .map((item) => ({ ...item }));
  }

  async findExpiredActive(limit: number): Promise<InventoryReservationEntity[]> {
    return this.reservations
      .filter((item) => item.status === InventoryReservationStatus.ACTIVE && item.expiresAt.getTime() <= Date.now())
      .slice(0, limit)
      .map((item) => ({ ...item }));
  }

  async saveMany(items: InventoryReservationEntity[]): Promise<InventoryReservationEntity[]> {
    const result: InventoryReservationEntity[] = [];
    for (const item of items) {
      result.push(await this.save(item));
    }
    return result;
  }

  async save(item: InventoryReservationEntity): Promise<InventoryReservationEntity> {
    const now = new Date();
    const normalized = { ...item };

    if (!normalized.id) {
      normalized.id = randomUUID();
      normalized.createdAt = now;
    }

    normalized.updatedAt = now;

    const index = this.reservations.findIndex((entry) => entry.id === normalized.id);
    if (index >= 0) {
      this.reservations[index] = normalized;
    } else {
      this.reservations.push(normalized);
    }

    return { ...normalized };
  }
}

class InMemoryInventoryMovementRepository {
  async saveMany(): Promise<[]> {
    return [];
  }
}

class InMemoryOutboxEventRepository {
  async save(): Promise<Record<string, unknown>> {
    return {
      id: randomUUID()
    };
  }
}

const configServiceMock: Pick<ConfigService, 'get' | 'getOrThrow'> = {
  get<T = unknown>(key: string, defaultValue?: T): T {
    const values: Record<string, unknown> = {
      'app.name': 'inventory-service',
      'app.env': 'test',
      'jwt.access.secret': JWT_SECRET,
      'reservation.defaultTtlMinutes': 10,
      'reservation.expireBatchSize': 200
    };

    if (key in values) {
      return values[key] as T;
    }

    return defaultValue as T;
  },
  getOrThrow<T = unknown>(key: string): T {
    const value = this.get<T>(key);
    if (value === undefined || value === null) {
      throw new Error(`Missing config key: ${key}`);
    }
    return value;
  }
};

const dataSourceMock = {
  async transaction<T>(first: ((manager: unknown) => Promise<T>) | unknown, second?: (manager: unknown) => Promise<T>): Promise<T> {
    const callback = (typeof first === 'function' ? first : second) as (manager: unknown) => Promise<T>;
    return callback({});
  }
} as unknown as DataSource;

@Controller(['api/v1', 'api'])
class TestHealthController {
  @Public()
  @Get('health')
  health(): Record<string, unknown> {
    return {
      status: 'ok',
      service: 'inventory-service',
      timestamp: new Date().toISOString()
    };
  }

  @Public()
  @Get('ready')
  ready(): Record<string, unknown> {
    return {
      status: 'ready',
      dependencies: {
        postgres: true
      },
      timestamp: new Date().toISOString()
    };
  }

  @Public()
  @Get('live')
  live(): Record<string, unknown> {
    return {
      status: 'alive',
      service: 'inventory-service',
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
  controllers: [InventoryController, TestHealthController],
  providers: [
    InventoryService,
    AppLogger,
    {
      provide: ConfigService,
      useValue: configServiceMock
    },
    {
      provide: DataSource,
      useValue: dataSourceMock
    },
    {
      provide: InventoryItemRepository,
      useClass: InMemoryInventoryItemRepository
    },
    {
      provide: InventoryReservationRepository,
      useClass: InMemoryInventoryReservationRepository
    },
    {
      provide: InventoryMovementRepository,
      useClass: InMemoryInventoryMovementRepository
    },
    {
      provide: OutboxEventRepository,
      useClass: InMemoryOutboxEventRepository
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

describe('Inventory service e2e', () => {
  let app: INestApplication;
  let inventoryService: InventoryService;
  let inventoryReservationRepository: InMemoryInventoryReservationRepository;
  const sellerToken = makeToken('11111111-1111-4111-8111-111111111111', 'seller@example.com', Role.SELLER);
  const adminToken = makeToken('22222222-2222-4222-8222-222222222222', 'admin@example.com', Role.ADMIN);
  const warehouseToken = makeToken('33333333-3333-4333-8333-333333333333', 'warehouse@example.com', Role.WAREHOUSE);
  const buyerToken = makeToken('44444444-4444-4444-8444-444444444444', 'buyer@example.com', Role.BUYER);

  beforeAll(async () => {
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
    inventoryService = app.get(InventoryService);
    inventoryReservationRepository = app.get(InventoryReservationRepository);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should expose health routes in both versioned and gateway-compatible path', async () => {
    const responseV1 = await request(app.getHttpServer()).get('/api/v1/health');
    expect(responseV1.status).toBe(200);
    expect(responseV1.body.success).toBe(true);

    const responseLegacy = await request(app.getHttpServer()).get('/api/health');
    expect(responseLegacy.status).toBe(200);
    expect(responseLegacy.body.success).toBe(true);
  });

  it('should keep validate endpoint public and return business false with 200 for unknown sku', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/inventory/validate').query({
      sku: 'sku-not-found',
      quantity: 2
    });

    expect(response.status).toBe(200);
    expect(response.body.data.isAvailable).toBe(false);
    expect(response.body.data.availableQuantity).toBe(0);
  });

  it('should return 400 for validate query validation failure', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/inventory/validate').query({
      sku: '',
      quantity: 0
    });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe(ErrorCode.BAD_REQUEST);
  });

  it('should return unauthorized for protected routes without bearer token', async () => {
    const response = await request(app.getHttpServer()).patch('/api/v1/inventory/stocks/SKU-1/adjust').send({
      deltaOnHand: 10
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it('should return forbidden for insufficient role', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/v1/inventory/stocks/SKU-1/adjust')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        deltaOnHand: 10
      });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ErrorCode.FORBIDDEN);
  });

  it('should support adjust -> reserve -> idempotent reserve -> confirm flow', async () => {
    const adjust = await request(app.getHttpServer())
      .patch('/api/v1/inventory/stocks/SKU-1/adjust')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        productId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        sellerId: '11111111-1111-4111-8111-111111111111',
        deltaOnHand: 20,
        reason: 'Initial stock'
      });

    expect(adjust.status).toBe(200);
    expect(adjust.body.success).toBe(true);
    expect(adjust.body.data.available).toBe(20);

    const validate = await request(app.getHttpServer()).get('/api/inventory/validate').query({
      sku: 'SKU-1',
      quantity: 5
    });
    expect(validate.status).toBe(200);
    expect(validate.body.data.isAvailable).toBe(true);

    const reservePayload = {
      orderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      items: [
        {
          sku: 'SKU-1',
          quantity: 5
        }
      ]
    };

    const reserve = await request(app.getHttpServer())
      .post('/api/v1/inventory/reservations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(reservePayload);

    expect(reserve.status).toBe(201);
    expect(reserve.body.success).toBe(true);
    expect(reserve.body.data.status).toBe('ACTIVE');
    expect(reserve.body.data.idempotent).toBe(false);

    const idempotent = await request(app.getHttpServer())
      .post('/api/v1/inventory/reservations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(reservePayload);

    expect(idempotent.status).toBe(201);
    expect(idempotent.body.data.idempotent).toBe(true);

    const conflict = await request(app.getHttpServer())
      .post('/api/v1/inventory/reservations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        ...reservePayload,
        items: [{ sku: 'SKU-1', quantity: 2 }]
      });

    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe(ErrorCode.INVENTORY_RESERVATION_CONFLICT);

    const confirm = await request(app.getHttpServer())
      .post(`/api/v1/inventory/reservations/${reservePayload.orderId}/confirm`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({});

    expect(confirm.status).toBe(201);
    expect(confirm.body.data.status).toBe('CONFIRMED');

    const stock = await request(app.getHttpServer())
      .get('/api/v1/inventory/stocks/SKU-1')
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(stock.status).toBe(200);
    expect(stock.body.data.onHand).toBe(15);
    expect(stock.body.data.reserved).toBe(0);
    expect(stock.body.data.available).toBe(15);
  });

  it('should return insufficient stock when reservation quantity exceeds available', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/inventory/reservations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        orderId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        items: [
          {
            sku: 'SKU-1',
            quantity: 99
          }
        ]
      });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe(ErrorCode.INVENTORY_INSUFFICIENT_STOCK);
  });

  it('should reserve and release stock successfully', async () => {
    const reservePayload = {
      orderId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      items: [
        {
          sku: 'SKU-1',
          quantity: 4
        }
      ]
    };

    const reserve = await request(app.getHttpServer())
      .post('/api/v1/inventory/reservations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(reservePayload);

    expect(reserve.status).toBe(201);
    expect(reserve.body.data.status).toBe('ACTIVE');

    const release = await request(app.getHttpServer())
      .post(`/api/v1/inventory/reservations/${reservePayload.orderId}/release`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reason: 'Order cancelled manually'
      });

    expect(release.status).toBe(201);
    expect(release.body.data.status).toBe('RELEASED');

    const stock = await request(app.getHttpServer())
      .get('/api/v1/inventory/stocks/SKU-1')
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(stock.status).toBe(200);
    expect(stock.body.data.onHand).toBe(15);
    expect(stock.body.data.reserved).toBe(0);
    expect(stock.body.data.available).toBe(15);
  });

  it('should expire active reservations in batch', async () => {
    const reservePayload = {
      orderId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      items: [
        {
          sku: 'SKU-1',
          quantity: 2
        }
      ]
    };

    const reserve = await request(app.getHttpServer())
      .post('/api/v1/inventory/reservations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(reservePayload);

    expect(reserve.status).toBe(201);

    const activeReservations = await inventoryReservationRepository.findActiveByOrderId(reservePayload.orderId);
    expect(activeReservations).toHaveLength(1);

    const expiredReservation = {
      ...activeReservations[0],
      expiresAt: new Date(Date.now() - 60_000)
    };
    await inventoryReservationRepository.save(expiredReservation);

    await inventoryService.expireActiveReservationsBatch();

    const remainingActive = await inventoryReservationRepository.findActiveByOrderId(reservePayload.orderId);
    expect(remainingActive).toHaveLength(0);

    const stock = await request(app.getHttpServer())
      .get('/api/v1/inventory/stocks/SKU-1')
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(stock.status).toBe(200);
    expect(stock.body.data.reserved).toBe(0);
    expect(stock.body.data.available).toBe(15);
  });

  it('should return not-found when releasing already confirmed reservation', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/inventory/reservations/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/release')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe(ErrorCode.INVENTORY_RESERVATION_NOT_FOUND);
  });

  it('should return not-found when querying unknown stock sku', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/inventory/stocks/SKU-UNKNOWN')
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe(ErrorCode.INVENTORY_SKU_NOT_FOUND);
  });
});
