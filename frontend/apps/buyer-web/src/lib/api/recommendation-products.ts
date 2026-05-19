import { fetchProductDetail } from './products';
import { fetchProductRecommendations } from './recommendations';
import type { ProductDetail, ProductItem } from './types';

export async function loadRecommendedProductItems(seedProductIds: string[], limit = 6): Promise<ProductItem[]> {
  const seeds = Array.from(new Set(seedProductIds.map((id) => id.trim()).filter(Boolean)));
  if (seeds.length === 0) {
    return [];
  }

  const recommendation = await fetchProductRecommendations(seeds[0], limit);
  const ids = recommendation.items
    .map((item) => item.productId)
    .filter((id) => id && !seeds.includes(id))
    .slice(0, limit);

  if (ids.length === 0) {
    return [];
  }

  return hydrateProductItems(ids, limit);
}

export async function hydrateProductItems(productIds: string[], limit = 6): Promise<ProductItem[]> {
  const ids = Array.from(new Set(productIds.map((id) => id.trim()).filter(Boolean))).slice(0, limit);
  if (ids.length === 0) {
    return [];
  }

  const details = await Promise.allSettled(ids.map((id) => fetchProductDetail(id)));
  return details
    .filter((result): result is PromiseFulfilledResult<ProductDetail> => result.status === 'fulfilled')
    .map((result, index) => toProductItem(result.value, index));
}

function toProductItem(product: ProductDetail, index: number): ProductItem {
  return {
    id: product.id,
    title: product.title,
    categoryId: product.categoryId,
    price: product.price,
    sold: `${Math.max(1, index + 1)}k+`,
    discountPercent: product.discountPercent,
    image: product.image
  };
}
