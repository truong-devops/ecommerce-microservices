import { ForbiddenException, Injectable } from '@nestjs/common';
import { ErrorCode } from '../../../common/constants/error-code.enum';
import { Role, SELLER_ROLES } from '../../../common/constants/role.enum';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import { UpdateShopDecorDto } from '../dto/update-shop-decor.dto';
import { ShopDecorDocument } from '../entities/shop-decor.schema';
import { ShopDecorRepository, UpsertShopDecorPayload } from '../repositories/shop-decor.repository';

interface ShopDecorResponse {
  sellerId: string;
  shopName: string;
  slogan: string;
  logoUrl: string;
  bannerUrl: string;
  accentColor: string;
  navItems: string[];
  introTitle: string;
  introDescription: string;
  featuredCategories: string[];
  updatedAt: string;
}

@Injectable()
export class ShopDecorService {
  constructor(private readonly shopDecorRepository: ShopDecorRepository) {}

  async getPublicShopDecor(sellerId: string): Promise<ShopDecorResponse> {
    const found = await this.shopDecorRepository.findBySellerId(sellerId);
    if (!found) {
      return this.buildDefaultDecor(sellerId);
    }

    return this.toResponse(found);
  }

  async getMyShopDecor(user: AuthenticatedUserContext): Promise<ShopDecorResponse> {
    return this.getPublicShopDecor(user.userId);
  }

  async updateMyShopDecor(user: AuthenticatedUserContext, dto: UpdateShopDecorDto): Promise<ShopDecorResponse> {
    const payload = normalizeUpdatePayload(dto);
    const shopName = payload.shopName;

    if (!shopName) {
      const existing = await this.shopDecorRepository.findBySellerId(user.userId);
      if (!existing) {
        payload.shopName = this.buildDefaultDecor(user.userId).shopName;
      }
    }

    if (!SELLER_ROLES.includes(user.role) && !isStaff(user.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Role is not allowed to update shop decor'
      });
    }

    const updated = await this.shopDecorRepository.upsertBySellerId(user.userId, payload);
    return this.toResponse(updated);
  }

  private toResponse(source: ShopDecorDocument): ShopDecorResponse {
    const updatedAt = source.updatedAt instanceof Date ? source.updatedAt.toISOString() : new Date().toISOString();

    return {
      sellerId: source.sellerId,
      shopName: source.shopName,
      slogan: source.slogan ?? '',
      logoUrl: source.logoUrl ?? '',
      bannerUrl: source.bannerUrl ?? '',
      accentColor: normalizeAccentColor(source.accentColor),
      navItems: sanitizeList(source.navItems, 8),
      introTitle: source.introTitle ?? '',
      introDescription: source.introDescription ?? '',
      featuredCategories: sanitizeList(source.featuredCategories, 10),
      updatedAt
    };
  }

  private buildDefaultDecor(sellerId: string): ShopDecorResponse {
    const short = sellerId.slice(0, 8).toUpperCase();
    return {
      sellerId,
      shopName: `Shop ${short}`,
      slogan: 'Official store with trusted products and fast support.',
      logoUrl: '',
      bannerUrl: '',
      accentColor: '#ee4d2d',
      navItems: ['Tất Cả Sản Phẩm', 'Sản phẩm mới', 'Ưu đãi hôm nay', 'Thông tin shop'],
      introTitle: 'Chào mừng bạn đến với shop của chúng tôi',
      introDescription: 'Theo dõi shop để nhận thêm voucher và cập nhật sản phẩm mới mỗi ngày.',
      featuredCategories: ['Best Seller', 'Sản phẩm nổi bật', 'Phụ kiện'],
      updatedAt: new Date().toISOString()
    };
  }
}

function normalizeUpdatePayload(dto: UpdateShopDecorDto): UpsertShopDecorPayload {
  const payload: UpsertShopDecorPayload = {};

  if (typeof dto.shopName === 'string') {
    payload.shopName = dto.shopName.trim().slice(0, 120);
  }
  if (typeof dto.slogan === 'string') {
    payload.slogan = dto.slogan.trim().slice(0, 240);
  }
  if (typeof dto.logoUrl === 'string') {
    payload.logoUrl = dto.logoUrl.trim().slice(0, 500);
  }
  if (typeof dto.bannerUrl === 'string') {
    payload.bannerUrl = dto.bannerUrl.trim().slice(0, 500);
  }
  if (typeof dto.accentColor === 'string') {
    payload.accentColor = normalizeAccentColor(dto.accentColor);
  }
  if (Array.isArray(dto.navItems)) {
    payload.navItems = sanitizeList(dto.navItems, 8);
  }
  if (typeof dto.introTitle === 'string') {
    payload.introTitle = dto.introTitle.trim().slice(0, 180);
  }
  if (typeof dto.introDescription === 'string') {
    payload.introDescription = dto.introDescription.trim().slice(0, 500);
  }
  if (Array.isArray(dto.featuredCategories)) {
    payload.featuredCategories = sanitizeList(dto.featuredCategories, 10);
  }

  return payload;
}

function sanitizeList(values: unknown[], limit: number): string[] {
  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeAccentColor(value: string): string {
  const normalized = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized;
  }
  return '#ee4d2d';
}

function isStaff(role: Role): boolean {
  return role === Role.ADMIN || role === Role.MODERATOR || role === Role.SUPPORT || role === Role.SUPER_ADMIN;
}
