import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductsController } from './controllers/products.controller';
import { Product, ProductSchema } from './entities/product.schema';
import { ProductsRepository } from './repositories/products.repository';
import { ProductEventsPublisherService } from './services/product-events-publisher.service';
import { ProductSearchService } from './services/product-search.service';
import { ProductsService } from './services/products.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Product.name,
        schema: ProductSchema
      }
    ])
  ],
  controllers: [ProductsController],
  providers: [ProductsService, ProductsRepository, ProductSearchService, ProductEventsPublisherService],
  exports: [ProductsService]
})
export class ProductsModule {}
