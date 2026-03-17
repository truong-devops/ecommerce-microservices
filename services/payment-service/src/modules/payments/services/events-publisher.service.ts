import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import { AppLogger } from '../../../common/utils/app-logger.util';
import { PaymentEventType } from '../events/payment-event-type.enum';

@Injectable()
export class EventsPublisherService implements OnModuleDestroy {
  private readonly kafka: Kafka;
  private readonly producer: Producer;
  private isConnected = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger
  ) {
    this.kafka = new Kafka({
      clientId: 'payment-service',
      brokers: this.configService.get<string[]>('kafka.brokers', ['localhost:9092'])
    });

    this.producer = this.kafka.producer();
  }

  async publish(eventType: PaymentEventType, payload: Record<string, unknown>): Promise<void> {
    await this.ensureConnected();

    const topics = this.resolveTopics();

    await Promise.all(
      topics.map((topic) =>
        this.producer.send({
          topic,
          messages: [
            {
              key: eventType,
              value: JSON.stringify({
                eventType,
                payload,
                occurredAt: new Date().toISOString()
              })
            }
          ]
        })
      )
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.isConnected) {
      await this.producer.disconnect();
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    await this.producer.connect();
    this.isConnected = true;
    this.logger.log(JSON.stringify({ message: 'Kafka producer connected', service: 'payment-service' }), 'events-publisher');
  }

  private resolveTopics(): string[] {
    const topics = new Set<string>();

    topics.add(this.configService.getOrThrow<string>('kafka.paymentEventsTopic'));
    topics.add(this.configService.getOrThrow<string>('kafka.notificationEventsTopic'));
    topics.add(this.configService.getOrThrow<string>('kafka.analyticsEventsTopic'));

    return [...topics];
  }
}
