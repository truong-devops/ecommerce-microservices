import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../../common/utils/app-logger.util';
import { NotificationProvider, SendNotificationInput, SendNotificationResult } from './notification-provider.interface';

@Injectable()
export class MockNotificationProviderService implements NotificationProvider {
  constructor(private readonly logger: AppLogger) {}

  async send(input: SendNotificationInput): Promise<SendNotificationResult> {
    this.logger.log(
      JSON.stringify({
        message: 'Mock notification dispatched',
        provider: 'mock-provider',
        notificationId: input.notificationId,
        recipientId: input.recipientId,
        channel: input.channel,
        eventType: input.eventType
      }),
      'notification-provider'
    );

    return {
      provider: 'mock-provider',
      responseMessage: 'accepted'
    };
  }
}
