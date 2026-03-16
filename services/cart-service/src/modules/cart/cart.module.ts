import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CartController } from './controllers/cart.controller';
import { CartItemRecordEntity } from './entities/cart-item-record.entity';
import { CartRecordEntity } from './entities/cart-record.entity';
import { RedisCartCacheRepository } from './repositories/cart-cache.repository';
import { TypeOrmCartPersistenceRepository } from './repositories/cart-persistence.repository';
import { CART_CACHE_REPOSITORY, CART_PERSISTENCE_REPOSITORY } from './repositories/cart-repository.tokens';
import { CartEventsPublisherService } from './services/cart-events-publisher.service';
import { CartService } from './services/cart.service';
import { CartValidationClientService } from './services/cart-validation-client.service';

@Module({})
export class CartModule {
  static register(persistenceEnabled: boolean): DynamicModule {
    return {
      module: CartModule,
      imports: [
        ...(persistenceEnabled
          ? [
              TypeOrmModule.forFeature([CartRecordEntity, CartItemRecordEntity])
            ]
          : [])
      ],
      controllers: [CartController],
      providers: [
        CartService,
        CartValidationClientService,
        CartEventsPublisherService,
        {
          provide: CART_CACHE_REPOSITORY,
          useClass: RedisCartCacheRepository
        },
        {
          provide: CART_PERSISTENCE_REPOSITORY,
          useClass: TypeOrmCartPersistenceRepository
        }
      ],
      exports: [CartService]
    };
  }
}
