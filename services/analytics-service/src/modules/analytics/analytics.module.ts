import { Module } from '@nestjs/common';
import { AnalyticsController } from './controllers/analytics.controller';
import { AnalyticsRepository } from './repositories/analytics.repository';
import { AnalyticsEventsConsumerService } from './services/analytics-events-consumer.service';
import { AnalyticsEventNormalizerService } from './services/analytics-event-normalizer.service';
import { AnalyticsService } from './services/analytics.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsRepository, AnalyticsEventNormalizerService, AnalyticsService, AnalyticsEventsConsumerService],
  exports: [AnalyticsRepository]
})
export class AnalyticsModule {}
