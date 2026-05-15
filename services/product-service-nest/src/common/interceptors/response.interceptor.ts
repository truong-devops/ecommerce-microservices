import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { RequestWithContext } from '../types/request-context.type';

interface SuccessMeta {
  requestId: string;
  timestamp: string;
  pagination?: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

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
export class ResponseInterceptor<T> implements NestInterceptor<T, Record<string, unknown>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<Record<string, unknown>> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();

    return next.handle().pipe(
      map((payload) => {
        const meta: SuccessMeta = {
          requestId: request.requestId ?? 'unknown-request-id',
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
