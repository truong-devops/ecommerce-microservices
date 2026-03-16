import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getHealth(): { status: string; service: string; timestamp: string } {
    return {
      status: 'ok',
      service: process.env.SERVICE_NAME ?? 'user-service',
      timestamp: new Date().toISOString()
    };
  }
}
