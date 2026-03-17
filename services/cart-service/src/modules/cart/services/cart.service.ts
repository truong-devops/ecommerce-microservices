import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { BUYER_ROLES } from '../../../common/constants/role.enum';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import { AppException } from '../../../common/utils/app-exception.util';
import { AddCartItemDto } from '../dto/add-cart-item.dto';
import { UpdateCartItemDto } from '../dto/update-cart-item.dto';
import { ValidateCartDto } from '../dto/validate-cart.dto';
import { CartItem, CartSnapshot, CartValidationIssue } from '../entities/cart.types';
import { CartCacheRepository } from '../repositories/cart-cache.repository';
import { CartPersistenceRepository } from '../repositories/cart-persistence.repository';
import { CART_CACHE_REPOSITORY, CART_PERSISTENCE_REPOSITORY } from '../repositories/cart-repository.tokens';
import { CartEventsPublisherService } from './cart-events-publisher.service';
import { CartValidationClientService } from './cart-validation-client.service';

@Injectable()
export class CartService {
  private readonly ttlSeconds: number;
  private readonly maxQtyPerItem: number;
  private readonly defaultCurrency: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(CART_CACHE_REPOSITORY)
    private readonly cacheRepository: CartCacheRepository,
    @Inject(CART_PERSISTENCE_REPOSITORY)
    private readonly persistenceRepository: CartPersistenceRepository,
    private readonly validationClient: CartValidationClientService,
    private readonly eventsPublisher: CartEventsPublisherService
  ) {
    this.ttlSeconds = this.configService.get<number>('cart.ttlSeconds', 259200);
    this.maxQtyPerItem = this.configService.get<number>('cart.maxQtyPerItem', 99);
    this.defaultCurrency = this.configService.get<string>('cart.defaultCurrency', 'USD');
  }

  async getCart(user: AuthenticatedUserContext): Promise<CartSnapshot> {
    this.assertBuyer(user);
    return this.loadOrCreateCart(user.userId);
  }

  async addItem(user: AuthenticatedUserContext, requestId: string, dto: AddCartItemDto): Promise<CartSnapshot> {
    this.assertBuyer(user);

    const cart = await this.loadOrCreateCart(user.userId);
    this.assertExpectedVersion(dto.expectedVersion, cart.version);
    this.assertQuantity(dto.quantity);

    const normalizedCurrency = (dto.currency ?? cart.currency ?? this.defaultCurrency).toUpperCase();
    if (cart.items.length === 0) {
      cart.currency = normalizedCurrency;
    }

    const mergeKey = this.buildMergeKey(dto.productId, dto.variantId ?? null, dto.sellerId);
    const existingItem = cart.items.find((item) => this.buildMergeKey(item.productId, item.variantId, item.sellerId) === mergeKey);

    let affectedItem: CartItem;
    if (existingItem) {
      const nextQuantity = existingItem.quantity + dto.quantity;
      this.assertQuantity(nextQuantity);
      existingItem.quantity = nextQuantity;
      existingItem.unitPrice = roundMoney(dto.unitPrice);
      existingItem.name = dto.name.trim();
      existingItem.sku = dto.sku.trim();
      existingItem.image = dto.image ?? existingItem.image;
      existingItem.metadata = dto.metadata ?? existingItem.metadata;
      existingItem.lineTotal = roundMoney(existingItem.unitPrice * existingItem.quantity);
      affectedItem = existingItem;
    } else {
      affectedItem = {
        id: randomUUID(),
        productId: dto.productId,
        variantId: dto.variantId ?? null,
        sku: dto.sku.trim(),
        name: dto.name.trim(),
        image: dto.image ?? null,
        unitPrice: roundMoney(dto.unitPrice),
        quantity: dto.quantity,
        lineTotal: roundMoney(dto.unitPrice * dto.quantity),
        sellerId: dto.sellerId,
        metadata: dto.metadata ?? {}
      };
      cart.items.push(affectedItem);
    }

    const issues = await this.validationClient.validateItem(affectedItem, true);
    if (issues.length > 0) {
      throw new UnprocessableEntityException({
        code: ErrorCode.VALIDATION_FAILED,
        message: issues.map((issue) => issue.message).join(', '),
        details: issues
      });
    }

    this.recalculateCart(cart, true);
    await this.persistCart(cart);
    await this.eventsPublisher.publishCartItemAdded(cart, affectedItem, user, requestId);

    return cart;
  }

  async updateItem(
    user: AuthenticatedUserContext,
    requestId: string,
    itemId: string,
    dto: UpdateCartItemDto
  ): Promise<CartSnapshot> {
    this.assertBuyer(user);

    const cart = await this.loadCart(user.userId, false);
    if (!cart) {
      throw new NotFoundException({
        code: ErrorCode.CART_NOT_FOUND,
        message: 'Cart not found'
      });
    }

    this.assertExpectedVersion(dto.expectedVersion, cart.version);

    const item = cart.items.find((current) => current.id === itemId);
    if (!item) {
      throw new NotFoundException({
        code: ErrorCode.CART_ITEM_NOT_FOUND,
        message: 'Cart item not found'
      });
    }

    if (dto.quantity === 0) {
      cart.items = cart.items.filter((current) => current.id !== itemId);
      this.recalculateCart(cart, true);
      await this.persistCart(cart);
      await this.eventsPublisher.publishCartItemRemoved(cart, item, user, requestId);
      return cart;
    }

    this.assertQuantity(dto.quantity);
    item.quantity = dto.quantity;
    item.lineTotal = roundMoney(item.unitPrice * item.quantity);

    const issues = await this.validationClient.validateItem(item, true);
    if (issues.length > 0) {
      throw new UnprocessableEntityException({
        code: ErrorCode.VALIDATION_FAILED,
        message: issues.map((issue) => issue.message).join(', '),
        details: issues
      });
    }

    this.recalculateCart(cart, true);
    await this.persistCart(cart);
    await this.eventsPublisher.publishCartItemUpdated(cart, item, user, requestId);

    return cart;
  }

  async removeItem(user: AuthenticatedUserContext, requestId: string, itemId: string): Promise<CartSnapshot> {
    this.assertBuyer(user);

    const cart = await this.loadCart(user.userId, false);
    if (!cart) {
      throw new NotFoundException({
        code: ErrorCode.CART_NOT_FOUND,
        message: 'Cart not found'
      });
    }

    const item = cart.items.find((current) => current.id === itemId);
    if (!item) {
      throw new NotFoundException({
        code: ErrorCode.CART_ITEM_NOT_FOUND,
        message: 'Cart item not found'
      });
    }

    cart.items = cart.items.filter((current) => current.id !== itemId);
    this.recalculateCart(cart, true);
    await this.persistCart(cart);
    await this.eventsPublisher.publishCartItemRemoved(cart, item, user, requestId);

    return cart;
  }

  async clearCart(user: AuthenticatedUserContext, requestId: string): Promise<CartSnapshot> {
    this.assertBuyer(user);

    const existing = await this.loadCart(user.userId, false);
    await this.cacheRepository.deleteByUserId(user.userId);
    await this.persistenceRepository.deleteByUserId(user.userId);

    if (existing) {
      await this.eventsPublisher.publishCartCleared(existing.id, user.userId, user, requestId);
    }

    return this.createEmptyCart(user.userId);
  }

  async validateCart(
    user: AuthenticatedUserContext,
    dto: ValidateCartDto
  ): Promise<{ cart: CartSnapshot; valid: boolean; issues: CartValidationIssue[] }> {
    this.assertBuyer(user);

    const cart = await this.loadOrCreateCart(user.userId);
    const issues: CartValidationIssue[] = [];

    for (const item of cart.items) {
      if (item.quantity <= 0) {
        issues.push({
          code: ErrorCode.CART_QUANTITY_INVALID,
          message: 'Item quantity must be greater than 0',
          itemId: item.id,
          sku: item.sku
        });
      }

      if (item.quantity > this.maxQtyPerItem) {
        issues.push({
          code: ErrorCode.CART_QUANTITY_EXCEEDED,
          message: `Item quantity exceeds max ${this.maxQtyPerItem}`,
          itemId: item.id,
          sku: item.sku
        });
      }

      const externalIssues = await this.validationClient.validateItem(item, dto.includeExternalChecks ?? true);
      issues.push(...externalIssues);
    }

    return {
      cart,
      valid: issues.length === 0,
      issues
    };
  }

  private async loadOrCreateCart(userId: string): Promise<CartSnapshot> {
    const cart = await this.loadCart(userId, true);
    if (!cart) {
      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, {
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'Unable to initialize cart'
      });
    }

    return cart;
  }

  private async loadCart(userId: string, createIfMissing: boolean): Promise<CartSnapshot | null> {
    const cached = await this.cacheRepository.getByUserId(userId);
    if (cached) {
      return cached;
    }

    const persisted = await this.persistenceRepository.loadByUserId(userId);
    if (persisted) {
      await this.cacheRepository.save(persisted, this.ttlSeconds);
      return persisted;
    }

    if (!createIfMissing) {
      return null;
    }

    return this.createEmptyCart(userId);
  }

  private async persistCart(cart: CartSnapshot): Promise<void> {
    await this.cacheRepository.save(cart, this.ttlSeconds);
    await this.persistenceRepository.save(cart);
  }

  private assertBuyer(user: AuthenticatedUserContext): void {
    if (!BUYER_ROLES.includes(user.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only buyer can manage cart'
      });
    }
  }

  private assertExpectedVersion(expectedVersion: number | undefined, actualVersion: number): void {
    if (expectedVersion === undefined) {
      return;
    }

    if (expectedVersion !== actualVersion) {
      throw new ConflictException({
        code: ErrorCode.CART_VERSION_CONFLICT,
        message: 'Cart version conflict'
      });
    }
  }

  private assertQuantity(quantity: number): void {
    if (quantity <= 0) {
      throw new UnprocessableEntityException({
        code: ErrorCode.CART_QUANTITY_INVALID,
        message: 'Quantity must be greater than 0'
      });
    }

    if (quantity > this.maxQtyPerItem) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, {
        code: ErrorCode.CART_QUANTITY_EXCEEDED,
        message: `Quantity cannot exceed ${this.maxQtyPerItem}`
      });
    }
  }

  private recalculateCart(cart: CartSnapshot, incrementVersion: boolean): void {
    let subtotal = 0;
    for (const item of cart.items) {
      item.lineTotal = roundMoney(item.unitPrice * item.quantity);
      subtotal += item.lineTotal;
    }

    cart.subtotal = roundMoney(subtotal);
    cart.discountTotal = roundMoney(cart.discountTotal ?? 0);
    cart.grandTotal = roundMoney(cart.subtotal - cart.discountTotal);

    if (incrementVersion) {
      cart.version += 1;
    }

    cart.updatedAt = new Date().toISOString();
    cart.expiresAt = new Date(Date.now() + this.ttlSeconds * 1000).toISOString();
  }

  private buildMergeKey(productId: string, variantId: string | null, sellerId: string): string {
    return `${productId}::${variantId ?? ''}::${sellerId}`;
  }

  private createEmptyCart(userId: string): CartSnapshot {
    const now = new Date().toISOString();

    return {
      id: randomUUID(),
      userId,
      currency: this.defaultCurrency,
      items: [],
      subtotal: 0,
      discountTotal: 0,
      grandTotal: 0,
      expiresAt: new Date(Date.now() + this.ttlSeconds * 1000).toISOString(),
      version: 1,
      createdAt: now,
      updatedAt: now
    };
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
