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
            {
              event: 'http_request',
              request_id: request.requestId,
              method: request.method,
              path: request.url,
              status: response.statusCode,
              duration_ms: durationMs,
              client_ip: request.ip
            },
            'http'
          );
        }
      })
    );
  }
}
