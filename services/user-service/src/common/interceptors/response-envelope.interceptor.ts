import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ApiSuccessEnvelope, SuccessMeta } from '../interfaces/api-envelope.interface';
import { RequestContextRequest } from '../interfaces/request-context.interface';

interface PaginatedPayload<T> {
  items: T[];
  pagination: SuccessMeta['pagination'];
}

function hasPaginationShape<T>(value: unknown): value is PaginatedPayload<T> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return 'items' in value && 'pagination' in value;
}

@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<T, ApiSuccessEnvelope<T | unknown>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccessEnvelope<T | unknown>> {
    const request = context.switchToHttp().getRequest<RequestContextRequest>();

    return next.handle().pipe(
      map((payload) => {
        const meta: SuccessMeta = {
          requestId: request.requestId ?? 'unknown',
          timestamp: new Date().toISOString()
        };

        if (hasPaginationShape(payload)) {
          return {
            success: true,
            data: payload.items,
            meta: {
              ...meta,
              pagination: payload.pagination
            }
          };
        }

        return {
          success: true,
          data: payload,
          meta
        };
      })
    );
  }
}
