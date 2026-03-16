export interface ProductVariantSummary {
  sku: string;
  name: string;
  price: number;
  currency: string;
  compareAtPrice?: number | null;
  isDefault: boolean;
  metadata?: Record<string, unknown>;
}

export interface ProductSummary {
  id: string;
  sellerId: string;
  name: string;
  slug: string;
  description?: string | null;
  categoryId: string;
  brand?: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'HIDDEN' | 'ARCHIVED';
  attributes?: Record<string, unknown>;
  images?: string[];
  variants: ProductVariantSummary[];
  minPrice: number;
  createdAt: string;
  updatedAt: string;
}
