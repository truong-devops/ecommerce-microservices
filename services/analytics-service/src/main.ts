import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RequestIdMiddleware } from './common/middlewares/request-id.middleware';
import { AppLogger } from './common/utils/app-logger.util';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true
  });

  const configService = app.get(ConfigService);
  const appLogger = app.get(AppLogger);

  app.useLogger(appLogger);
  app.use(RequestIdMiddleware);
  app.useGlobalFilters(new HttpExceptionFilter(appLogger, configService));
  app.useGlobalInterceptors(new ResponseInterceptor(), new LoggingInterceptor(appLogger, configService));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true
    })
  );

  app.enableShutdownHooks();

  const port = configService.get<number>('app.port', 3010);
  await app.listen(port);

  appLogger.log(
    JSON.stringify({
      message: 'Analytics service started',
      service: configService.get<string>('app.name', 'analytics-service'),
      port
    })
  );
}

void bootstrap();
