import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  constructor(private readonly dataSource: DataSource) {}

  async getHealth(): Promise<Record<string, unknown>> {
    return {
      status: 'ok',
      service: 'inventory-service',
      timestamp: new Date().toISOString()
    };
  }

  async getReadiness(): Promise<Record<string, unknown>> {
    await this.dataSource.query('SELECT 1');

    return {
      status: 'ready',
      dependencies: {
        postgres: true
      },
      timestamp: new Date().toISOString()
    };
  }

  async getLiveness(): Promise<Record<string, unknown>> {
    return {
      status: 'alive',
      service: 'inventory-service',
      timestamp: new Date().toISOString()
    };
  }
}
