export interface CartItemSummary {
  id: string;
  productId: string;
  variantId?: string | null;
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  sellerId: string;
}

export interface CartSummary {
  id: string;
  userId: string;
  currency: string;
  items: CartItemSummary[];
  subtotal: number;
  discountTotal: number;
  grandTotal: number;
  expiresAt: string;
  version: number;
}
