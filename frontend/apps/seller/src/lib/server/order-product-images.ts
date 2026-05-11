import type { SellerOrder, SellerOrderItem } from '@/lib/api/types';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

interface ProductImageSnapshot {
  id?: unknown;
  images?: unknown;
}

interface ManagedProductsListOutput {
  items?: unknown;
}

const MANAGED_PRODUCTS_PAGE_SIZE = 100;
const MANAGED_PRODUCTS_MAX_PAGES = 20;

export async function enrichOrderWithProductImages(order: SellerOrder, accessToken?: string): Promise<SellerOrder> {
  const imageMap = await fetchProductImageMap(order.items, accessToken);
  return {
    ...order,
    items: order.items.map((item) => ({
      ...item,
      imageUrl: imageMap.get(item.productId) ?? null
    }))
  };
}

export async function enrichOrderListWithProductImages(orders: SellerOrder[], accessToken?: string): Promise<SellerOrder[]> {
  const allItems = orders.flatMap((order) => order.items);
  const imageMap = await fetchProductImageMap(allItems, accessToken);

  return orders.map((order) => ({
    ...order,
    items: order.items.map((item) => ({
      ...item,
      imageUrl: imageMap.get(item.productId) ?? null
    }))
  }));
}

async function fetchProductImageMap(orderItems: SellerOrderItem[], accessToken?: string): Promise<Map<string, string | null>> {
  const productIds = uniqueProductIds(orderItems);
  const imageMap = new Map<string, string | null>();

  if (productIds.length === 0) {
    return imageMap;
  }

  if (accessToken) {
    await hydrateImageMapFromManagedProducts(imageMap, productIds, accessToken);
  }

  const remainingIds = productIds.filter((productId) => !imageMap.has(productId));
  if (remainingIds.length === 0) {
    return imageMap;
  }

  const lookups = await Promise.allSettled(
    remainingIds.map(async (productId) => {
      const product = await requestUpstream<unknown>(`${serviceBaseUrls.product}/products/${encodeURIComponent(productId)}`, {
        method: 'GET'
      });

      return {
        productId,
        imageUrl: extractFirstProductImage(product)
      };
    })
  );

  for (const result of lookups) {
    if (result.status === 'fulfilled') {
      imageMap.set(result.value.productId, result.value.imageUrl);
      continue;
    }
  }

  return imageMap;
}

async function hydrateImageMapFromManagedProducts(
  imageMap: Map<string, string | null>,
  targetProductIds: string[],
  accessToken: string
): Promise<void> {
  const unresolved = new Set(targetProductIds);

  for (let page = 1; page <= MANAGED_PRODUCTS_MAX_PAGES && unresolved.size > 0; page += 1) {
    let payload: unknown;
    try {
      payload = await requestUpstream<unknown>(
        `${serviceBaseUrls.product}/products/my?page=${page}&pageSize=${MANAGED_PRODUCTS_PAGE_SIZE}&sortBy=updatedAt&sortOrder=DESC`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );
    } catch {
      return;
    }

    const products = extractManagedProductsArray(payload);
    if (products.length === 0) {
      return;
    }

    for (const product of products) {
      const productId = typeof product.id === 'string' ? product.id.trim() : '';
      if (!productId || !unresolved.has(productId)) {
        continue;
      }

      imageMap.set(productId, extractFirstProductImage(product));
      unresolved.delete(productId);
    }

    if (products.length < MANAGED_PRODUCTS_PAGE_SIZE) {
      return;
    }
  }
}

function extractManagedProductsArray(payload: unknown): ProductImageSnapshot[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is ProductImageSnapshot => Boolean(item && typeof item === 'object'));
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const items = (payload as ManagedProductsListOutput).items;
  if (!Array.isArray(items)) {
    return [];
  }

  return items.filter((item): item is ProductImageSnapshot => Boolean(item && typeof item === 'object'));
}

function uniqueProductIds(orderItems: SellerOrderItem[]): string[] {
  const unique = new Set<string>();

  for (const item of orderItems) {
    const productId = item.productId?.trim();
    if (productId) {
      unique.add(productId);
    }
  }

  return [...unique];
}

function extractFirstProductImage(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const images = (value as ProductImageSnapshot).images;
  if (!Array.isArray(images) || images.length === 0) {
    return null;
  }

  for (const image of images) {
    if (typeof image === 'string' && image.trim()) {
      return image.trim();
    }
  }

  return null;
}
