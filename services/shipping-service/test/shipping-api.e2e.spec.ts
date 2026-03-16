import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { ShippingController } from '../src/modules/shipping/controllers/shipping.controller';
import { ShippingService } from '../src/modules/shipping/services/shipping.service';

describe('Shipping API (e2e-style)', () => {
  let app: INestApplication;

  const shippingService = {
    createShipment: jest.fn().mockResolvedValue({ id: 'shipment-id' }),
    listShipments: jest.fn().mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } }),
    getShipmentByOrderId: jest.fn().mockResolvedValue({ id: 'shipment-id' }),
    getShipmentById: jest.fn().mockResolvedValue({ id: 'shipment-id' }),
    updateShipmentStatus: jest.fn().mockResolvedValue({ id: 'shipment-id', status: 'PICKED_UP' }),
    addTrackingEvent: jest.fn().mockResolvedValue({ shipment: { id: 'shipment-id' }, trackingEvent: { id: 'event-id' } }),
    getTrackingEvents: jest.fn().mockResolvedValue({ shipmentId: 'shipment-id', events: [] }),
    handleProviderWebhook: jest.fn().mockResolvedValue({ processed: true })
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ShippingController],
      providers: [
        {
          provide: ShippingService,
          useValue: shippingService
        }
      ]
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { requestId: string }).requestId = 'request-id';
      (req as Request & { user: { userId: string; email: string; role: string } }).user = {
        userId: '22222222-2222-4222-8222-222222222222',
        email: 'seller@example.com',
        role: 'SELLER'
      };
      next();
    });
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

  it('returns 400 for validation failure', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/shipments').send({ provider: 'ghn' });

    expect(response.status).toBe(400);
  });

  it('creates shipment with valid payload', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/shipments').send({
      orderId: '44444444-4444-4444-8444-444444444444',
      buyerId: '11111111-1111-4111-8111-111111111111',
      sellerId: '22222222-2222-4222-8222-222222222222',
      provider: 'ghn',
      currency: 'USD',
      shippingFee: 5.5,
      codAmount: 0,
      recipientName: 'Buyer One',
      recipientPhone: '0123',
      recipientAddress: 'Address'
    });

    expect(response.status).toBe(201);
    expect(shippingService.createShipment).toHaveBeenCalledTimes(1);
  });
});
