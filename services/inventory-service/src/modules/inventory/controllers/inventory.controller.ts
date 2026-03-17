import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { Role } from '../../../common/constants/role.enum';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequestWithContext } from '../../../common/types/request-context.type';
import { AdjustStockDto, ReservationActionDto, ReserveInventoryDto, ValidateInventoryDto } from '../dto';
import { InventoryService } from '../services/inventory.service';

@Controller(['api/v1/inventory', 'api/inventory'])
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Public()
  @Get('validate')
  async validateStock(@Query() query: ValidateInventoryDto): Promise<Record<string, unknown>> {
    return this.inventoryService.validateStock(query);
  }

  @Get('stocks/:sku')
  @Roles(Role.SELLER, Role.WAREHOUSE, Role.ADMIN, Role.SUPER_ADMIN)
  async getStockBySku(@Param('sku') sku: string): Promise<Record<string, unknown>> {
    return this.inventoryService.getStockBySku(sku);
  }

  @Patch('stocks/:sku/adjust')
  @Roles(Role.SELLER, Role.WAREHOUSE, Role.ADMIN, Role.SUPER_ADMIN)
  async adjustStock(
    @CurrentUser() user: RequestWithContext['user'],
    @Req() request: RequestWithContext,
    @Param('sku') sku: string,
    @Body() dto: AdjustStockDto
  ): Promise<Record<string, unknown>> {
    return this.inventoryService.adjustStock(user!, request.requestId ?? 'unknown-request-id', sku, dto);
  }

  @Post('reservations')
  @Roles(Role.ADMIN, Role.WAREHOUSE, Role.SUPER_ADMIN)
  async reserve(
    @CurrentUser() user: RequestWithContext['user'],
    @Req() request: RequestWithContext,
    @Body() dto: ReserveInventoryDto
  ): Promise<Record<string, unknown>> {
    return this.inventoryService.reserveInventory(user!, request.requestId ?? 'unknown-request-id', dto);
  }

  @Post('reservations/:orderId/release')
  @Roles(Role.ADMIN, Role.WAREHOUSE, Role.SUPER_ADMIN)
  async release(
    @CurrentUser() user: RequestWithContext['user'],
    @Req() request: RequestWithContext,
    @Param('orderId', new ParseUUIDPipe({ version: '4' })) orderId: string,
    @Body() dto: ReservationActionDto
  ): Promise<Record<string, unknown>> {
    return this.inventoryService.releaseReservations(user!, request.requestId ?? 'unknown-request-id', orderId, dto.reason);
  }

  @Post('reservations/:orderId/confirm')
  @Roles(Role.ADMIN, Role.WAREHOUSE, Role.SUPER_ADMIN)
  async confirm(
    @CurrentUser() user: RequestWithContext['user'],
    @Req() request: RequestWithContext,
    @Param('orderId', new ParseUUIDPipe({ version: '4' })) orderId: string,
    @Body() dto: ReservationActionDto
  ): Promise<Record<string, unknown>> {
    return this.inventoryService.confirmReservations(user!, request.requestId ?? 'unknown-request-id', orderId, dto.reason);
  }
}
