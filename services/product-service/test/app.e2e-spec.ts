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
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { RequestIdMiddleware } from '../src/common/middlewares/request-id.middleware';
import { AppLogger } from '../src/common/utils/app-logger.util';
import { ProductsController } from '../src/modules/products/controllers/products.controller';
import { CreateProductPayload, ProductsRepository, UpdateProductPayload } from '../src/modules/products/repositories/products.repository';
import { ProductEventsPublisherService } from '../src/modules/products/services/product-events-publisher.service';
import { ProductSearchService } from '../src/modules/products/services/product-search.service';
import { ProductsService } from '../src/modules/products/services/products.service';
import { ListProductsDto, ProductSortBy, SortOrder } from '../src/modules/products/dto/list-products.dto';
import { ProductStatus } from '../src/modules/products/entities/product-status.enum';

const JWT_SECRET = 'test-product-service-secret-min-32chars';

interface InMemoryProduct {
  id: string;
  sellerId: string;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string;
  brand: string | null;
  status: ProductStatus;
  attributes: Record<string, unknown>;
  images: string[];
  variants: Array<{
    sku: string;
    name: string;
    price: number;
    currency: string;
    compareAtPrice?: number | null;
    isDefault: boolean;
    metadata: Record<string, unknown>;
  }>;
  minPrice: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

class InMemoryProductsRepository {
  private readonly products = new Map<string, InMemoryProduct>();

  async createProduct(payload: CreateProductPayload): Promise<any> {
    const now = new Date();
    const id = randomUUID();
    const record: InMemoryProduct = {
      id,
      sellerId: payload.sellerId,
      name: payload.name,
      slug: payload.slug,
      description: payload.description ?? null,
      categoryId: payload.categoryId,
      brand: payload.brand ?? null,
      status: payload.status,
      attributes: payload.attributes,
      images: payload.images,
      variants: payload.variants as InMemoryProduct['variants'],
      minPrice: payload.minPrice,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };

    this.products.set(id, record);
    return record;
  }

  async findById(id: string, includeDeleted = false): Promise<any | null> {
    const record = this.products.get(id);
    if (!record) {
      return null;
    }

    if (!includeDeleted && record.deletedAt) {
      return null;
    }

    return record;
  }

  async findBySlug(slug: string, excludeId?: string): Promise<any | null> {
    const record = Array.from(this.products.values()).find((item) => {
      if (excludeId && item.id === excludeId) return false;
      return item.slug === slug && item.deletedAt === null;
    });

    return record ?? null;
  }

  async findFirstBySkus(skus: string[], excludeId?: string): Promise<any | null> {
    const set = new Set(skus.map((value) => value.toUpperCase()));
    const record = Array.from(this.products.values()).find((item) => {
      if (excludeId && item.id === excludeId) return false;
      if (item.deletedAt !== null) return false;
      return item.variants.some((variant) => set.has(variant.sku.toUpperCase()));
    });

    return record ?? null;
  }

  async listProducts(queryDto: ListProductsDto, fixed: { status?: ProductStatus; sellerId?: string; ids?: string[] } = {}): Promise<{items:any[];totalItems:number}> {
    const page = queryDto.page ?? 1;
    const pageSize = queryDto.pageSize ?? 20;

    const idsSet = fixed.ids ? new Set(fixed.ids) : null;

    let rows = Array.from(this.products.values()).filter((item) => item.deletedAt === null);

    const status = fixed.status ?? queryDto.status;
    if (status) {
      rows = rows.filter((item) => item.status === status);
    }

    const sellerId = fixed.sellerId ?? queryDto.sellerId;
    if (sellerId) {
      rows = rows.filter((item) => item.sellerId === sellerId);
    }

    if (queryDto.categoryId) {
      rows = rows.filter((item) => item.categoryId === queryDto.categoryId);
    }

    if (queryDto.brand) {
      rows = rows.filter((item) => item.brand === queryDto.brand);
    }

    if (queryDto.search) {
      const search = queryDto.search.toLowerCase();
      rows = rows.filter((item) => {
        const candidate = [item.name, item.slug, item.brand ?? '', ...item.variants.map((variant) => variant.sku)]
          .join(' ')
          .toLowerCase();
        return candidate.includes(search);
      });
    }

    if (idsSet) {
      rows = rows.filter((item) => idsSet.has(item.id));
    }

    const sortBy = queryDto.sortBy ?? ProductSortBy.CREATED_AT;
    const order = queryDto.sortOrder ?? SortOrder.DESC;
    rows.sort((left, right) => {
      const direction = order === SortOrder.ASC ? 1 : -1;
      if (sortBy === ProductSortBy.NAME) return left.name.localeCompare(right.name) * direction;
      if (sortBy === ProductSortBy.MIN_PRICE) return (left.minPrice - right.minPrice) * direction;
      if (sortBy === ProductSortBy.UPDATED_AT) return (left.updatedAt.getTime() - right.updatedAt.getTime()) * direction;
      return (left.createdAt.getTime() - right.createdAt.getTime()) * direction;
    });

    const totalItems = rows.length;
    const items = rows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

    return {
      items,
      totalItems
    };
  }

  async findByIdsOrdered(ids: string[]): Promise<any[]> {
    return ids
      .map((id) => this.products.get(id) ?? null)
      .filter((item): item is InMemoryProduct => item !== null && item.deletedAt === null);
  }

  async updateById(id: string, payload: UpdateProductPayload): Promise<any | null> {
    const current = this.products.get(id);
    if (!current || current.deletedAt) {
      return null;
    }

    const updated: InMemoryProduct = {
      ...current,
      ...payload,
      updatedAt: new Date()
    };

    this.products.set(id, updated);
    return updated;
  }

  async softDelete(id: string): Promise<any | null> {
    const current = this.products.get(id);
    if (!current || current.deletedAt) {
      return null;
    }

    const updated: InMemoryProduct = {
      ...current,
      status: ProductStatus.ARCHIVED,
      deletedAt: new Date(),
      updatedAt: new Date()
    };

    this.products.set(id, updated);
    return updated;
  }
}

class NoopProductSearchService {
  async searchProducts(): Promise<null> {
    return null;
  }

  async indexProduct(): Promise<void> {}

  async deleteProduct(): Promise<void> {}
}

class NoopProductEventsPublisherService {
  async publishProductCreated(): Promise<void> {}
  async publishProductUpdated(): Promise<void> {}
  async publishProductStatusChanged(): Promise<void> {}
  async publishProductDeleted(): Promise<void> {}
}

const configServiceMock: Pick<ConfigService, 'get' | 'getOrThrow'> = {
  get<T = any>(key: string, defaultValue?: T): T {
    const map: Record<string, unknown> = {
      'app.name': 'product-service',
      'app.env': 'test',
      'jwt.access.secret': JWT_SECRET,
      'search.enabled': false,
      'kafka.enabled': false
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
  controllers: [ProductsController],
  providers: [
    ProductsService,
    AppLogger,
    {
      provide: ConfigService,
      useValue: configServiceMock
    },
    {
      provide: ProductsRepository,
      useClass: InMemoryProductsRepository
    },
    {
      provide: ProductSearchService,
      useClass: NoopProductSearchService
    },
    {
      provide: ProductEventsPublisherService,
      useClass: NoopProductEventsPublisherService
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

describe('Product service e2e', () => {
  let app: INestApplication;
  const sellerId = '11111111-1111-4111-8111-111111111111';
  const sellerToken = makeToken(sellerId, 'seller@example.com', Role.SELLER);
  const anotherSellerToken = makeToken('22222222-2222-4222-8222-222222222222', 'another@example.com', Role.SELLER);
  const adminToken = makeToken('33333333-3333-4333-8333-333333333333', 'admin@example.com', Role.ADMIN);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestAppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
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

  it('should return unauthorized without bearer token', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/products').send({
      name: 'Laptop Stand',
      categoryId: 'furniture',
      variants: [{ sku: 'SKU-1', name: 'Default', price: 10, currency: 'USD' }]
    });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it('should fail validation for invalid payload', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        name: '',
        categoryId: 'furniture',
        variants: []
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe(ErrorCode.BAD_REQUEST);
  });

  it('should complete CRUD + public search flow', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        name: 'Laptop Stand Pro',
        categoryId: 'furniture',
        brand: 'Acme',
        attributes: { color: 'black' },
        images: ['https://cdn.example.com/laptop-stand.png'],
        variants: [
          {
            sku: 'SKU-LS-PRO-001',
            name: 'Default',
            price: 19.99,
            currency: 'USD',
            isDefault: true
          }
        ]
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.success).toBe(true);
    expect(createResponse.body.data.status).toBe(ProductStatus.DRAFT);

    const productId = createResponse.body.data.id as string;

    const duplicateSlugResponse = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        name: 'Laptop Stand Pro',
        categoryId: 'furniture',
        variants: [{ sku: 'SKU-LS-PRO-002', name: 'Default', price: 20, currency: 'USD' }]
      });

    expect(duplicateSlugResponse.status).toBe(409);
    expect(duplicateSlugResponse.body.error.code).toBe(ErrorCode.PRODUCT_SLUG_EXISTS);

    const forbiddenUpdateResponse = await request(app.getHttpServer())
      .patch(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${anotherSellerToken}`)
      .send({
        name: 'Hijacked Name'
      });

    expect(forbiddenUpdateResponse.status).toBe(403);
    expect(forbiddenUpdateResponse.body.error.code).toBe(ErrorCode.FORBIDDEN);

    const updateResponse = await request(app.getHttpServer())
      .patch(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        name: 'Laptop Stand Pro Plus',
        variants: [{ sku: 'SKU-LS-PRO-001', name: 'Default', price: 21.99, currency: 'USD', isDefault: true }]
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.name).toBe('Laptop Stand Pro Plus');

    const statusResponse = await request(app.getHttpServer())
      .patch(`/api/v1/products/${productId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: ProductStatus.ACTIVE
      });

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.data.status).toBe(ProductStatus.ACTIVE);

    const publicListResponse = await request(app.getHttpServer())
      .get('/api/v1/products')
      .query({ search: 'pro plus' });

    expect(publicListResponse.status).toBe(200);
    expect(publicListResponse.body.success).toBe(true);
    expect(Array.isArray(publicListResponse.body.data)).toBe(true);
    expect(publicListResponse.body.data.some((item: any) => item.id === productId)).toBe(true);

    const publicGetResponse = await request(app.getHttpServer()).get(`/api/v1/products/${productId}`);

    expect(publicGetResponse.status).toBe(200);
    expect(publicGetResponse.body.data.id).toBe(productId);

    const deleteResponse = await request(app.getHttpServer())
      .delete(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.data.status).toBe(ProductStatus.ARCHIVED);

    const getDeletedResponse = await request(app.getHttpServer()).get(`/api/v1/products/${productId}`);

    expect(getDeletedResponse.status).toBe(404);
    expect(getDeletedResponse.body.error.code).toBe(ErrorCode.PRODUCT_NOT_FOUND);
  });

  it('should return not-found for unknown product', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/products/${randomUUID()}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe(ErrorCode.PRODUCT_NOT_FOUND);
  });
});
