import { Injectable, LoggerService } from '@nestjs/common';

@Injectable()
export class AppLogger implements LoggerService {
  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }

  private write(level: string, message: unknown, context?: string, trace?: string): void {
    const fields =
      message && typeof message === 'object' && !Array.isArray(message)
        ? (message as Record<string, unknown>)
        : { message };

    const payload: Record<string, unknown> = {
      level,
      service: process.env.APP_NAME ?? 'auth-service',
      context,
      timestamp: new Date().toISOString(),
      ...fields
    };

    if (trace) {
      payload.trace = trace;
    }

    process.stdout.write(`${JSON.stringify(payload)}\n`);
  }
}
