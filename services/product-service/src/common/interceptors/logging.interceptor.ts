import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, tap } from 'rxjs';
import { RequestWithContext } from '../types/request-context.type';
import { AppLogger } from '../utils/app-logger.util';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: AppLogger,
    private readonly configService: ConfigService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const response = context.switchToHttp().getResponse<{ statusCode: number }>();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - start;
          this.logger.log(
            JSON.stringify({
              requestId: request.requestId,
              service: this.configService.get<string>('app.name', 'product-service'),
              path: request.url,
              method: request.method,
              statusCode: response.statusCode,
              durationMs
            }),
            'http'
          );
        }
      })
    );
  }
}
