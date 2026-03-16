import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './controllers/health.controller';
import { HealthService } from './services/health.service';

@Module({
  imports: [TypeOrmModule],
  controllers: [HealthController],
  providers: [HealthService]
})
export class HealthModule {}
