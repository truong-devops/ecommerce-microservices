import { NotificationChannel } from '../entities/notification-channel.enum';

export interface SendNotificationInput {
  notificationId: string;
  recipientId: string;
  channel: NotificationChannel;
  subject: string | null;
  content: string;
  eventType: string | null;
  payload: Record<string, unknown> | null;
}

export interface SendNotificationResult {
  provider: string;
  responseMessage?: string;
}

export interface NotificationProvider {
  send(input: SendNotificationInput): Promise<SendNotificationResult>;
}
