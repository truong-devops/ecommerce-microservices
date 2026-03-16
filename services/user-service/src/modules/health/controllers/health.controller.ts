import { Controller, Get } from '@nestjs/common';
import { HealthService } from '../services/health.service';

@Controller(['health', 'v1/health'])
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth(): { status: string; service: string; timestamp: string } {
    return this.healthService.getHealth();
  }
}
