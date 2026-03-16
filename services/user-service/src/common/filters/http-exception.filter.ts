import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { Response } from 'express';
import { USER_SERVICE_ERROR_CODES } from '../constants/error-codes.constant';
import { ApiErrorEnvelope } from '../interfaces/api-envelope.interface';
import { RequestContextRequest } from '../interfaces/request-context.interface';

type ErrorResponseBody = {
  message?: string | string[];
  code?: string;
  details?: unknown;
  error?: unknown;
};

function mapStatusToErrorCode(statusCode: number): string {
  switch (statusCode) {
    case HttpStatus.BAD_REQUEST:
      return USER_SERVICE_ERROR_CODES.VALIDATION_ERROR;
    case HttpStatus.NOT_FOUND:
      return USER_SERVICE_ERROR_CODES.USER_NOT_FOUND;
    case HttpStatus.CONFLICT:
      return USER_SERVICE_ERROR_CODES.USER_EMAIL_EXISTS;
    default:
      return USER_SERVICE_ERROR_CODES.INTERNAL_ERROR;
  }
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestContextRequest>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const rawResponse = isHttpException ? exception.getResponse() : null;
    const errorBody = (typeof rawResponse === 'object' ? rawResponse : {}) as ErrorResponseBody;

    const message =
      (Array.isArray(errorBody.message) ? errorBody.message.join(', ') : errorBody.message) ||
      (isHttpException ? exception.message : 'Internal server error');

    const code = errorBody.code || mapStatusToErrorCode(statusCode);
    const details = errorBody.details || errorBody.error;

    const payload: ApiErrorEnvelope = {
      success: false,
      error: {
        code,
        message,
        details
      },
      meta: {
        requestId: request.requestId ?? 'unknown',
        timestamp: new Date().toISOString()
      }
    };

    this.logger.error(
      `${request.method} ${request.url} ${statusCode} ${message}`,
      isHttpException ? undefined : (exception as Error)?.stack
    );

    response.status(statusCode).json(payload);
  }
}
