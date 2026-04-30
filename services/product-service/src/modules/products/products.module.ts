import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductsController } from './controllers/products.controller';
import { ShopDecorController } from './controllers/shop-decor.controller';
import { Product, ProductSchema } from './entities/product.schema';
import { ShopDecor, ShopDecorSchema } from './entities/shop-decor.schema';
import { ProductsRepository } from './repositories/products.repository';
import { ShopDecorRepository } from './repositories/shop-decor.repository';
import { ProductEventsPublisherService } from './services/product-events-publisher.service';
import { ProductSearchService } from './services/product-search.service';
import { ProductsService } from './services/products.service';
import { ShopDecorService } from './services/shop-decor.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Product.name,
        schema: ProductSchema
      },
      {
        name: ShopDecor.name,
        schema: ShopDecorSchema
      }
    ])
  ],
  controllers: [ProductsController, ShopDecorController],
  providers: [
    ProductsService,
    ProductsRepository,
    ProductSearchService,
    ProductEventsPublisherService,
    ShopDecorService,
    ShopDecorRepository
  ],
  exports: [ProductsService, ShopDecorService]
})
export class ProductsModule {}
