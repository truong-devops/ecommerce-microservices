export interface ProductVariant {
  sku: string;
  name: string;
  price: number;
  currency: string;
  compareAtPrice: number | null;
  isDefault: boolean;
  metadata: Record<string, unknown>;
}

export interface ProductItem {
  id: string;
  sellerId: string;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string;
  brand: string | null;
  status: string;
  attributes: Record<string, unknown>;
  images: string[];
  variants: ProductVariant[];
  minPrice: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ProductListResponse {
  items: ProductItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}
