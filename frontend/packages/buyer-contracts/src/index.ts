export interface ApiMeta {
  requestId?: string;
  source?: string;
  timestamp?: string;
  pagination?: Pagination;
}

export interface ApiError {
  code: string;
  message: string;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: ApiMeta;
}

export interface ApiFailure {
  success: false;
  error: ApiError;
  meta?: ApiMeta;
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface HomeCategoryItem {
  id: string;
  label: string;
  icon: string;
}

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
  categoryId: string;
  price: number;
  sold: string;
  discountPercent: number;
  image: string;
}

export interface HomeSectionsData {
  keywords: string[];
  categories: HomeCategoryItem[];
  flashSaleItems: FlashSaleItem[];
  mallDeals: MallDealItem[];
  topSearchItems: TopSearchItem[];
  recommendationProducts: ProductItem[];
}

export interface ProductSearchItem {
  id: string;
  title: string;
  slug: string;
  categoryId: string;
  brand: string | null;
  image: string;
  price: number;
  currency: string;
  compareAtPrice: number | null;
  discountPercent: number;
}

export interface ProductSearchOutput {
  items: ProductSearchItem[];
  pagination: Pagination;
}

export interface ProductDetail extends ProductSearchItem {
  description: string;
  sellerId: string;
  sellerCode?: string;
  images: string[];
  variants: ProductVariant[];
  status: string;
  defaultSku?: string | null;
  stock?: number | null;
  attributes?: Record<string, string | number | boolean | null>;
}

export interface ProductVariant {
  sku: string;
  name: string;
  price: number;
  currency: string;
  compareAtPrice: number | null;
  isDefault: boolean;
}

export interface BuyerShopDetail {
  sellerId: string;
  sellerCode?: string;
  shopName: string;
  slogan: string;
  logoUrl: string;
  bannerUrl: string;
  accentColor: string;
  navItems: string[];
  featuredCategories: string[];
  introTitle?: string;
  introDescription?: string;
  updatedAt?: string;
}

export interface BuyerUser {
  id: string;
  email: string;
  role: string;
  isEmailVerified: boolean;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  sessionId: string;
  user: BuyerUser;
}

export type RotatedAuthTokens = Omit<AuthSession, 'user'>;

export type BuyerGender = 'male' | 'female' | 'other' | 'unspecified';

export interface BuyerProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  phone: string;
  address: string;
  addressProvince: string;
  addressProvinceCode: string;
  addressWard: string;
  addressWardCode: string;
  gender: BuyerGender;
  dateOfBirth: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateBuyerProfileInput {
  name?: string;
  phone?: string;
  address?: string;
  addressProvince?: string;
  addressProvinceCode?: string;
  addressWard?: string;
  addressWardCode?: string;
  gender?: BuyerGender;
  dateOfBirth?: string | null;
  avatarUrl?: string | null;
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
  pagination?: Pagination;
}

export interface CreateOrderInput {
  currency: string;
  shippingAmount?: number;
  discountAmount?: number;
  note?: string;
  items: Array<{
    productId: string;
    sku: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }>;
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
  status: PaymentStatus;
  currency: string;
  amount: number;
  requiresActionUrl?: string;
}

export interface ReviewSummary {
  productId: string;
  averageRating: number;
  totalReviews: number;
  starDistribution: Record<string, number>;
}

export interface ReviewItem {
  id: string;
  orderId: string;
  productId: string;
  sellerId: string;
  buyerId: string;
  rating: number;
  title: string | null;
  content: string;
  images: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewListOutput {
  items: ReviewItem[];
  pagination: Pagination;
}

export interface BuyerChatConversation {
  id: string;
  sellerId: string;
  context: {
    productId?: string | null;
    orderId?: string | null;
    shopId?: string | null;
    sellerName?: string | null;
  };
  unread: {
    buyer: number;
    seller: number;
  };
  status: string;
  createdAt: string;
  updatedAt: string;
  lastMessage?: {
    messageId: string;
    textPreview: string;
    sentAt: string;
  };
}

export interface BuyerChatMessage {
  id: string;
  conversationId: string;
  seq: number;
  clientMessageId?: string;
  senderId: string;
  senderRole: string;
  text: string;
  sentAt: string;
}

export interface BuyerVideoProduct {
  productId: string;
  sku: string | null;
  name: string;
  image: string | null;
  price: number;
  currency: string;
  status: string;
  sortOrder: number;
}

export interface BuyerVideo {
  videoId: string;
  sellerId: string;
  title: string;
  description: string | null;
  status: 'published';
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  products: BuyerVideoProduct[];
  seller: {
    sellerId: string;
    sellerCode: string;
    shopName: string;
  };
  metrics: {
    viewStartedCount?: number;
    qualifiedViewCount: number;
    productClickCount: number;
    addToCartCount: number;
    commentCount?: number;
  };
}

export interface BuyerVideoComment {
  commentId: string;
  videoId: string;
  userId: string;
  userRole: string;
  text: string;
  status: 'VISIBLE' | 'HIDDEN' | 'DELETED';
  clientCommentId?: string;
  createdAt: string;
  updatedAt: string;
}

export type LiveSessionStatus = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'ENDED' | 'CANCELLED';
export type LivePlaybackProtocol = 'HLS' | 'LL_HLS' | 'WEBRTC';

export interface LiveSession {
  id: string;
  sessionId: string;
  sellerId: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  playbackUrl: string;
  media?: {
    playback: {
      protocol: LivePlaybackProtocol;
      url: string;
    };
    status: string;
  };
  status: LiveSessionStatus;
  metricsSnapshot: {
    viewerPeak: number;
    messageCount: number;
    productClickCount: number;
    addToCartCount: number;
  };
}

export interface LiveProduct {
  id: string;
  sessionId: string;
  productId: string;
  sellerId: string;
  nameSnapshot: string;
  priceSnapshot: number;
  currencySnapshot: string;
  imageSnapshot?: string;
  pinStatus: 'PINNED' | 'UNPINNED';
  sortOrder: number;
}

export interface LiveMessage {
  messageId: string;
  sessionId: string;
  senderId: string;
  senderRole: string;
  text: string;
  clientMessageId?: string;
  createdAt: string;
}

export interface LiveSessionDetail {
  session: LiveSession;
  pinnedProducts: LiveProduct[];
}

export function unwrapApiEnvelope<T>(payload: unknown): T {
  if (!isRecord(payload) || payload.success !== true || !('data' in payload)) {
    const message =
      isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === 'string'
        ? payload.error.message
        : 'API returned an invalid response';
    throw new Error(message);
  }

  return payload.data as T;
}

export function buildProductSearchQuery(input: {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  brand?: string;
  sellerId?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'minPrice';
  sortOrder?: 'ASC' | 'DESC';
}): string {
  const query = new URLSearchParams();
  if (Number.isInteger(input.page) && (input.page ?? 0) > 0) {
    query.set('page', String(input.page));
  }
  if (Number.isInteger(input.pageSize) && (input.pageSize ?? 0) > 0) {
    query.set('pageSize', String(Math.min(input.pageSize ?? 20, 100)));
  }
  const search = input.search?.trim();
  if (search) {
    query.set('search', search.slice(0, 255));
  }
  const categoryId = input.categoryId?.trim();
  if (categoryId) {
    query.set('categoryId', categoryId);
  }
  const brand = input.brand?.trim();
  if (brand) {
    query.set('brand', brand);
  }
  const sellerId = input.sellerId?.trim();
  if (sellerId) {
    query.set('sellerId', sellerId);
  }
  if (input.sortBy) {
    query.set('sortBy', input.sortBy);
  }
  if (input.sortOrder) {
    query.set('sortOrder', input.sortOrder);
  }

  return query.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
