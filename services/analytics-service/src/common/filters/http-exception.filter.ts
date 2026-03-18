import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { ErrorCode } from '../constants/error-code.enum';
import { AppLogger } from '../utils/app-logger.util';
import { RequestWithContext } from '../types/request-context.type';

interface ErrorResponseBody {
  code?: ErrorCode;
  message?: string | string[];
  details?: unknown;
  error?: unknown;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly logger: AppLogger,
    private readonly configService: ConfigService
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithContext & Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = ErrorCode.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const errorResponse = exception.getResponse() as string | ErrorResponseBody;

      if (typeof errorResponse === 'string') {
        message = errorResponse;
      } else {
        code = errorResponse.code ?? mapStatusToErrorCode(statusCode);
        message = Array.isArray(errorResponse.message) ? errorResponse.message.join(', ') : (errorResponse.message ?? message);
        details = errorResponse.details ?? errorResponse.error;
      }
    }

    const isProduction = this.configService.get<string>('app.env', 'development') === 'production';

    this.logger.error(
      JSON.stringify({
        requestId: request.requestId ?? 'unknown-request-id',
        service: this.configService.get<string>('app.name', 'analytics-service'),
        path: request.url,
        method: request.method,
        statusCode,
        code,
        message
      }),
      !isProduction && exception instanceof Error ? exception.stack : undefined,
      'http-exception'
    );

    response.status(statusCode).json({
      success: false,
      error: {
        code,
        message,
        details
      },
      meta: {
        requestId: request.requestId ?? 'unknown-request-id',
        timestamp: new Date().toISOString()
      }
    });
  }
}

function mapStatusToErrorCode(statusCode: number): ErrorCode {
  if (statusCode === HttpStatus.BAD_REQUEST) return ErrorCode.BAD_REQUEST;
  if (statusCode === HttpStatus.UNAUTHORIZED) return ErrorCode.UNAUTHORIZED;
  if (statusCode === HttpStatus.FORBIDDEN) return ErrorCode.FORBIDDEN;
  if (statusCode === HttpStatus.NOT_FOUND) return ErrorCode.NOT_FOUND;
  if (statusCode === HttpStatus.CONFLICT) return ErrorCode.CONFLICT;
  if (statusCode === HttpStatus.UNPROCESSABLE_ENTITY) return ErrorCode.VALIDATION_FAILED;
  if (statusCode === HttpStatus.SERVICE_UNAVAILABLE) return ErrorCode.SERVICE_UNAVAILABLE;
  return ErrorCode.INTERNAL_SERVER_ERROR;
}
