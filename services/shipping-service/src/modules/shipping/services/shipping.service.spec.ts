import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { Role } from '../../../common/constants/role.enum';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import { CreateShipmentDto } from '../dto';
import { ShipmentStatus } from '../entities/shipment-status.enum';
import { ShippingService } from './shipping.service';

describe('ShippingService', () => {
  const manager = {} as EntityManager;

  const dataSource = {
    transaction: jest.fn(async (cb: (entityManager: EntityManager) => Promise<unknown>) => cb(manager))
  } as unknown as DataSource;

  const shipmentRepository = {
    findByOrderId: jest.fn(),
    save: jest.fn(),
    findByIdForUpdate: jest.fn(),
    findById: jest.fn()
  };

  const shipmentTrackingEventRepository = {
    save: jest.fn(),
    listByShipmentId: jest.fn()
  };

  const shipmentStatusHistoryRepository = {
    save: jest.fn()
  };

  const shipmentAuditLogRepository = {
    save: jest.fn()
  };

  const outboxEventRepository = {
    save: jest.fn()
  };

  const webhookIdempotencyRecordRepository = {
    findUnexpired: jest.fn(),
    findByProviderEvent: jest.fn(),
    save: jest.fn()
  };

  const configService = {
    get: jest.fn((key: string, defaultValue: number) => {
      if (key === 'webhookIdempotency.ttlMinutes') {
        return 1440;
      }
      return defaultValue;
    })
  } as unknown as ConfigService;

  const service = new ShippingService(
    configService,
    dataSource,
    shipmentRepository as never,
    shipmentTrackingEventRepository as never,
    shipmentStatusHistoryRepository as never,
    shipmentAuditLogRepository as never,
    outboxEventRepository as never,
    webhookIdempotencyRecordRepository as never
  );

  const staffUser: AuthenticatedUserContext = {
    userId: '22222222-2222-4222-8222-222222222222',
    email: 'staff@example.com',
    role: Role.ADMIN
  };

  const customerUser: AuthenticatedUserContext = {
    userId: '11111111-1111-4111-8111-111111111111',
    email: 'customer@example.com',
    role: Role.CUSTOMER
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates shipment on happy path', async () => {
    shipmentRepository.findByOrderId.mockResolvedValue(null);
    shipmentRepository.save.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      orderId: '44444444-4444-4444-8444-444444444444',
      buyerId: customerUser.userId,
      sellerId: staffUser.userId,
      provider: 'ghn',
      awb: 'AWB-001',
      trackingNumber: 'TRK-001',
      status: ShipmentStatus.PENDING,
      currency: 'USD',
      shippingFee: 5.5,
      codAmount: 0,
      recipientName: 'Buyer One',
      recipientPhone: '0123',
      recipientAddress: 'Address',
      note: null,
      metadata: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z')
    });
    shipmentStatusHistoryRepository.save.mockResolvedValue({});
    shipmentAuditLogRepository.save.mockResolvedValue({});
    outboxEventRepository.save.mockResolvedValue({});

    const dto: CreateShipmentDto = {
      orderId: '44444444-4444-4444-8444-444444444444',
      buyerId: customerUser.userId,
      sellerId: staffUser.userId,
      provider: 'ghn',
      currency: 'USD',
      shippingFee: 5.5,
      codAmount: 0,
      recipientName: 'Buyer One',
      recipientPhone: '0123',
      recipientAddress: 'Address',
      awb: 'AWB-001',
      trackingNumber: 'TRK-001'
    };

    const response = await service.createShipment(staffUser, 'request-1', dto);

    expect(response.id).toBe('55555555-5555-4555-8555-555555555555');
    expect(shipmentRepository.save).toHaveBeenCalledTimes(1);
    expect(outboxEventRepository.save).toHaveBeenCalledTimes(1);
  });

  it('throws conflict when shipment already exists for order', async () => {
    shipmentRepository.findByOrderId.mockResolvedValue({ id: 'existing-id' });

    await expect(
      service.createShipment(staffUser, 'request-1', {
        orderId: '44444444-4444-4444-8444-444444444444',
        buyerId: customerUser.userId,
        sellerId: staffUser.userId,
        provider: 'ghn',
        currency: 'USD',
        recipientName: 'Buyer One',
        recipientPhone: '0123',
        recipientAddress: 'Address'
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws forbidden when customer tries to create shipment', async () => {
    await expect(
      service.createShipment(customerUser, 'request-1', {
        orderId: '44444444-4444-4444-8444-444444444444',
        buyerId: customerUser.userId,
        sellerId: staffUser.userId,
        provider: 'ghn',
        currency: 'USD',
        recipientName: 'Buyer One',
        recipientPhone: '0123',
        recipientAddress: 'Address'
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws invalid transition when updating from PENDING to DELIVERED', async () => {
    shipmentRepository.findByIdForUpdate.mockResolvedValue({
      id: 'shipment-id',
      status: ShipmentStatus.PENDING
    });

    await expect(
      service.updateShipmentStatus(staffUser, 'request-2', 'shipment-id', {
        status: ShipmentStatus.DELIVERED
      })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('throws not found when adding tracking event to unknown shipment', async () => {
    shipmentRepository.findByIdForUpdate.mockResolvedValue(null);

    await expect(
      service.addTrackingEvent(staffUser, 'request-3', 'missing-id', {
        status: ShipmentStatus.IN_TRANSIT
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws forbidden when customer reads shipment of other user', async () => {
    shipmentRepository.findById.mockResolvedValue({
      id: 'shipment-id',
      buyerId: '99999999-9999-4999-8999-999999999999'
    });

    await expect(service.getShipmentById(customerUser, 'shipment-id')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
