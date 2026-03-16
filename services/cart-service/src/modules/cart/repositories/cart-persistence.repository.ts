import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CartItemRecordEntity } from '../entities/cart-item-record.entity';
import { CartRecordEntity } from '../entities/cart-record.entity';
import { CartItem, CartSnapshot } from '../entities/cart.types';

export interface CartPersistenceRepository {
  isEnabled(): boolean;
  loadByUserId(userId: string): Promise<CartSnapshot | null>;
  save(cart: CartSnapshot): Promise<void>;
  deleteByUserId(userId: string): Promise<void>;
}

@Injectable()
export class TypeOrmCartPersistenceRepository implements CartPersistenceRepository {
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly dataSource?: DataSource,
    @Optional()
    @InjectRepository(CartRecordEntity)
    private readonly cartRepository?: Repository<CartRecordEntity>,
    @Optional()
    @InjectRepository(CartItemRecordEntity)
    private readonly itemRepository?: Repository<CartItemRecordEntity>
  ) {
    this.enabled = this.configService.get<boolean>('cart.persistenceEnabled', false);
  }

  isEnabled(): boolean {
    return Boolean(this.enabled && this.dataSource && this.cartRepository && this.itemRepository);
  }

  async loadByUserId(userId: string): Promise<CartSnapshot | null> {
    if (!this.isEnabled() || !this.cartRepository) {
      return null;
    }

    const cartRecord = await this.cartRepository
      .createQueryBuilder('cart')
      .leftJoinAndSelect('cart.items', 'item')
      .where('cart.userId = :userId', { userId })
      .orderBy('item.createdAt', 'ASC')
      .getOne();

    if (!cartRecord) {
      return null;
    }

    return this.mapToSnapshot(cartRecord);
  }

  async save(cart: CartSnapshot): Promise<void> {
    if (!this.isEnabled() || !this.dataSource) {
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      let cartRecord = await manager.findOne(CartRecordEntity, {
        where: { userId: cart.userId }
      });

      if (!cartRecord) {
        cartRecord = manager.create(CartRecordEntity, {
          id: cart.id,
          userId: cart.userId,
          currency: cart.currency,
          subtotal: cart.subtotal,
          discountTotal: cart.discountTotal,
          grandTotal: cart.grandTotal,
          expiresAt: new Date(cart.expiresAt),
          version: cart.version
        });
      } else {
        cartRecord.currency = cart.currency;
        cartRecord.subtotal = cart.subtotal;
        cartRecord.discountTotal = cart.discountTotal;
        cartRecord.grandTotal = cart.grandTotal;
        cartRecord.expiresAt = new Date(cart.expiresAt);
        cartRecord.version = cart.version;
      }

      const savedCart = await manager.save(CartRecordEntity, cartRecord);

      await manager.delete(CartItemRecordEntity, { cartId: savedCart.id });

      if (cart.items.length > 0) {
        const itemRecords = cart.items.map((item) =>
          manager.create(CartItemRecordEntity, {
            id: item.id,
            cartId: savedCart.id,
            productId: item.productId,
            variantId: item.variantId,
            sku: item.sku,
            name: item.name,
            image: item.image,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            lineTotal: item.lineTotal,
            sellerId: item.sellerId,
            metadata: item.metadata
          })
        );

        await manager.save(CartItemRecordEntity, itemRecords);
      }
    });
  }

  async deleteByUserId(userId: string): Promise<void> {
    if (!this.isEnabled() || !this.cartRepository) {
      return;
    }

    await this.cartRepository.delete({ userId });
  }

  private mapToSnapshot(cartRecord: CartRecordEntity): CartSnapshot {
    return {
      id: cartRecord.id,
      userId: cartRecord.userId,
      currency: cartRecord.currency,
      items: (cartRecord.items ?? []).map((item): CartItem => ({
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        sku: item.sku,
        name: item.name,
        image: item.image,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
        sellerId: item.sellerId,
        metadata: item.metadata ?? {}
      })),
      subtotal: cartRecord.subtotal,
      discountTotal: cartRecord.discountTotal,
      grandTotal: cartRecord.grandTotal,
      expiresAt: cartRecord.expiresAt.toISOString(),
      version: cartRecord.version,
      createdAt: cartRecord.createdAt.toISOString(),
      updatedAt: cartRecord.updatedAt.toISOString()
    };
  }
}
