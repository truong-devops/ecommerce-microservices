import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { WebsocketModule } from './websocket/websocket.module';

@Module({
  imports: [WebsocketModule],
  controllers: [HealthController],
  providers: [HealthService]
})
export class AppModule {}
