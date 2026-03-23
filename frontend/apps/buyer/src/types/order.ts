export interface CreateOrderItemRequest {
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateOrderRequest {
  currency: string;
  shippingAmount?: number;
  discountAmount?: number;
  note?: string;
  items: CreateOrderItemRequest[];
}

export interface OrderItemResponse {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface OrderResponse {
  id: string;
  orderNumber: string;
  userId: string;
  status: string;
  currency: string;
  subtotalAmount: number;
  shippingAmount: number;
  discountAmount: number;
  totalAmount: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItemResponse[];
}
