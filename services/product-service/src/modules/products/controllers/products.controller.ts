import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Role } from '../../../common/constants/role.enum';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequestWithContext } from '../../../common/types/request-context.type';
import { CreateProductDto } from '../dto/create-product.dto';
import { ListProductsDto } from '../dto/list-products.dto';
import { UpdateProductStatusDto } from '../dto/update-product-status.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { ProductsService } from '../services/products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles(Role.SELLER, Role.ADMIN, Role.SUPER_ADMIN)
  async createProduct(
    @CurrentUser() user: RequestWithContext['user'],
    @Req() request: RequestWithContext,
    @Body() dto: CreateProductDto
  ): Promise<unknown> {
    return this.productsService.createProduct(user!, request.requestId, dto);
  }

  @Public()
  @Get()
  async listPublicProducts(@Query() query: ListProductsDto): Promise<unknown> {
    return this.productsService.listPublicProducts(query);
  }

  @Get('my')
  @Roles(Role.SELLER, Role.ADMIN, Role.MODERATOR, Role.SUPER_ADMIN)
  async listManagedProducts(
    @CurrentUser() user: RequestWithContext['user'],
    @Query() query: ListProductsDto
  ): Promise<unknown> {
    return this.productsService.listManagedProducts(user!, query);
  }

  @Public()
  @Get(':id')
  async getPublicProductById(@Param('id') id: string): Promise<unknown> {
    return this.productsService.getPublicProductById(id);
  }

  @Patch(':id')
  @Roles(Role.SELLER, Role.ADMIN, Role.SUPER_ADMIN)
  async updateProduct(
    @CurrentUser() user: RequestWithContext['user'],
    @Req() request: RequestWithContext,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto
  ): Promise<unknown> {
    return this.productsService.updateProduct(user!, request.requestId, id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.SUPER_ADMIN)
  async updateProductStatus(
    @CurrentUser() user: RequestWithContext['user'],
    @Req() request: RequestWithContext,
    @Param('id') id: string,
    @Body() dto: UpdateProductStatusDto
  ): Promise<unknown> {
    return this.productsService.updateProductStatus(user!, request.requestId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.SELLER, Role.ADMIN, Role.SUPER_ADMIN)
  async deleteProduct(
    @CurrentUser() user: RequestWithContext['user'],
    @Req() request: RequestWithContext,
    @Param('id') id: string
  ): Promise<unknown> {
    return this.productsService.deleteProduct(user!, request.requestId, id);
  }
}
