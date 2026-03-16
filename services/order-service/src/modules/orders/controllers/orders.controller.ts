import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/constants/role.enum';
import { RequestWithContext } from '../../../common/types/request-context.type';
import { CancelOrderDto, CreateOrderDto, ListOrdersDto, UpdateOrderStatusDto } from '../dto';
import { OrdersService } from '../services/orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles(Role.CUSTOMER)
  async createOrder(
    @CurrentUser() user: RequestWithContext['user'],
    @Req() request: RequestWithContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateOrderDto
  ): Promise<Record<string, unknown>> {
    return this.ordersService.createOrder(user!, request.requestId, idempotencyKey, dto);
  }

  @Get()
  @Roles(Role.CUSTOMER, Role.ADMIN, Role.SUPPORT, Role.WAREHOUSE, Role.SELLER, Role.SUPER_ADMIN)
  async listOrders(@CurrentUser() user: RequestWithContext['user'], @Query() query: ListOrdersDto): Promise<Record<string, unknown>> {
    return this.ordersService.listOrders(user!, query);
  }

  @Get(':id')
  @Roles(Role.CUSTOMER, Role.ADMIN, Role.SUPPORT, Role.WAREHOUSE, Role.SELLER, Role.SUPER_ADMIN)
  async getOrderById(@CurrentUser() user: RequestWithContext['user'], @Param('id') id: string): Promise<Record<string, unknown>> {
    return this.ordersService.getOrderById(user!, id);
  }

  @Patch(':id/cancel')
  @Roles(Role.CUSTOMER, Role.ADMIN, Role.SUPPORT, Role.WAREHOUSE, Role.SELLER, Role.SUPER_ADMIN)
  async cancelOrder(
    @CurrentUser() user: RequestWithContext['user'],
    @Req() request: RequestWithContext,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto
  ): Promise<Record<string, unknown>> {
    return this.ordersService.cancelOrder(user!, request.requestId, id, dto);
  }

  @Patch(':id/confirm-received')
  @Roles(Role.CUSTOMER)
  async confirmReceived(
    @CurrentUser() user: RequestWithContext['user'],
    @Req() request: RequestWithContext,
    @Param('id') id: string
  ): Promise<Record<string, unknown>> {
    return this.ordersService.confirmReceived(user!, request.requestId, id);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.SUPPORT, Role.WAREHOUSE, Role.SELLER, Role.SUPER_ADMIN)
  async updateOrderStatus(
    @CurrentUser() user: RequestWithContext['user'],
    @Req() request: RequestWithContext,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto
  ): Promise<Record<string, unknown>> {
    return this.ordersService.updateOrderStatus(user!, request.requestId, id, dto);
  }

  @Get(':id/history')
  @Roles(Role.CUSTOMER, Role.ADMIN, Role.SUPPORT, Role.WAREHOUSE, Role.SELLER, Role.SUPER_ADMIN)
  async getOrderStatusHistory(@CurrentUser() user: RequestWithContext['user'], @Param('id') id: string): Promise<Record<string, unknown>> {
    return this.ordersService.getOrderStatusHistory(user!, id);
  }
}
