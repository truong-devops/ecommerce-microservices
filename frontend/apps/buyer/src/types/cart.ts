export interface CartItem {
  id: string;
  productId: string;
  variantId: string | null;
  sku: string;
  name: string;
  image: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  sellerId: string;
  metadata: Record<string, unknown>;
}

export interface CartSnapshot {
  id: string;
  userId: string;
  currency: string;
  items: CartItem[];
  subtotal: number;
  discountTotal: number;
  grandTotal: number;
  expiresAt: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AddToCartRequest {
  productId: string;
  variantId?: string;
  sku: string;
  name: string;
  image?: string;
  unitPrice: number;
  quantity: number;
  sellerId: string;
  metadata?: Record<string, unknown>;
  currency?: string;
  expectedVersion?: number;
}

export interface UpdateCartItemRequest {
  quantity: number;
  expectedVersion?: number;
}
