import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { createHmac, randomUUID } from 'crypto';
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
import { CartController } from '../src/modules/cart/controllers/cart.controller';
import { CartSnapshot } from '../src/modules/cart/entities/cart.types';
import { CartCacheRepository } from '../src/modules/cart/repositories/cart-cache.repository';
import { CartPersistenceRepository } from '../src/modules/cart/repositories/cart-persistence.repository';
import { CART_CACHE_REPOSITORY, CART_PERSISTENCE_REPOSITORY } from '../src/modules/cart/repositories/cart-repository.tokens';
import { CartEventsPublisherService } from '../src/modules/cart/services/cart-events-publisher.service';
import { CartService } from '../src/modules/cart/services/cart.service';
import { CartValidationClientService } from '../src/modules/cart/services/cart-validation-client.service';
import { Controller, Get } from '@nestjs/common';

const JWT_SECRET = 'test-cart-service-secret-min-32chars';

class InMemoryCartCacheRepository implements CartCacheRepository {
  private readonly store = new Map<string, CartSnapshot>();

  async getByUserId(userId: string): Promise<CartSnapshot | null> {
    return this.store.get(userId) ?? null;
  }

  async save(cart: CartSnapshot): Promise<void> {
    this.store.set(cart.userId, JSON.parse(JSON.stringify(cart)) as CartSnapshot);
  }

  async deleteByUserId(userId: string): Promise<void> {
    this.store.delete(userId);
  }
}

class InMemoryCartPersistenceRepository implements CartPersistenceRepository {
  private readonly store = new Map<string, CartSnapshot>();

  isEnabled(): boolean {
    return true;
  }

  async loadByUserId(userId: string): Promise<CartSnapshot | null> {
    return this.store.get(userId) ?? null;
  }

  async save(cart: CartSnapshot): Promise<void> {
    this.store.set(cart.userId, JSON.parse(JSON.stringify(cart)) as CartSnapshot);
  }

  async deleteByUserId(userId: string): Promise<void> {
    this.store.delete(userId);
  }
}

class NoopCartValidationClientService {
  async validateItem(): Promise<[]> {
    return [];
  }
}

class NoopCartEventsPublisherService {
  async publishCartItemAdded(): Promise<void> {}
  async publishCartItemUpdated(): Promise<void> {}
  async publishCartItemRemoved(): Promise<void> {}
  async publishCartCleared(): Promise<void> {}
}

const configServiceMock: Pick<ConfigService, 'get' | 'getOrThrow'> = {
  get<T = any>(key: string, defaultValue?: T): T {
    const map: Record<string, unknown> = {
      'app.name': 'cart-service',
      'app.env': 'test',
      'jwt.access.secret': JWT_SECRET,
      'cart.ttlSeconds': 259200,
      'cart.maxQtyPerItem': 99,
      'cart.defaultCurrency': 'USD'
    };

    if (key in map) {
      return map[key] as T;
    }

    return defaultValue as T;
  },
  getOrThrow<T = any>(key: string): T {
    const value = this.get<T>(key);
    if (value === undefined || value === null) {
      throw new Error(`Missing config key: ${key}`);
    }

    return value;
  }
};

@Controller(['api/v1', 'api'])
class TestHealthController {
  @Public()
  @Get('health')
  health(): Record<string, unknown> {
    return {
      status: 'ok',
      service: 'cart-service',
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
  controllers: [CartController, TestHealthController],
  providers: [
    CartService,
    AppLogger,
    {
      provide: ConfigService,
      useValue: configServiceMock
    },
    {
      provide: CART_CACHE_REPOSITORY,
      useClass: InMemoryCartCacheRepository
    },
    {
      provide: CART_PERSISTENCE_REPOSITORY,
      useClass: InMemoryCartPersistenceRepository
    },
    {
      provide: CartValidationClientService,
      useClass: NoopCartValidationClientService
    },
    {
      provide: CartEventsPublisherService,
      useClass: NoopCartEventsPublisherService
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

describe('Cart service e2e', () => {
  let app: INestApplication;

  const buyerToken = makeToken('11111111-1111-4111-8111-111111111111', 'buyer@example.com', Role.BUYER);
  const sellerToken = makeToken('22222222-2222-4222-8222-222222222222', 'seller@example.com', Role.SELLER);

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
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return health on both versioned and non-versioned routes', async () => {
    const responseV1 = await request(app.getHttpServer()).get('/api/v1/health');
    expect(responseV1.status).toBe(200);
    expect(responseV1.body.success).toBe(true);

    const responseLegacy = await request(app.getHttpServer()).get('/api/health');
    expect(responseLegacy.status).toBe(200);
    expect(responseLegacy.body.success).toBe(true);
  });

  it('should return unauthorized without bearer token', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/cart');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it('should fail validation for invalid payload', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        productId: '',
        unitPrice: -1,
        quantity: 0
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe(ErrorCode.BAD_REQUEST);
  });

  it('should support full cart CRUD + merge + recalculate', async () => {
    const getEmpty = await request(app.getHttpServer())
      .get('/api/cart')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(getEmpty.status).toBe(200);
    expect(getEmpty.body.data.items).toHaveLength(0);

    const addFirst = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        productId: 'product-1',
        variantId: 'variant-1',
        sku: 'SKU-1',
        name: 'Keyboard',
        unitPrice: 10,
        quantity: 2,
        sellerId: 'seller-a'
      });

    expect(addFirst.status).toBe(201);
    expect(addFirst.body.success).toBe(true);
    expect(addFirst.body.data.items).toHaveLength(1);
    expect(addFirst.body.data.subtotal).toBe(20);

    const itemId = addFirst.body.data.items[0].id as string;

    const addMerge = await request(app.getHttpServer())
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        productId: 'product-1',
        variantId: 'variant-1',
        sku: 'SKU-1',
        name: 'Keyboard',
        unitPrice: 10,
        quantity: 1,
        sellerId: 'seller-a'
      });

    expect(addMerge.status).toBe(201);
    expect(addMerge.body.data.items).toHaveLength(1);
    expect(addMerge.body.data.items[0].quantity).toBe(3);
    expect(addMerge.body.data.subtotal).toBe(30);

    const updateItem = await request(app.getHttpServer())
      .patch(`/api/v1/cart/items/${itemId}`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ quantity: 5 });

    expect(updateItem.status).toBe(200);
    expect(updateItem.body.data.items[0].quantity).toBe(5);
    expect(updateItem.body.data.grandTotal).toBe(50);

    const validate = await request(app.getHttpServer())
      .post('/api/cart/validate')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ includeExternalChecks: false });

    expect(validate.status).toBe(201);
    expect(validate.body.data.valid).toBe(true);

    const validateV1 = await request(app.getHttpServer())
      .post('/api/v1/cart/validate')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ includeExternalChecks: false });

    expect(validateV1.status).toBe(201);
    expect(validateV1.body.data.valid).toBe(true);

    const removeItem = await request(app.getHttpServer())
      .delete(`/api/cart/items/${itemId}`)
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(removeItem.status).toBe(200);
    expect(removeItem.body.data.items).toHaveLength(0);

    const removeAgain = await request(app.getHttpServer())
      .delete(`/api/cart/items/${itemId}`)
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(removeAgain.status).toBe(404);
    expect(removeAgain.body.error.code).toBe(ErrorCode.CART_ITEM_NOT_FOUND);

    const clearCart = await request(app.getHttpServer())
      .delete('/api/v1/cart')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(clearCart.status).toBe(200);
    expect(clearCart.body.data.items).toHaveLength(0);
  });

  it('should return business error when quantity exceeds max', async () => {
    const addItem = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        productId: 'product-x',
        sku: 'SKU-X',
        name: 'Mouse',
        unitPrice: 5,
        quantity: 1,
        sellerId: 'seller-a'
      });

    expect(addItem.status).toBe(201);

    const itemId = addItem.body.data.items[0].id as string;
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/cart/items/${itemId}`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ quantity: 999 });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe(ErrorCode.CART_QUANTITY_EXCEEDED);
  });

  it('should return conflict when expectedVersion does not match current cart version', async () => {
    const addItem = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        productId: 'product-version',
        sku: 'SKU-VERSION',
        name: 'Webcam',
        unitPrice: 20,
        quantity: 1,
        sellerId: 'seller-a'
      });

    expect(addItem.status).toBe(201);

    const itemId = addItem.body.data.items[0].id as string;
    const staleVersion = Number(addItem.body.data.version) - 1;

    const response = await request(app.getHttpServer())
      .patch(`/api/cart/items/${itemId}`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        quantity: 2,
        expectedVersion: staleVersion
      });

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe(ErrorCode.CART_VERSION_CONFLICT);
  });

  it('should return forbidden for non-buyer role', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(ErrorCode.FORBIDDEN);
  });

  it('should return not-found when user cart does not exist and removing item', async () => {
    const anotherBuyerToken = makeToken(randomUUID(), 'another@example.com', Role.BUYER);

    const response = await request(app.getHttpServer())
      .delete('/api/v1/cart/items/non-existing-item')
      .set('Authorization', `Bearer ${anotherBuyerToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe(ErrorCode.CART_NOT_FOUND);
  });
});
