import { Injectable, LoggerService } from '@nestjs/common';

@Injectable()
export class AppLogger implements LoggerService {
  log(message: string, context?: string): void {
    this.write('info', message, context);
  }

  error(message: string, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
  }

  warn(message: string, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: string, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: string, context?: string): void {
    this.write('verbose', message, context);
  }

  private write(level: string, message: string, context?: string, trace?: string): void {
    const payload: Record<string, unknown> = {
      level,
      message,
      context,
      timestamp: new Date().toISOString()
    };

    if (trace) {
      payload.trace = trace;
    }

    process.stdout.write(`${JSON.stringify(payload)}\n`);
  }
}
