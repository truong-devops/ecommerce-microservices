import { Controller, Get } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { HealthService } from '../services/health.service';

@Public()
@Controller(['api/v1', 'api'])
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  async health(): Promise<Record<string, unknown>> {
    return this.healthService.getHealth();
  }

  @Get('ready')
  async ready(): Promise<Record<string, unknown>> {
    return this.healthService.getReadiness();
  }

  @Get('live')
  async live(): Promise<Record<string, unknown>> {
    return this.healthService.getLiveness();
  }
}
