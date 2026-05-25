import type {
  BuyerShopDetail,
  HomeSectionsData,
  Pagination,
  ProductDetail,
  ProductSearchItem,
  ProductSearchOutput,
  ProductVariant
} from '@frontend/buyer-contracts';
import { buildProductSearchQuery } from '@frontend/buyer-contracts';

import { requestBuyerApi, requestBuyerApiEnvelope } from './client';

interface BackendProduct {
  id: string;
  sellerId: string;
  sellerCode?: string;
  name: string;
  slug: string;
  description?: string | null;
  categoryId: string;
  brand?: string | null;
  status: string;
  attributes?: Record<string, unknown>;
  images: string[];
  minPrice: number;
  variants: ProductVariant[];
}

type ProductQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  brand?: string;
  sellerId?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'minPrice';
  sortOrder?: 'ASC' | 'DESC';
};

const fallbackImage = 'https://picsum.photos/seed/product-mobile-fallback/800/800';
const soldLabels = ['Hot sale', 'Bán chạy', 'Xu hướng', 'Được yêu thích', 'Sắp hết', 'Đề xuất'];
const categoryLabels: Record<string, string> = {
  'bach-hoa-online': 'Bách Hóa Online',
  'dien-thoai-phu-kien': 'Điện Thoại Phụ Kiện',
  'do-gia-dung': 'Đồ Gia Dụng',
  'nha-cua-doi-song': 'Nhà Cửa & Đời Sống',
  'sac-dep': 'Sắc Đẹp',
  'thoi-trang-nam': 'Thời Trang Nam',
  'thoi-trang-nu': 'Thời Trang Nữ',
};

export async function fetchHomeSections(): Promise<HomeSectionsData> {
  const products = await requestBuyerApi<BackendProduct[]>('/products?page=1&pageSize=100&sortBy=createdAt&sortOrder=DESC');
  return buildHomeSections(products);
}

export async function searchProducts(input: ProductQuery): Promise<ProductSearchOutput> {
  const query = buildProductSearchQuery(input);
  const result = await requestBuyerApiEnvelope<BackendProduct[]>(`/products${query ? `?${query}` : ''}`);
  return {
    items: result.data.map(toProductSearchItem),
    pagination: result.meta?.pagination ?? fallbackPagination(input, result.data.length)
  };
}

export async function fetchProductDetail(productId: string): Promise<ProductDetail> {
  const product = await requestBuyerApi<BackendProduct>(`/products/${encodeURIComponent(productId)}`);
  const item = toProductSearchItem(product);
  return {
    ...item,
    description: product.description?.trim() || 'Thông tin sản phẩm đang được cập nhật.',
    sellerId: product.sellerId,
    sellerCode: product.sellerCode,
    images: product.images.length > 0 ? product.images : [item.image],
    variants: product.variants,
    status: product.status,
    defaultSku: product.variants.find((variant) => variant.isDefault)?.sku ?? product.variants[0]?.sku ?? null,
    stock: extractStock(product.attributes)
  };
}

export function fetchShopDetail(sellerId: string): Promise<BuyerShopDetail> {
  return requestBuyerApi<BuyerShopDetail>(`/shops/${encodeURIComponent(sellerId)}/decor`);
}

export function toProductSearchItem(product: BackendProduct): ProductSearchItem {
  const variant = product.variants.find((item) => item.isDefault) ?? product.variants[0];
  const price = variant?.price ?? product.minPrice;
  const compareAtPrice = variant?.compareAtPrice && variant.compareAtPrice > price ? variant.compareAtPrice : null;
  return {
    id: product.id,
    title: product.name.trim() || product.id,
    slug: product.slug?.trim() || '',
    categoryId: product.categoryId?.trim() || 'khac',
    brand: product.brand?.trim() || null,
    image: product.images[0]?.trim() || fallbackImage,
    price,
    currency: variant?.currency?.trim().toUpperCase() || 'VND',
    compareAtPrice,
    discountPercent: compareAtPrice ? Math.round(((compareAtPrice - price) / compareAtPrice) * 100) : 0
  };
}

export function buildHomeSections(products: BackendProduct[]): HomeSectionsData {
  const items = products.map(toProductSearchItem);
  const categories = Array.from(new Map(items.map((item) => [item.categoryId, item])).values())
    .slice(0, 10)
    .map((item) => ({
      id: item.categoryId,
      label: categoryLabel(item.categoryId),
      icon: item.image
    }));

  return {
    keywords: Array.from(new Set(items.map((item) => item.title.toLowerCase().split(/\s+/).slice(0, 2).join(' ')))).slice(0, 6),
    categories,
    flashSaleItems: items.slice(0, 6).map((item, index) => ({
      id: item.id,
      name: item.title,
      price: item.price,
      discountPercent: item.discountPercent,
      soldLabel: soldLabels[index % soldLabels.length],
      image: item.image
    })),
    mallDeals: [],
    topSearchItems: items.slice(0, 6).map((item, index) => ({
      id: item.id,
      name: item.title,
      soldPerMonth: `${(index + 3) * 9}k / tháng`,
      image: item.image
    })),
    recommendationProducts: items.map((item, index) => ({
      id: item.id,
      title: item.title,
      categoryId: item.categoryId,
      price: item.price,
      sold: `${(index + 2) * 2}k+`,
      discountPercent: item.discountPercent,
      image: item.image
    }))
  };
}

function fallbackPagination(input: ProductQuery, itemCount: number): Pagination {
  return {
    page: input.page ?? 1,
    pageSize: input.pageSize ?? itemCount,
    totalItems: itemCount,
    totalPages: itemCount > 0 ? 1 : 0
  };
}

function extractStock(attributes?: Record<string, unknown>): number | null {
  for (const key of ['availableStock', 'availableQuantity', 'stock', 'inventory', 'quantity']) {
    const value = attributes?.[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.floor(value);
    }
  }
  return null;
}

function categoryLabel(categoryId: string): string {
  const knownLabel = categoryLabels[categoryId];
  if (knownLabel) return knownLabel;

  return categoryId
    .split('-')
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}
