import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { HealthController } from './controllers/health.controller';
import { HealthService } from './services/health.service';

@Module({
  imports: [CommonModule],
  controllers: [HealthController],
  providers: [HealthService]
})
export class HealthModule {}
