import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { HealthController } from './controllers/health.controller';
import { HealthService } from './services/health.service';

@Module({
  imports: [AnalyticsModule],
  controllers: [HealthController],
  providers: [HealthService]
})
export class HealthModule {}
