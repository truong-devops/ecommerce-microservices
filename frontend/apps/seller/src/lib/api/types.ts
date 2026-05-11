export interface SellerApiMeta {
  source: 'backend';
  timestamp: string;
}

export interface SellerApiSuccess<T> {
  success: true;
  data: T;
  meta: SellerApiMeta;
}

export interface SellerApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
  };
  meta: {
    timestamp: string;
  };
}

export type SellerApiResponse<T> = SellerApiSuccess<T> | SellerApiFailure;

export interface SellerAuthUser {
  id: string;
  email: string;
  role: string;
  isEmailVerified: boolean;
  mfaEnabled: boolean;
}

export interface SellerAuthSession {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  sessionId: string;
}

export interface LoginInput {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface LoginOutput {
  session: SellerAuthSession;
  user: SellerAuthUser;
}

export interface MeOutput {
  user: SellerAuthUser;
}

export interface LogoutInput {
  accessToken: string;
  refreshToken: string;
}

export interface SellerShopProfile {
  userId: string;
  shopName: string;
  contactFirstName: string;
  contactLastName: string;
  email: string;
  phone: string;
  address: string;
  avatarUrl: string;
}

export interface UpdateSellerShopProfileInput {
  shopName?: string;
  contactFirstName?: string;
  contactLastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  avatarUrl?: string;
}

export interface SellerShopDecor {
  sellerId: string;
  shopName: string;
  slogan: string;
  logoUrl: string;
  bannerUrl: string;
  accentColor: string;
  navItems: string[];
  introTitle: string;
  introDescription: string;
  featuredCategories: string[];
  updatedAt: string;
}

export interface UpdateSellerShopDecorInput {
  shopName?: string;
  slogan?: string;
  logoUrl?: string;
  bannerUrl?: string;
  accentColor?: string;
  navItems?: string[];
  introTitle?: string;
  introDescription?: string;
  featuredCategories?: string[];
}

export interface DateRange {
  from: string;
  to: string;
}

export type DashboardMetricType = 'currency' | 'number' | 'percent';

export type DashboardTrend = 'up' | 'down' | 'flat';

export interface SellerDashboardKpi {
  id: string;
  label: string;
  value: number;
  metricType: DashboardMetricType;
  changePercent: number;
  trend: DashboardTrend;
  sparkline: number[];
}

export interface DashboardSeriesPoint {
  label: string;
  value: number;
}

export interface OrderStatusSlice {
  id: string;
  label: string;
  value: number;
  color: string;
}

export interface TopProductPerformance {
  id: string;
  name: string;
  imageUrl: string | null;
  revenue: number;
  sold: number;
}

export interface TrafficSourceSlice {
  id: string;
  label: string;
  value: number;
  color: string;
}

export interface QuickActionItem {
  id: string;
  title: string;
  description: string;
  accent: 'orange' | 'blue' | 'green' | 'purple' | 'slate';
}

export interface DashboardAlertItem {
  id: string;
  level: 'warning' | 'info' | 'success';
  title: string;
  description: string;
}

export interface SellerNewsItem {
  id: string;
  title: string;
  content: string;
  category: string;
  eventType: string | null;
  status: string;
  createdAt: string;
}

export interface SellerDashboardData {
  dateRange: DateRange;
  kpis: SellerDashboardKpi[];
  revenueSeries: DashboardSeriesPoint[];
  orderStatus: OrderStatusSlice[];
  topProducts: TopProductPerformance[];
  trafficSources: TrafficSourceSlice[];
  quickActions: QuickActionItem[];
  alerts: DashboardAlertItem[];
  insights: string[];
  news: SellerNewsItem[];
}

export type SellerProductStatus = 'DRAFT' | 'ACTIVE' | 'HIDDEN' | 'ARCHIVED';

export interface SellerProductVariantInput {
  sku: string;
  name: string;
  price: number;
  currency: string;
  compareAtPrice?: number | null;
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CreateSellerProductInput {
  sellerId?: string;
  name: string;
  slug?: string;
  description?: string;
  categoryId: string;
  brand?: string;
  attributes?: Record<string, unknown>;
  images?: string[];
  variants: SellerProductVariantInput[];
  status?: SellerProductStatus;
}

export interface UpdateSellerProductInput extends CreateSellerProductInput {}

export interface SellerProductVariant extends SellerProductVariantInput {
  compareAtPrice: number | null;
  isDefault: boolean;
  metadata: Record<string, unknown>;
}

export interface SellerProduct {
  id: string;
  sellerId: string;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string;
  brand: string | null;
  status: SellerProductStatus;
  attributes: Record<string, unknown>;
  images: string[];
  variants: SellerProductVariant[];
  minPrice: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SellerProductListOutput {
  items: SellerProduct[];
  page: number;
  pageSize: number;
  hasNext: boolean;
}

export interface SellerCategoryOption {
  id: string;
  count: number;
}

export interface SellerCategoryListOutput {
  items: SellerCategoryOption[];
  scannedPages: number;
}

export interface UploadSellerProductImageInput {
  file: File;
  folder?: string;
}

export interface UploadSellerProductImageOutput {
  fileName: string;
  folder: string;
  objectKey: string;
  imageUrl: string;
  relativePath: string;
}

export type SellerOrderStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'FAILED';

export interface SellerOrderItem {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface SellerOrder {
  id: string;
  orderNumber: string;
  orderCode?: string;
  userId: string;
  userCode?: string;
  status: SellerOrderStatus;
  currency: string;
  subtotalAmount: number;
  shippingAmount: number;
  discountAmount: number;
  totalAmount: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  items: SellerOrderItem[];
}

export interface SellerOrderListOutput {
  items: SellerOrder[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface ListSellerOrdersInput {
  page?: number;
  pageSize?: number;
  status?: SellerOrderStatus;
  sortBy?: 'createdAt' | 'totalAmount' | 'orderNumber';
  sortOrder?: 'ASC' | 'DESC';
  search?: string;
}

export interface UpdateSellerOrderStatusInput {
  status: SellerOrderStatus;
  reason?: string;
}

export interface SellerOrderStatusHistoryItem {
  id: string;
  fromStatus: SellerOrderStatus | null;
  toStatus: SellerOrderStatus;
  changedBy: string;
  changedByRole: string;
  reason: string | null;
  createdAt: string;
}

export interface SellerOrderStatusHistoryOutput {
  orderId: string;
  histories: SellerOrderStatusHistoryItem[];
}

export type SellerShipmentStatus =
  | 'PENDING'
  | 'AWB_CREATED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'FAILED'
  | 'RETURNED';

export interface SellerShipment {
  id: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  provider: string;
  awb: string | null;
  trackingNumber: string | null;
  status: SellerShipmentStatus;
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

export interface SellerShipmentListOutput {
  items: SellerShipment[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface ListSellerShipmentsInput {
  page?: number;
  pageSize?: number;
  status?: SellerShipmentStatus;
  provider?: string;
  orderId?: string;
  search?: string;
  sortBy?: 'createdAt' | 'shippingFee' | 'status';
  sortOrder?: 'ASC' | 'DESC';
}

export interface SellerShipmentTrackingEvent {
  id: string;
  shipmentId: string;
  status: SellerShipmentStatus;
  eventCode: string | null;
  description: string | null;
  location: string | null;
  occurredAt: string;
  rawPayload: Record<string, unknown> | null;
  createdAt: string;
}

export interface SellerShipmentTrackingEventsOutput {
  shipmentId: string;
  events: SellerShipmentTrackingEvent[];
}

export interface SellerChatLastMessage {
  messageId: string;
  senderId: string;
  textPreview: string;
  sentAt: string;
}

export interface SellerChatConversation {
  id: string;
  type: string;
  buyerId: string;
  buyerCode?: string;
  sellerId: string;
  sellerCode?: string;
  context: {
    productId?: string | null;
    orderId?: string | null;
    shopId?: string | null;
    buyerName?: string | null;
    sellerName?: string | null;
  };
  unread: {
    buyer: number;
    seller: number;
  };
  status: string;
  createdAt: string;
  updatedAt: string;
  lastMessage?: SellerChatLastMessage;
}

export interface SellerChatConversationsOutput {
  items: SellerChatConversation[];
  pagination?: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface SellerChatMessage {
  id: string;
  conversationId: string;
  seq: number;
  clientMessageId?: string;
  senderId: string;
  senderCode?: string;
  senderRole: string;
  kind: string;
  text: string;
  sentAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  readByBuyerAt?: string | null;
  readBySellerAt?: string | null;
}

export interface SellerChatMessagesOutput {
  items: SellerChatMessage[];
}

export interface CreateSellerChatConversationInput {
  buyerId: string;
  sellerId?: string;
  orderId?: string;
  productId?: string;
  shopId?: string;
  buyerName?: string;
  sellerName?: string;
  firstMessage?: string;
  clientMessageId?: string;
}

export interface SendSellerChatMessageInput {
  text: string;
  clientMessageId?: string;
}
