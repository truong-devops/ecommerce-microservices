import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Role } from '../../../common/constants/role.enum';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequestWithContext } from '../../../common/types/request-context.type';
import { CreateNotificationDto, ListNotificationsDto } from '../dto';
import { NotificationsService } from '../services/notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.SUPPORT, Role.SUPER_ADMIN)
  async createManualNotifications(
    @CurrentUser() user: RequestWithContext['user'],
    @Req() request: RequestWithContext,
    @Body() dto: CreateNotificationDto
  ): Promise<Record<string, unknown>> {
    return this.notificationsService.createManualNotifications(user!, request.requestId, dto);
  }

  @Get()
  @Roles(Role.CUSTOMER, Role.ADMIN, Role.SUPPORT, Role.WAREHOUSE, Role.SELLER, Role.SUPER_ADMIN)
  async listNotifications(
    @CurrentUser() user: RequestWithContext['user'],
    @Query() query: ListNotificationsDto
  ): Promise<Record<string, unknown>> {
    return this.notificationsService.listNotifications(user!, query);
  }

  @Get(':id')
  @Roles(Role.CUSTOMER, Role.ADMIN, Role.SUPPORT, Role.WAREHOUSE, Role.SELLER, Role.SUPER_ADMIN)
  async getNotificationById(
    @CurrentUser() user: RequestWithContext['user'],
    @Param('id') id: string
  ): Promise<Record<string, unknown>> {
    return this.notificationsService.getNotificationById(user!, id);
  }

  @Patch(':id/read')
  @Roles(Role.CUSTOMER, Role.ADMIN, Role.SUPPORT, Role.WAREHOUSE, Role.SELLER, Role.SUPER_ADMIN)
  async markNotificationAsRead(
    @CurrentUser() user: RequestWithContext['user'],
    @Param('id') id: string
  ): Promise<Record<string, unknown>> {
    return this.notificationsService.markAsRead(user!, id);
  }
}
