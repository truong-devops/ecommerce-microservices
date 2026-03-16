import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AppLogger } from '../utils/app-logger.util';
import { RequestWithContext } from '../types/request-context.type';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {}

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
              method: request.method,
              path: request.url,
              statusCode: response.statusCode,
              durationMs,
              clientIp: request.ip
            }),
            'http'
          );
        }
      })
    );
  }
}
