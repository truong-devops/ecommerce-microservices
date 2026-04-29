import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RequestIdMiddleware } from './common/middlewares/request-id.middleware';
import { AppLogger } from './common/utils/app-logger.util';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true
  });

  const configService = app.get(ConfigService);
  const appLogger = app.get(AppLogger);

  app.useLogger(appLogger);
  app.use(RequestIdMiddleware);
  app.useStaticAssets(join(process.cwd(), 'seed-data', 'image'), {
    prefix: '/api/v1/products/assets/'
  });
  app.useGlobalFilters(new HttpExceptionFilter(appLogger, configService));
  app.useGlobalInterceptors(new ResponseInterceptor(), new LoggingInterceptor(appLogger, configService));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true
    })
  );

  const apiPrefix = configService.get<string>('app.apiPrefix', 'api/v1');
  app.setGlobalPrefix(apiPrefix);
  app.enableShutdownHooks();

  const port = configService.get<number>('app.port', 3003);
  await app.listen(port);

  appLogger.log(
    JSON.stringify({
      message: 'Product service started',
      service: configService.get<string>('app.name', 'product-service'),
      port,
      apiPrefix
    })
  );
}

void bootstrap();
