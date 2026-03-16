import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import { UserEventsPublisher, UserRegisteredEventPayload } from './user-events.publisher';

@Injectable()
export class KafkaUserEventsPublisher implements UserEventsPublisher, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaUserEventsPublisher.name);
  private readonly producer: Producer | null;
  private readonly topic: string;

  constructor(private readonly configService: ConfigService) {
    const brokers = this.configService
      .get<string>('KAFKA_BROKERS', '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    this.topic = this.configService.get<string>('KAFKA_USER_TOPIC', 'user.registered');
    const isEnabled = this.configService.get<boolean>('KAFKA_ENABLED', false) && brokers.length > 0;

    if (!isEnabled) {
      this.producer = null;
      return;
    }

    const kafka = new Kafka({
      clientId: this.configService.get<string>('KAFKA_CLIENT_ID', 'user-service'),
      brokers
    });
    this.producer = kafka.producer();
  }

  async onModuleInit(): Promise<void> {
    if (!this.producer) {
      return;
    }
    await this.producer.connect();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.producer) {
      return;
    }
    await this.producer.disconnect();
  }

  async publishUserRegistered(event: UserRegisteredEventPayload): Promise<void> {
    if (!this.producer) {
      this.logger.debug('Kafka is disabled, skip publishing user.registered event');
      return;
    }

    await this.producer.send({
      topic: this.topic,
      messages: [
        {
          key: event.userId,
          value: JSON.stringify(event)
        }
      ]
    });
  }
}
