import { requestUpstream, serviceBaseUrls } from './upstream-client';

interface ProductVariantForAvailability {
  sku?: string | null;
  isDefault?: boolean | null;
}

export interface ProductWithAvailabilityVariants {
  variants?: ProductVariantForAvailability[] | null;
}

interface InventoryAvailabilityResponse {
  availableQuantity?: unknown;
  isAvailable?: unknown;
}

export async function filterProductsWithAvailableStock<T extends ProductWithAvailabilityVariants>(products: T[]): Promise<T[]> {
  if (products.length === 0) {
    return products;
  }

  const skuByProduct = new Map<T, string>();
  for (const product of products) {
    const sku = resolveDefaultSku(product);
    if (sku) {
      skuByProduct.set(product, sku);
    }
  }

  const uniqueSkus = Array.from(new Set(skuByProduct.values()));
  if (uniqueSkus.length === 0) {
    return [];
  }

  const availabilityEntries = await Promise.all(
    uniqueSkus.map(async (sku) => [sku, await validateSkuHasAvailableStock(sku)] as const)
  );
  const availabilityBySku = new Map<string, boolean>(availabilityEntries);

  return products.filter((product) => {
    const sku = skuByProduct.get(product);
    return Boolean(sku && availabilityBySku.get(sku));
  });
}

function resolveDefaultSku(product: ProductWithAvailabilityVariants): string | null {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const variant = variants.find((item) => item.isDefault) ?? variants[0] ?? null;
  const sku = variant?.sku?.trim();

  return sku && sku.length > 0 ? sku : null;
}

async function validateSkuHasAvailableStock(sku: string): Promise<boolean> {
  const query = new URLSearchParams({
    sku,
    quantity: '1'
  });

  try {
    const result = await requestUpstream<InventoryAvailabilityResponse>(
      `${serviceBaseUrls.inventory}/inventory/validate?${query.toString()}`
    );
    if (typeof result.isAvailable === 'boolean') {
      return result.isAvailable;
    }

    return toAvailableQuantity(result.availableQuantity) > 0;
  } catch {
    return false;
  }
}

function toAvailableQuantity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}
