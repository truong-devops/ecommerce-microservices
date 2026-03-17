import { Global, Module } from '@nestjs/common';
import { AppLogger } from './utils/app-logger.util';
import { RedisService } from './utils/redis.service';

@Global()
@Module({
  providers: [AppLogger, RedisService],
  exports: [AppLogger, RedisService]
})
export class CommonModule {}
