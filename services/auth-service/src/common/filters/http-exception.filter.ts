import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCode } from '../constants/error-code.enum';
import { AppLogger } from '../utils/app-logger.util';

interface ErrorResponseBody {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = ErrorCode.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const errorResponse = exception.getResponse() as string | { code?: ErrorCode; message?: string | string[]; details?: unknown };

      if (typeof errorResponse === 'string') {
        message = errorResponse;
      } else {
        code = errorResponse.code ?? mapStatusToErrorCode(statusCode);
        message = Array.isArray(errorResponse.message) ? errorResponse.message.join(', ') : (errorResponse.message ?? message);
        details = errorResponse.details;
      }
    }

    const requestId = request.requestId ?? 'unknown-request-id';

    const payload: ErrorResponseBody = {
      success: false,
      error: {
        code,
        message,
        details
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString()
      }
    };

    this.logger.error(
      JSON.stringify({
        requestId,
        statusCode,
        code,
        message,
        path: request.url,
        method: request.method
      }),
      undefined,
      'http-exception'
    );

    response.status(statusCode).json(payload);
  }
}

function mapStatusToErrorCode(statusCode: number): ErrorCode {
  if (statusCode === HttpStatus.BAD_REQUEST) return ErrorCode.BAD_REQUEST;
  if (statusCode === HttpStatus.UNAUTHORIZED) return ErrorCode.UNAUTHORIZED;
  if (statusCode === HttpStatus.FORBIDDEN) return ErrorCode.FORBIDDEN;
  if (statusCode === HttpStatus.NOT_FOUND) return ErrorCode.NOT_FOUND;
  if (statusCode === HttpStatus.CONFLICT) return ErrorCode.CONFLICT;
  if (statusCode === HttpStatus.TOO_MANY_REQUESTS) return ErrorCode.TOO_MANY_REQUESTS;
  return ErrorCode.INTERNAL_SERVER_ERROR;
}
