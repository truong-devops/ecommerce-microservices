import type { HomeSectionsData } from '@/lib/api/types';
import { ok } from '@/lib/server/buyer-api-response';
import { toErrorResponse } from '@/lib/server/route-error';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

interface ProductVariant {
  name: string;
  price: number;
  compareAtPrice: number | null;
  isDefault: boolean;
}

interface BackendProduct {
  id: string;
  name: string;
  categoryId: string;
  brand: string | null;
  images: string[];
  minPrice: number;
  variants: ProductVariant[];
}

const soldLabels = ['Hot sale', 'Fast moving', 'Trending', 'Best choice', 'Almost gone', 'Top pick'];
const HOME_PRODUCTS_PAGE_SIZE = 100;
const MAX_PRODUCTS_PER_CATEGORY = 6;
const mallTitles = [
  'Up to 50% off',
  'Buy 1 get 1',
  'Gift with order',
  'Daily vouchers',
  'Free shipping',
  'Member rewards',
  'Combo discounts',
  'New arrivals'
];
const categoryLabelMap: Record<string, string> = {
  'thoi-trang-nam': 'Thời Trang Nam',
  'thoi-trang-nu': 'Thời Trang Nữ',
  'dien-thoai-phu-kien': 'Điện Thoại & Phụ Kiện',
  'thiet-bi-dien-tu': 'Thiết Bị Điện Tử',
  'may-tinh-laptop': 'Máy Tính & Laptop',
  'may-anh-may-quay-phim': 'Máy Ảnh & Máy Quay Phim',
  'dong-ho': 'Đồng Hồ',
  'giay-dep-nam': 'Giày Dép Nam',
  'thiet-bi-dien-gia-dung': 'Thiết Bị Điện Gia Dụng',
  'the-thao-du-lich': 'Thể Thao & Du Lịch',
  'o-to-xe-may-xe-dap': 'Ô Tô & Xe Máy',
  'me-va-be': 'Mẹ & Bé',
  'nha-cua-doi-song': 'Nhà Cửa & Đời Sống',
  'sac-dep': 'Sắc Đẹp',
  'suc-khoe': 'Sức Khỏe',
  'giay-dep-nu': 'Giày Dép Nữ',
  'tui-vi-nu': 'Túi Ví Nữ',
  'phu-kien-trang-suc-nu': 'Phụ Kiện & Trang Sức',
  'bach-hoa-online': 'Bách Hóa Online',
  'nha-sach-online': 'Nhà Sách Online'
};

export async function GET() {
  try {
    const products = await requestUpstream<BackendProduct[]>(
      `${serviceBaseUrls.product}/products?page=1&pageSize=${HOME_PRODUCTS_PAGE_SIZE}&sortBy=createdAt&sortOrder=DESC`
    );

    return ok(buildHomeSections(products), 'backend');
  } catch (error) {
    return toErrorResponse(error);
  }
}

function buildHomeSections(products: BackendProduct[]): HomeSectionsData {
  if (products.length === 0) {
    return {
      keywords: [],
      categories: [],
      flashSaleItems: [],
      mallDeals: [],
      topSearchItems: [],
      recommendationProducts: []
    };
  }

  const normalized = products.map((product, index) => {
    const defaultVariant = product.variants.find((variant) => variant.isDefault) ?? product.variants[0] ?? null;
    const price = defaultVariant?.price ?? product.minPrice;
    const compareAtPrice = defaultVariant?.compareAtPrice ?? Math.round(price * 1.2 * 100) / 100;
    const discountPercent = calculateDiscountPercent(price, compareAtPrice);

    return {
      id: product.id,
      name: product.name,
      categoryId: product.categoryId?.trim() || 'uncategorized',
      brand: product.brand,
      price,
      compareAtPrice,
      discountPercent,
      image: product.images[0] ?? `https://picsum.photos/seed/product-${index + 1}/500/500`
    };
  });

  // TODO(product-service): no dedicated endpoints for flash-sale/mall/top-search/recommendation yet.
  // We derive sections from GET /api/v1/products until backend exposes domain-specific endpoints.
  const flashSaleItems = normalized.slice(0, 6).map((item, index) => ({
    id: `fs-${item.id}`,
    name: item.name,
    price: item.price,
    discountPercent: item.discountPercent,
    soldLabel: soldLabels[index % soldLabels.length],
    image: item.image
  }));

  const topSearchItems = normalized.slice(0, 6).map((item, index) => ({
    id: `top-${item.id}`,
    name: item.name,
    soldPerMonth: `${(index + 3) * 9}k / month`,
    image: item.image
  }));

  const categories = Array.from(new Map(normalized.map((item) => [item.categoryId, item])).values())
    .slice(0, 12)
    .map((item) => ({
      id: item.categoryId,
      label: resolveCategoryLabel(item.categoryId),
      icon: item.image
    }));
  const recommendationProducts = categories.flatMap((category) => {
    const itemsInCategory = normalized.filter((item) => item.categoryId === category.id).slice(0, MAX_PRODUCTS_PER_CATEGORY);

    return itemsInCategory.map((item, index) => ({
      id: item.id,
      title: item.name,
      categoryId: item.categoryId,
      price: item.price,
      sold: `${(index + 2) * 2}k+`,
      discountPercent: item.discountPercent,
      image: item.image
    }));
  });

  const uniqueBrands = Array.from(
    new Set(
      normalized
        .map((item) => item.brand?.trim())
        .filter((brand): brand is string => Boolean(brand && brand.length > 0))
    )
  );

  const mallDeals = uniqueBrands.slice(0, 8).map((brand, index) => ({
    id: `mall-${index + 1}`,
    brand: brand.toUpperCase(),
    title: mallTitles[index % mallTitles.length],
    image: normalized[index]?.image ?? `https://picsum.photos/seed/mall-${index + 1}/240/240`
  }));

  const keywords = deriveKeywords(normalized.map((item) => item.name));

  return {
    keywords,
    categories,
    flashSaleItems,
    mallDeals,
    topSearchItems,
    recommendationProducts
  };
}

function resolveCategoryLabel(categoryId: string): string {
  const normalized = categoryId.trim().toLowerCase();
  if (categoryLabelMap[normalized]) {
    return categoryLabelMap[normalized];
  }

  return normalized
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function deriveKeywords(names: string[]): string[] {
  return Array.from(
    new Set(
      names
        .map((name) => name.trim().toLowerCase().split(/\s+/).slice(0, 2).join(' '))
        .filter((value) => value.length > 0)
    )
  ).slice(0, 6);
}

function calculateDiscountPercent(price: number, compareAtPrice: number): number {
  if (compareAtPrice <= 0 || compareAtPrice <= price) {
    return 5;
  }

  return Math.max(5, Math.round(((compareAtPrice - price) / compareAtPrice) * 100));
}
