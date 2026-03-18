import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, Kafka } from 'kafkajs';
import { AppLogger } from '../../../common/utils/app-logger.util';
import { AnalyticsService } from './analytics.service';

@Injectable()
export class AnalyticsEventsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly consumer: Consumer | null;
  private readonly enabled: boolean;
  private readonly topic: string;
  private isConnected = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly analyticsService: AnalyticsService,
    private readonly logger: AppLogger
  ) {
    this.enabled = this.configService.get<boolean>('kafka.enabled', true);
    this.topic = this.configService.getOrThrow<string>('kafka.analyticsEventsTopic');

    const brokers = this.configService.get<string[]>('kafka.brokers', ['localhost:9092']).filter((broker) => broker.length > 0);
    if (!this.enabled || brokers.length === 0) {
      this.consumer = null;
      return;
    }

    const kafka = new Kafka({
      clientId: this.configService.get<string>('kafka.clientId', 'analytics-service'),
      brokers
    });

    this.consumer = kafka.consumer({
      groupId: this.configService.get<string>('kafka.consumerGroup', 'analytics-service-group')
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.consumer) {
      this.logger.warn(
        JSON.stringify({
          message: 'Kafka consumer disabled',
          topic: this.topic
        }),
        'analytics-consumer'
      );
      return;
    }

    void this.bootstrapConsumer();
  }

  private async bootstrapConsumer(): Promise<void> {
    if (!this.consumer) {
      return;
    }

    try {
      await this.consumer.connect();
      this.isConnected = true;

      await this.consumer.subscribe({
        topic: this.topic,
        fromBeginning: false
      });

      void this.consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) {
            return;
          }

          const result = await this.analyticsService.ingestKafkaMessage(message.key?.toString() ?? null, message.value.toString());
          this.logger.log(
            JSON.stringify({
              message: 'Analytics event consumed',
              topic: this.topic,
              key: message.key?.toString() ?? null,
              result
            }),
            'analytics-consumer'
          );
        }
      });

      this.logger.log(
        JSON.stringify({
          message: 'Kafka consumer started',
          topic: this.topic
        }),
        'analytics-consumer'
      );
    } catch (error) {
      this.isConnected = false;
      this.logger.error(
        JSON.stringify({
          message: 'Kafka consumer bootstrap failed',
          topic: this.topic,
          error: (error as Error).message
        }),
        undefined,
        'analytics-consumer'
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.consumer && this.isConnected) {
      await this.consumer.disconnect();
      this.isConnected = false;
    }
  }
}
