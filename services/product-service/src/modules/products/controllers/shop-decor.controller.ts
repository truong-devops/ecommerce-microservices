import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { Role } from '../../../common/constants/role.enum';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import { UpdateShopDecorDto } from '../dto/update-shop-decor.dto';
import { ShopDecorService } from '../services/shop-decor.service';

@Controller('shops')
export class ShopDecorController {
  constructor(private readonly shopDecorService: ShopDecorService) {}

  @Get('me/decor')
  @Roles(Role.SELLER, Role.ADMIN, Role.MODERATOR, Role.SUPPORT, Role.SUPER_ADMIN)
  async getMyShopDecor(@CurrentUser() user: AuthenticatedUserContext): Promise<unknown> {
    return this.shopDecorService.getMyShopDecor(user);
  }

  @Patch('me/decor')
  @Roles(Role.SELLER, Role.ADMIN, Role.MODERATOR, Role.SUPPORT, Role.SUPER_ADMIN)
  async updateMyShopDecor(
    @CurrentUser() user: AuthenticatedUserContext,
    @Body() dto: UpdateShopDecorDto
  ): Promise<unknown> {
    return this.shopDecorService.updateMyShopDecor(user, dto);
  }

  @Public()
  @Get(':sellerId/decor')
  async getPublicShopDecor(@Param('sellerId') sellerId: string): Promise<unknown> {
    return this.shopDecorService.getPublicShopDecor(sellerId.trim());
  }
}
