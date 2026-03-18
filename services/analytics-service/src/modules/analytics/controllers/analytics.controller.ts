import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '../../../common/constants/role.enum';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequestWithContext } from '../../../common/types/request-context.type';
import {
  QueryOverviewDto,
  QueryPaymentsSummaryDto,
  QueryShippingSummaryDto,
  QueryTimeseriesDto
} from '../dto';
import { AnalyticsService } from '../services/analytics.service';

@Controller(['api/v1/analytics', 'api/analytics'])
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @Roles(Role.SELLER, Role.ADMIN, Role.SUPPORT, Role.SUPER_ADMIN)
  async getOverview(
    @CurrentUser() user: RequestWithContext['user'],
    @Query() query: QueryOverviewDto
  ): Promise<Record<string, unknown>> {
    return this.analyticsService.getOverview(user!, query);
  }

  @Get('events/timeseries')
  @Roles(Role.SELLER, Role.ADMIN, Role.SUPPORT, Role.SUPER_ADMIN)
  async getEventsTimeseries(
    @CurrentUser() user: RequestWithContext['user'],
    @Query() query: QueryTimeseriesDto
  ): Promise<Record<string, unknown>> {
    return this.analyticsService.getTimeseries(user!, query);
  }

  @Get('payments/summary')
  @Roles(Role.SELLER, Role.ADMIN, Role.SUPPORT, Role.SUPER_ADMIN)
  async getPaymentsSummary(
    @CurrentUser() user: RequestWithContext['user'],
    @Query() query: QueryPaymentsSummaryDto
  ): Promise<Record<string, unknown>> {
    return this.analyticsService.getPaymentsSummary(user!, query);
  }

  @Get('shipping/summary')
  @Roles(Role.SELLER, Role.ADMIN, Role.SUPPORT, Role.SUPER_ADMIN)
  async getShippingSummary(
    @CurrentUser() user: RequestWithContext['user'],
    @Query() query: QueryShippingSummaryDto
  ): Promise<Record<string, unknown>> {
    return this.analyticsService.getShippingSummary(user!, query);
  }
}
