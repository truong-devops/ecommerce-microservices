import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/constants/role.enum';
import { RequestWithContext } from '../../../common/types/request-context.type';
import { AddCartItemDto } from '../dto/add-cart-item.dto';
import { UpdateCartItemDto } from '../dto/update-cart-item.dto';
import { ValidateCartDto } from '../dto/validate-cart.dto';
import { CartService } from '../services/cart.service';

@Controller(['api/v1/cart', 'api/cart'])
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @Roles(Role.BUYER, Role.CUSTOMER)
  async getCart(@CurrentUser() user: RequestWithContext['user']): Promise<unknown> {
    return this.cartService.getCart(user!);
  }

  @Post('items')
  @Roles(Role.BUYER, Role.CUSTOMER)
  async addItem(
    @CurrentUser() user: RequestWithContext['user'],
    @Req() request: RequestWithContext,
    @Body() dto: AddCartItemDto
  ): Promise<unknown> {
    return this.cartService.addItem(user!, request.requestId ?? 'unknown-request-id', dto);
  }

  @Patch('items/:itemId')
  @Roles(Role.BUYER, Role.CUSTOMER)
  async updateItem(
    @CurrentUser() user: RequestWithContext['user'],
    @Req() request: RequestWithContext,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto
  ): Promise<unknown> {
    return this.cartService.updateItem(user!, request.requestId ?? 'unknown-request-id', itemId, dto);
  }

  @Delete('items/:itemId')
  @Roles(Role.BUYER, Role.CUSTOMER)
  async removeItem(
    @CurrentUser() user: RequestWithContext['user'],
    @Req() request: RequestWithContext,
    @Param('itemId') itemId: string
  ): Promise<unknown> {
    return this.cartService.removeItem(user!, request.requestId ?? 'unknown-request-id', itemId);
  }

  @Delete()
  @Roles(Role.BUYER, Role.CUSTOMER)
  async clearCart(@CurrentUser() user: RequestWithContext['user'], @Req() request: RequestWithContext): Promise<unknown> {
    return this.cartService.clearCart(user!, request.requestId ?? 'unknown-request-id');
  }

  @Post('validate')
  @Roles(Role.BUYER, Role.CUSTOMER)
  async validateCart(@CurrentUser() user: RequestWithContext['user'], @Body() dto: ValidateCartDto): Promise<unknown> {
    return this.cartService.validateCart(user!, dto);
  }
}
