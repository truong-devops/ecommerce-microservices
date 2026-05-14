import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductsController } from './controllers/products.controller';
import { ProductVideosController } from './controllers/product-videos.controller';
import { ShopDecorController } from './controllers/shop-decor.controller';
import { ProductVideo, ProductVideoSchema } from './entities/product-video.schema';
import { Product, ProductSchema } from './entities/product.schema';
import { ShopDecor, ShopDecorSchema } from './entities/shop-decor.schema';
import { ProductVideosRepository } from './repositories/product-videos.repository';
import { ProductsRepository } from './repositories/products.repository';
import { ShopDecorRepository } from './repositories/shop-decor.repository';
import { ProductEventsPublisherService } from './services/product-events-publisher.service';
import { ProductSearchService } from './services/product-search.service';
import { ProductVideosService } from './services/product-videos.service';
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
        name: ProductVideo.name,
        schema: ProductVideoSchema
      },
      {
        name: ShopDecor.name,
        schema: ShopDecorSchema
      }
    ])
  ],
  controllers: [ProductsController, ProductVideosController, ShopDecorController],
  providers: [
    ProductsService,
    ProductsRepository,
    ProductVideosService,
    ProductVideosRepository,
    ProductSearchService,
    ProductEventsPublisherService,
    ShopDecorService,
    ShopDecorRepository
  ],
  exports: [ProductsService, ProductVideosService, ShopDecorService]
})
export class ProductsModule {}
