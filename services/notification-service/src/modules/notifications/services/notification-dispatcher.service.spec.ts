import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../../common/utils/app-logger.util';
import { NotificationChannel } from '../entities/notification-channel.enum';
import { NotificationStatus } from '../entities/notification-status.enum';
import { NotificationDispatcherService } from './notification-dispatcher.service';

describe('NotificationDispatcherService', () => {
  const notificationRepository = {
    findDispatchable: jest.fn(),
    markSent: jest.fn(),
    markFailed: jest.fn()
  };

  const notificationAttemptRepository = {
    save: jest.fn()
  };

  const notificationProvider = {
    send: jest.fn()
  };

  const configService = {
    get: jest.fn((key: string, defaultValue: number) => {
      if (key === 'dispatch.intervalMs') return 1000;
      if (key === 'dispatch.batchSize') return 50;
      if (key === 'dispatch.maxRetry') return 10;
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

  const service = new NotificationDispatcherService(
    configService,
    notificationRepository as never,
    notificationAttemptRepository as never,
    notificationProvider as never,
    logger
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks notification as sent on provider success', async () => {
    notificationRepository.findDispatchable.mockResolvedValue([
      {
        id: 'notification-1',
        recipientId: '11111111-1111-4111-8111-111111111111',
        channel: NotificationChannel.EMAIL,
        subject: 'Subject',
        content: 'Body',
        eventType: 'auth.email.verification.requested',
        payload: {},
        retryCount: 0
      }
    ]);
    notificationProvider.send.mockResolvedValue({
      provider: 'mock-provider',
      responseMessage: 'accepted'
    });

    await (service as unknown as { dispatchPending: () => Promise<void> }).dispatchPending();

    expect(notificationRepository.markSent).toHaveBeenCalledWith('notification-1');
    expect(notificationAttemptRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: 'notification-1',
        status: NotificationStatus.SENT
      })
    );
  });

  it('marks notification as failed on provider error', async () => {
    notificationRepository.findDispatchable.mockResolvedValue([
      {
        id: 'notification-2',
        recipientId: '11111111-1111-4111-8111-111111111111',
        channel: NotificationChannel.EMAIL,
        subject: 'Subject',
        content: 'Body',
        eventType: 'auth.password.reset.requested',
        payload: {},
        retryCount: 1
      }
    ]);
    notificationProvider.send.mockRejectedValue(new Error('provider down'));

    await (service as unknown as { dispatchPending: () => Promise<void> }).dispatchPending();

    expect(notificationRepository.markFailed).toHaveBeenCalledTimes(1);
    expect(notificationAttemptRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: 'notification-2',
        status: NotificationStatus.FAILED
      })
    );
  });
});
