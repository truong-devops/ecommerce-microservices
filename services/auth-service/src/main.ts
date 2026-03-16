import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { RequestIdMiddleware } from './common/middlewares/request-id.middleware';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AppLogger } from './common/utils/app-logger.util';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true
  });

  const configService = app.get(ConfigService);
  const appLogger = app.get(AppLogger);

  app.useLogger(appLogger);
  app.use(RequestIdMiddleware);
  app.useGlobalFilters(new HttpExceptionFilter(appLogger));
  app.useGlobalInterceptors(new ResponseInterceptor(), new LoggingInterceptor(appLogger));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true
    })
  );

  const apiPrefix = configService.get<string>('app.apiPrefix', 'api/v1');
  app.setGlobalPrefix(apiPrefix);

  const port = configService.get<number>('app.port', 3001);
  await app.listen(port);

  appLogger.log(
    JSON.stringify({
      message: 'Auth service started',
      port,
      apiPrefix,
      service: configService.get<string>('app.name', 'auth-service')
    })
  );
}

void bootstrap();
