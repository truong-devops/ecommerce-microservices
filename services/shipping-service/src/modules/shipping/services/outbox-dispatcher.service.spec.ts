import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../../common/utils/app-logger.util';
import { OutboxStatus } from '../entities/outbox-status.enum';
import { OutboxDispatcherService } from './outbox-dispatcher.service';

describe('OutboxDispatcherService', () => {
  const outboxEventRepository = {
    findDispatchable: jest.fn(),
    markPublished: jest.fn(),
    markFailed: jest.fn()
  };

  const eventsPublisherService = {
    publish: jest.fn()
  };

  const configService = {
    get: jest.fn((key: string, defaultValue: number) => {
      if (key === 'outbox.dispatcherIntervalMs') return 1000;
      if (key === 'outbox.batchSize') return 50;
      if (key === 'outbox.maxRetry') return 10;
      return defaultValue;
    })
  } as unknown as ConfigService;

  const logger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn()
  } as unknown as AppLogger;

  const service = new OutboxDispatcherService(
    configService,
    outboxEventRepository as never,
    eventsPublisherService as never,
    logger
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks event as published when publish succeeds', async () => {
    outboxEventRepository.findDispatchable.mockResolvedValue([
      {
        id: 'event-1',
        eventType: 'shipment.created',
        payload: {},
        retryCount: 0,
        status: OutboxStatus.PENDING
      }
    ]);
    eventsPublisherService.publish.mockResolvedValue(undefined);

    await (service as unknown as { dispatchPending: () => Promise<void> }).dispatchPending();

    expect(eventsPublisherService.publish).toHaveBeenCalledTimes(1);
    expect(outboxEventRepository.markPublished).toHaveBeenCalledWith('event-1');
  });

  it('marks event as failed when publish throws', async () => {
    outboxEventRepository.findDispatchable.mockResolvedValue([
      {
        id: 'event-2',
        eventType: 'shipment.created',
        payload: {},
        retryCount: 1,
        status: OutboxStatus.FAILED
      }
    ]);
    eventsPublisherService.publish.mockRejectedValue(new Error('kafka error'));

    await (service as unknown as { dispatchPending: () => Promise<void> }).dispatchPending();

    expect(outboxEventRepository.markFailed).toHaveBeenCalledTimes(1);
  });
});
