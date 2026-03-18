import { Global, Module } from '@nestjs/common';
import { RedisService } from './utils/redis.service';
import { AppLogger } from './utils/app-logger.util';

@Global()
@Module({
  providers: [AppLogger, RedisService],
  exports: [AppLogger, RedisService]
})
export class CommonModule {}
