export interface FlashSaleItem {
  id: string;
  name: string;
  price: number;
  discountPercent: number;
  soldLabel: string;
  image: string;
}

export interface MallDealItem {
  id: string;
  brand: string;
  title: string;
  image: string;
}

export interface TopSearchItem {
  id: string;
  name: string;
  soldPerMonth: string;
  image: string;
}

export interface ProductItem {
  id: string;
  title: string;
  price: number;
  sold: string;
  discountPercent: number;
  image: string;
}

export interface ProductDetail {
  id: string;
  title: string;
  description: string;
  brand: string | null;
  categoryId: string;
  image: string;
  images: string[];
  price: number;
  currency: string;
  defaultSku: string | null;
  compareAtPrice: number | null;
  discountPercent: number;
  stock: number | null;
}

export interface BuyerApiMeta {
  source: 'backend';
  timestamp: string;
}

export interface BuyerApiSuccess<T> {
  success: true;
  data: T;
  meta: BuyerApiMeta;
}

export interface BuyerApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
  };
  meta: {
    timestamp: string;
  };
}

export type BuyerApiResponse<T> = BuyerApiSuccess<T> | BuyerApiFailure;

export interface HomeSectionsData {
  keywords: string[];
  flashSaleItems: FlashSaleItem[];
  mallDeals: MallDealItem[];
  topSearchItems: TopSearchItem[];
  recommendationProducts: ProductItem[];
}

export interface BuyerAuthUser {
  id: string;
  email: string;
  role: string;
  isEmailVerified: boolean;
  mfaEnabled: boolean;
}

export interface BuyerAuthSession {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  sessionId: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  role?: 'CUSTOMER' | 'SELLER';
}

export interface RegisterOutput {
  userId: string;
  email: string;
  role: string;
  emailVerificationRequired: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface LoginOutput {
  session: BuyerAuthSession;
  user: BuyerAuthUser;
}

export interface LogoutInput {
  accessToken: string;
  refreshToken: string;
}

export interface MeOutput {
  user: BuyerAuthUser;
}

export interface BuyerProfileOutput {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  phone: string;
  address: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateBuyerProfileInput {
  name?: string;
  phone?: string;
  address?: string;
}

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'FAILED';

export interface OrderItem {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  currency: string;
  subtotalAmount: number;
  shippingAmount: number;
  discountAmount: number;
  totalAmount: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export interface OrderListOutput {
  items: Order[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface ListOrdersInput {
  page?: number;
  pageSize?: number;
  status?: OrderStatus;
  sortBy?: 'createdAt' | 'totalAmount' | 'orderNumber';
  sortOrder?: 'ASC' | 'DESC';
  search?: string;
}

export interface CreateOrderItemInput {
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateOrderInput {
  currency: string;
  shippingAmount?: number;
  discountAmount?: number;
  note?: string;
  items: CreateOrderItemInput[];
}

export interface CancelOrderInput {
  reason?: string;
}

export type OrderAction = 'cancel' | 'confirm-received' | 'buy-again';

export interface OrderStatusHistoryItem {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedBy: string;
  changedByRole: string;
  reason: string | null;
  createdAt: string;
}

export interface OrderStatusHistoryOutput {
  orderId: string;
  histories: OrderStatusHistoryItem[];
}

export type PaymentStatus =
  | 'PENDING'
  | 'REQUIRES_ACTION'
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'FAILED'
  | 'CANCELLED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'CHARGEBACK';

export interface Payment {
  id: string;
  orderId: string;
  userId: string;
  sellerId: string | null;
  provider: string;
  providerPaymentId: string | null;
  status: PaymentStatus;
  currency: string;
  amount: number;
  refundedAmount: number;
  refundableAmount: number;
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  requiresActionUrl?: string;
}

export interface CreatePaymentIntentInput {
  orderId: string;
  currency: string;
  amount: number;
  description?: string;
  autoCapture?: boolean;
}

export type ShipmentStatus =
  | 'PENDING'
  | 'AWB_CREATED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'FAILED'
  | 'RETURNED';

export interface Shipment {
  id: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  provider: string;
  awb: string | null;
  trackingNumber: string | null;
  status: ShipmentStatus;
  currency: string;
  shippingFee: number;
  codAmount: number;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  note: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentTrackingEvent {
  id: string;
  shipmentId: string;
  status: ShipmentStatus;
  eventCode: string | null;
  description: string | null;
  location: string | null;
  occurredAt: string;
  rawPayload: Record<string, unknown> | null;
  createdAt: string;
}

export interface ShipmentTrackingEventsOutput {
  shipmentId: string;
  events: ShipmentTrackingEvent[];
}
