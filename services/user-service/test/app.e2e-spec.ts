import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseEnvelopeInterceptor } from '../src/common/interceptors/response-envelope.interceptor';
import { RequestContextMiddleware } from '../src/common/middlewares/request-context.middleware';
import { HealthController } from '../src/modules/health/controllers/health.controller';
import { HealthService } from '../src/modules/health/services/health.service';
import { ListUsersQueryDto } from '../src/modules/users/dto/list-users-query.dto';
import { UpdateUserDto } from '../src/modules/users/dto/update-user.dto';
import { UserEntity } from '../src/modules/users/entities/user.entity';
import { UserRole } from '../src/modules/users/enums/user-role.enum';
import { UserStatus } from '../src/modules/users/enums/user-status.enum';
import { USER_EVENTS_PUBLISHER, UserEventsPublisher } from '../src/modules/users/events/user-events.publisher';
import { UsersRepository } from '../src/modules/users/repositories/users.repository';
import { UsersController } from '../src/modules/users/controllers/users.controller';
import { UsersService } from '../src/modules/users/services/users.service';

process.env.SERVICE_NAME = 'user-service';

class InMemoryUsersRepository {
  private readonly users = new Map<string, UserEntity>();

  async createUser(payload: Partial<UserEntity>): Promise<UserEntity> {
    const now = new Date();
    const entity: UserEntity = {
      id: randomUUID(),
      email: payload.email ?? '',
      firstName: payload.firstName ?? '',
      lastName: payload.lastName ?? '',
      phone: payload.phone ?? null,
      address: payload.address ?? null,
      role: payload.role ?? UserRole.BUYER,
      status: payload.status ?? UserStatus.PENDING,
      emailVerified: payload.emailVerified ?? false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };

    this.users.set(entity.id, entity);
    return entity;
  }

  async findById(id: string): Promise<UserEntity | null> {
    const entity = this.users.get(id);
    if (!entity || entity.status === UserStatus.DELETED) {
      return null;
    }
    return entity;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const normalized = email.toLowerCase();
    const entity = Array.from(this.users.values()).find((item) => item.email.toLowerCase() === normalized);
    return entity ?? null;
  }

  async findAll(query: ListUsersQueryDto): Promise<{
    items: UserEntity[];
    pagination: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
    };
  }> {
    const normalizedSearch = query.search?.trim().toLowerCase();
    const candidates = Array.from(this.users.values()).filter((item) => {
      if (query.status) {
        if (item.status !== query.status) {
          return false;
        }
      } else if (item.status === UserStatus.DELETED) {
        return false;
      }

      if (query.role && item.role !== query.role) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [item.email, item.firstName, item.lastName]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch);
    });

    const page = query.page;
    const pageSize = query.pageSize;
    const totalItems = candidates.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const start = (page - 1) * pageSize;
    const items = candidates.slice(start, start + pageSize);

    return {
      items,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages
      }
    };
  }

  async updateUser(id: string, payload: UpdateUserDto): Promise<UserEntity | null> {
    const entity = await this.findById(id);
    if (!entity) {
      return null;
    }

    const updated: UserEntity = {
      ...entity,
      ...payload,
      updatedAt: new Date()
    };
    this.users.set(id, updated);
    return updated;
  }

  async updateStatus(id: string, status: UserStatus): Promise<UserEntity | null> {
    return this.updateUser(id, { status });
  }

  async softDelete(id: string): Promise<UserEntity | null> {
    const entity = await this.findById(id);
    if (!entity) {
      return null;
    }

    const updated: UserEntity = {
      ...entity,
      status: UserStatus.DELETED,
      deletedAt: new Date(),
      updatedAt: new Date()
    };
    this.users.set(id, updated);
    return updated;
  }
}

const mockPublisher: UserEventsPublisher = {
  publishUserRegistered: jest.fn().mockResolvedValue(undefined)
};

@Module({
  controllers: [HealthController, UsersController],
  providers: [
    HealthService,
    UsersService,
    {
      provide: UsersRepository,
      useClass: InMemoryUsersRepository
    },
    {
      provide: USER_EVENTS_PUBLISHER,
      useValue: mockPublisher
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseEnvelopeInterceptor
    }
  ]
})
class TestAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}

describe('User service e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestAppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
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
    if (app) {
      await app.close();
    }
  });

  it('GET /api/v1/health should return service health', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('ok');
    expect(response.body.data.service).toBe('user-service');
  });

  it('should create user and publish user.registered event', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/users').send({
      email: 'buyer.one@example.com',
      firstName: 'Buyer',
      lastName: 'One',
      role: 'buyer'
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.email).toBe('buyer.one@example.com');
    expect(mockPublisher.publishUserRegistered).toHaveBeenCalledTimes(1);
  });

  it('should return 409 when creating duplicated email', async () => {
    await request(app.getHttpServer()).post('/api/v1/users').send({
      email: 'duplicate@example.com',
      firstName: 'First',
      lastName: 'User'
    });

    const response = await request(app.getHttpServer()).post('/api/v1/users').send({
      email: 'duplicate@example.com',
      firstName: 'Second',
      lastName: 'User'
    });

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('USER_EMAIL_EXISTS');
  });

  it('should support list/get/update/status/delete user flow', async () => {
    const createResponse = await request(app.getHttpServer()).post('/api/v1/users').send({
      email: 'flow@example.com',
      firstName: 'Flow',
      lastName: 'Tester',
      role: 'seller'
    });

    const userId = createResponse.body.data.id as string;

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/users')
      .query({ page: 1, pageSize: 10, search: 'flow@example.com' });

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.success).toBe(true);
    expect(Array.isArray(listResponse.body.data)).toBe(true);
    expect(listResponse.body.meta.pagination.totalItems).toBeGreaterThanOrEqual(1);

    const getResponse = await request(app.getHttpServer()).get(`/api/v1/users/${userId}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.data.id).toBe(userId);

    const updateResponse = await request(app.getHttpServer()).patch(`/api/v1/users/${userId}`).send({
      firstName: 'Updated'
    });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.firstName).toBe('Updated');

    const updateStatusResponse = await request(app.getHttpServer())
      .patch(`/api/v1/users/${userId}/status`)
      .send({ status: 'active' });
    expect(updateStatusResponse.status).toBe(200);
    expect(updateStatusResponse.body.data.status).toBe('active');

    const deleteResponse = await request(app.getHttpServer()).delete(`/api/v1/users/${userId}`);
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.data.status).toBe('deleted');
  });

  it('should return 400 when payload is invalid', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/users').send({
      email: 'invalid-email',
      firstName: '',
      lastName: 'Invalid'
    });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('USER_SERVICE_VALIDATION_ERROR');
  });
});
