import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../constants/error-code.enum';

interface AppExceptionPayload {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export class AppException extends HttpException {
  constructor(status: HttpStatus, payload: AppExceptionPayload) {
    super(payload, status);
  }
}
