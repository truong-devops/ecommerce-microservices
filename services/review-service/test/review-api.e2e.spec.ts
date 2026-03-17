import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { LoggingInterceptor } from '../src/common/interceptors/logging.interceptor';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { RequestIdMiddleware } from '../src/common/middlewares/request-id.middleware';
import { AppLogger } from '../src/common/utils/app-logger.util';

const JWT_SECRET = 'change-me-review-access-secret-min-32';
const PRODUCT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SELLER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CUSTOMER_1_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_2_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_CUSTOMER_ID = '44444444-4444-4444-8444-444444444444';

jest.setTimeout(120000);

describe('Review API (e2e)', () => {
  let app: INestApplication;
  let mongoServer: MongoMemoryServer;
  let jwtService: JwtService;
  let reviewId = '';
  let review2Id = '';

  const makeToken = (userId: string, email: string, role: string): string =>
    jwtService.sign({
      sub: userId,
      email,
      role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60
    });

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();

    process.env.APP_NAME = 'review-service';
    process.env.APP_ENV = 'development';
    process.env.PORT = '3019';
    process.env.API_PREFIX = 'api/v1';
    process.env.MONGODB_URI = mongoServer.getUri('review_service_test');
    process.env.JWT_ACCESS_SECRET = JWT_SECRET;

    jwtService = new JwtService({ secret: JWT_SECRET });
    const { AppModule } = await import('../src/app.module');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    const appLogger = app.get(AppLogger);
    app.use(RequestIdMiddleware);
    app.useGlobalFilters(new HttpExceptionFilter(appLogger));
    app.useGlobalInterceptors(new ResponseInterceptor(), new LoggingInterceptor(appLogger));
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true
      })
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('GET /api/v1/health should return success=true', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.service).toBe('review-service');
  });

  it('POST /api/v1/reviews should fail without token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/reviews')
      .send({
        orderId: 'aaaaaaaa-0000-4000-8000-000000000001',
        productId: PRODUCT_ID,
        sellerId: SELLER_ID,
        rating: 5,
        content: 'Great product'
      })
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/v1/reviews should validate payload', async () => {
    const customerToken = makeToken(CUSTOMER_1_ID, 'customer1@example.com', 'CUSTOMER');

    const res = await request(app.getHttpServer())
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId: 'bad-order-id',
        productId: PRODUCT_ID,
        sellerId: SELLER_ID,
        rating: 7,
        content: ''
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('POST /api/v1/reviews should create review for CUSTOMER', async () => {
    const customerToken = makeToken(CUSTOMER_1_ID, 'customer1@example.com', 'CUSTOMER');

    const res = await request(app.getHttpServer())
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId: 'aaaaaaaa-0000-4000-8000-000000000001',
        productId: PRODUCT_ID,
        sellerId: SELLER_ID,
        rating: 5,
        title: 'Excellent',
        content: 'Great product and fast delivery'
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('PUBLISHED');
    reviewId = res.body.data.id;
  });

  it('POST /api/v1/reviews should reject duplicate by orderId+productId+buyerId', async () => {
    const customerToken = makeToken(CUSTOMER_1_ID, 'customer1@example.com', 'CUSTOMER');

    const res = await request(app.getHttpServer())
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId: 'aaaaaaaa-0000-4000-8000-000000000001',
        productId: PRODUCT_ID,
        sellerId: SELLER_ID,
        rating: 4,
        content: 'Duplicate attempt'
      })
      .expect(409);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('REVIEW_ALREADY_EXISTS');
  });

  it('PATCH /api/v1/reviews/:id should return not found for unknown review', async () => {
    const customerToken = makeToken(CUSTOMER_1_ID, 'customer1@example.com', 'CUSTOMER');

    const res = await request(app.getHttpServer())
      .patch('/api/v1/reviews/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        rating: 3
      })
      .expect(404);

    expect(res.body.error.code).toBe('REVIEW_NOT_FOUND');
  });

  it('PATCH /api/v1/reviews/:id should update owner review', async () => {
    const customerToken = makeToken(CUSTOMER_1_ID, 'customer1@example.com', 'CUSTOMER');

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/reviews/${reviewId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        rating: 4,
        content: 'Updated review content'
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.rating).toBe(4);
  });

  it('PATCH /api/v1/reviews/:id should reject non-owner', async () => {
    const otherToken = makeToken(OTHER_CUSTOMER_ID, 'customer2@example.com', 'CUSTOMER');

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/reviews/${reviewId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        content: 'Trying to edit another user review'
      })
      .expect(403);

    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('GET /api/v1/reviews should list published reviews publicly', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/reviews?productId=${PRODUCT_ID}`).expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/v1/reviews should allow second customer for summary', async () => {
    const customerToken = makeToken(CUSTOMER_2_ID, 'customer2@example.com', 'CUSTOMER');

    const res = await request(app.getHttpServer())
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        orderId: 'aaaaaaaa-0000-4000-8000-000000000002',
        productId: PRODUCT_ID,
        sellerId: SELLER_ID,
        rating: 3,
        content: 'It is okay'
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    review2Id = res.body.data.id;
  });

  it('GET /api/v1/reviews/products/:productId/summary should return aggregates', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/reviews/products/${PRODUCT_ID}/summary`).expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.productId).toBe(PRODUCT_ID);
    expect(res.body.data.totalReviews).toBe(2);
    expect(res.body.data.starDistribution['3']).toBe(1);
    expect(res.body.data.starDistribution['4']).toBe(1);
  });

  it('PATCH /api/v1/reviews/:id/moderation should allow ADMIN to hide review', async () => {
    const adminToken = makeToken(ADMIN_ID, 'admin@example.com', 'ADMIN');

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/reviews/${reviewId}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'HIDDEN',
        reason: 'Violates content policy'
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('HIDDEN');
  });

  it('GET /api/v1/reviews/:id should hide non-published review from public', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/reviews/${reviewId}`).expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('REVIEW_NOT_FOUND');
  });

  it('GET /api/v1/reviews/:id should allow owner to view hidden review', async () => {
    const ownerToken = makeToken(CUSTOMER_1_ID, 'customer1@example.com', 'CUSTOMER');

    const res = await request(app.getHttpServer())
      .get(`/api/v1/reviews/${reviewId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('HIDDEN');
  });

  it('POST /api/v1/reviews/:id/reply should allow SELLER of review', async () => {
    const sellerToken = makeToken(SELLER_ID, 'seller@example.com', 'SELLER');

    const res = await request(app.getHttpServer())
      .post(`/api/v1/reviews/${reviewId}/reply`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        content: 'Thank you for your feedback'
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.reply.content).toBe('Thank you for your feedback');
  });

  it('DELETE /api/v1/reviews/:id should soft delete owner review', async () => {
    const ownerToken = makeToken(CUSTOMER_2_ID, 'customer2@example.com', 'CUSTOMER');

    const res = await request(app.getHttpServer())
      .delete(`/api/v1/reviews/${review2Id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('DELETED');
  });

  it('GET /api/v1/reviews/:id should return not found after soft delete', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/reviews/${review2Id}`).expect(404);

    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('REVIEW_NOT_FOUND');
  });

  it('GET /api/v1/reviews/products/:productId/summary should update after soft delete', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/reviews/products/${PRODUCT_ID}/summary`).expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.totalReviews).toBe(0);
  });
});
