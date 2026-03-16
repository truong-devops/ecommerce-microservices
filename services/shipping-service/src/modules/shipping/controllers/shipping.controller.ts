import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Role } from '../../../common/constants/role.enum';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequestWithContext } from '../../../common/types/request-context.type';
import { CreateShipmentDto, CreateTrackingEventDto, ListShipmentsDto, ShippingWebhookDto, UpdateShipmentStatusDto } from '../dto';
import { ShippingService } from '../services/shipping.service';

@Controller('shipments')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Post()
  @Roles(Role.ADMIN, Role.SUPPORT, Role.WAREHOUSE, Role.SELLER, Role.SUPER_ADMIN)
  async createShipment(
    @CurrentUser() user: RequestWithContext['user'],
    @Req() request: RequestWithContext,
    @Body() dto: CreateShipmentDto
  ): Promise<Record<string, unknown>> {
    return this.shippingService.createShipment(user!, request.requestId, dto);
  }

  @Get()
  @Roles(Role.CUSTOMER, Role.ADMIN, Role.SUPPORT, Role.WAREHOUSE, Role.SELLER, Role.SUPER_ADMIN)
  async listShipments(@CurrentUser() user: RequestWithContext['user'], @Query() query: ListShipmentsDto): Promise<Record<string, unknown>> {
    return this.shippingService.listShipments(user!, query);
  }

  @Get('order/:orderId')
  @Roles(Role.CUSTOMER, Role.ADMIN, Role.SUPPORT, Role.WAREHOUSE, Role.SELLER, Role.SUPER_ADMIN)
  async getShipmentByOrderId(
    @CurrentUser() user: RequestWithContext['user'],
    @Param('orderId') orderId: string
  ): Promise<Record<string, unknown>> {
    return this.shippingService.getShipmentByOrderId(user!, orderId);
  }

  @Get(':id')
  @Roles(Role.CUSTOMER, Role.ADMIN, Role.SUPPORT, Role.WAREHOUSE, Role.SELLER, Role.SUPER_ADMIN)
  async getShipmentById(@CurrentUser() user: RequestWithContext['user'], @Param('id') id: string): Promise<Record<string, unknown>> {
    return this.shippingService.getShipmentById(user!, id);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.SUPPORT, Role.WAREHOUSE, Role.SELLER, Role.SUPER_ADMIN)
  async updateShipmentStatus(
    @CurrentUser() user: RequestWithContext['user'],
    @Req() request: RequestWithContext,
    @Param('id') id: string,
    @Body() dto: UpdateShipmentStatusDto
  ): Promise<Record<string, unknown>> {
    return this.shippingService.updateShipmentStatus(user!, request.requestId, id, dto);
  }

  @Post(':id/tracking-events')
  @Roles(Role.ADMIN, Role.SUPPORT, Role.WAREHOUSE, Role.SELLER, Role.SUPER_ADMIN)
  async addTrackingEvent(
    @CurrentUser() user: RequestWithContext['user'],
    @Req() request: RequestWithContext,
    @Param('id') id: string,
    @Body() dto: CreateTrackingEventDto
  ): Promise<Record<string, unknown>> {
    return this.shippingService.addTrackingEvent(user!, request.requestId, id, dto);
  }

  @Get(':id/tracking-events')
  @Roles(Role.CUSTOMER, Role.ADMIN, Role.SUPPORT, Role.WAREHOUSE, Role.SELLER, Role.SUPER_ADMIN)
  async getTrackingEvents(@CurrentUser() user: RequestWithContext['user'], @Param('id') id: string): Promise<Record<string, unknown>> {
    return this.shippingService.getTrackingEvents(user!, id);
  }

  @Public()
  @Post('webhooks/:provider')
  async handleProviderWebhook(
    @Req() request: RequestWithContext,
    @Param('provider') provider: string,
    @Body() dto: ShippingWebhookDto
  ): Promise<Record<string, unknown>> {
    return this.shippingService.handleProviderWebhook(request.requestId, provider, dto);
  }
}
