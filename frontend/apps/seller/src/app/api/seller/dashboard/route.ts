import type {
  DashboardAlertItem,
  DashboardSeriesPoint,
  OrderStatusSlice,
  SellerDashboardData,
  SellerDashboardKpi,
  SellerNewsItem,
  TopProductPerformance,
  TrafficSourceSlice
} from '@/lib/api/types';
import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls, UpstreamHttpError } from '@/lib/server/upstream-client';

const DASHBOARD_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT']);

const ORDER_STATUS = {
  pending: 'PENDING',
  confirmed: 'CONFIRMED',
  processing: 'PROCESSING',
  shipped: 'SHIPPED',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
  failed: 'FAILED'
} as const;

const TRAFFIC_COLORS = {
  ads: '#f97316',
  search: '#3b82f6',
  direct: '#14b8a6',
  social: '#8b5cf6'
} as const;

interface AnalyticsOverviewOutput {
  from: string;
  to: string;
  sellerId: string | null;
  totalEvents: number;
  uniqueOrders: number;
  uniquePayments: number;
  uniqueShipments: number;
  capturedAmount: number;
  refundedAmount: number;
}

interface AnalyticsTimeseriesOutput {
  items: Array<{
    bucket: string;
    eventType: string;
    totalEvents: number;
  }>;
}

interface PaginationOutput {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  totalPrice: number;
}

interface OrderRecord {
  id: string;
  status: string;
  items: OrderItem[];
}

interface OrderListOutput {
  items: OrderRecord[];
  pagination: PaginationOutput;
}

interface ProductVariant {
  sku: string;
  isDefault: boolean;
}

interface ManagedProduct {
  id: string;
  name: string;
  images: string[];
  variants: ProductVariant[];
}

interface ProductListOutput {
  items: ManagedProduct[];
  pagination: PaginationOutput;
}

interface InventoryValidateOutput {
  sku: string;
  requestedQuantity: number;
  availableQuantity: number;
  isAvailable: boolean;
}

interface NotificationItem {
  id: string;
  category: string;
  eventType: string | null;
  subject: string | null;
  content: string;
  status: string;
  createdAt: string;
}

interface NotificationListOutput {
  items: NotificationItem[];
  pagination: PaginationOutput;
}

interface DailyMetricBucket {
  bucket: string;
  totalEvents: number;
  visits: number;
  clicks: number;
  ordersCreated: number;
  cancelledEvents: number;
  ads: number;
  search: number;
  direct: number;
  social: number;
}

export async function GET(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  }

  if (!DASHBOARD_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed for seller dashboard');
  }

  const query = new URL(request.url).searchParams;
  const sellerId = normalizeSellerId(query.get('sellerId'));

  const dateRange = resolveDateRange(query.get('from'), query.get('to'));
  if (!dateRange) {
    return fail(400, 'BAD_REQUEST', 'Invalid date range. Use ISO-8601 and ensure from < to.');
  }

  const shouldFetchManagedProducts = claims.role !== 'SUPPORT';
  const analyticsQuery = buildAnalyticsQuery(dateRange.from, dateRange.to, sellerId);
  const authHeaders = {
    Authorization: `Bearer ${accessToken}`
  };

  try {
    const [
      overview,
      timeseries,
      latestNotifications,
      pendingCount,
      confirmedCount,
      processingCount,
      shippedCount,
      deliveredCount,
      cancelledCount,
      failedCount,
      recentOrders,
      managedProducts
    ] = await Promise.all([
      requestUpstream<AnalyticsOverviewOutput>(`${serviceBaseUrls.analytics}/analytics/overview${analyticsQuery}`, {
        method: 'GET',
        headers: authHeaders
      }),
      requestUpstream<AnalyticsTimeseriesOutput>(`${serviceBaseUrls.analytics}/analytics/events/timeseries${analyticsQuery}&interval=day`, {
        method: 'GET',
        headers: authHeaders
      }),
      fetchLatestNotifications(accessToken),
      fetchOrderCount(accessToken, ORDER_STATUS.pending),
      fetchOrderCount(accessToken, ORDER_STATUS.confirmed),
      fetchOrderCount(accessToken, ORDER_STATUS.processing),
      fetchOrderCount(accessToken, ORDER_STATUS.shipped),
      fetchOrderCount(accessToken, ORDER_STATUS.delivered),
      fetchOrderCount(accessToken, ORDER_STATUS.cancelled),
      fetchOrderCount(accessToken, ORDER_STATUS.failed),
      fetchRecentOrders(accessToken),
      shouldFetchManagedProducts ? fetchManagedProducts(accessToken) : Promise.resolve([])
    ]);

    const dailyBuckets = aggregateDailyMetrics(timeseries.items);
    const revenueSeries = deriveRevenueSeries(dailyBuckets, sanitizeNumber(overview.capturedAmount));

    const todayBucket = dailyBuckets.at(-1) ?? createEmptyDailyBucket(dateRange.to);
    const yesterdayBucket = dailyBuckets.at(-2) ?? createEmptyDailyBucket(dateRange.from);

    const todayRevenue = revenueSeries.at(-1)?.value ?? 0;
    const yesterdayRevenue = revenueSeries.at(-2)?.value ?? 0;

    const todayOrders = todayBucket.ordersCreated;
    const yesterdayOrders = yesterdayBucket.ordersCreated;

    const todayVisits = todayBucket.visits;
    const yesterdayVisits = yesterdayBucket.visits;

    const todayConversion = todayVisits > 0 ? (todayOrders / todayVisits) * 100 : 0;
    const yesterdayConversion = yesterdayVisits > 0 ? (yesterdayOrders / yesterdayVisits) * 100 : 0;

    const todayReturns = todayBucket.cancelledEvents;
    const yesterdayReturns = yesterdayBucket.cancelledEvents;

    const lowStockCount = shouldFetchManagedProducts ? await fetchLowStockCount(managedProducts) : 0;

    const kpis = buildKpis({
      revenueSeries,
      dailyBuckets,
      todayRevenue,
      yesterdayRevenue,
      todayOrders,
      yesterdayOrders,
      todayConversion,
      yesterdayConversion,
      todayVisits,
      yesterdayVisits,
      todayReturns,
      yesterdayReturns,
      lowStockCount
    });

    const orderStatus: OrderStatusSlice[] = [
      {
        id: 'pending',
        label: 'Chờ xử lý',
        value: pendingCount + confirmedCount,
        color: '#f59e0b'
      },
      {
        id: 'in_transit',
        label: 'Đang giao',
        value: processingCount + shippedCount,
        color: '#3b82f6'
      },
      {
        id: 'completed',
        label: 'Hoàn thành',
        value: deliveredCount,
        color: '#10b981'
      },
      {
        id: 'cancelled',
        label: 'Hủy',
        value: cancelledCount + failedCount,
        color: '#ef4444'
      }
    ];

    const topProducts = buildTopProducts(recentOrders, managedProducts);

    const trafficSources = buildTrafficSources(dailyBuckets);

    const newsItems = toNewsItems(latestNotifications.items);

    const alerts = buildAlerts({
      lowStockCount,
      todayReturns,
      todayOrders,
      news: newsItems
    });

    const insights = buildInsights({
      revenueToday: todayRevenue,
      revenueYesterday: yesterdayRevenue,
      todayVisits,
      yesterdayVisits,
      todayConversion,
      yesterdayConversion,
      trafficToday: {
        ads: todayBucket.ads,
        search: todayBucket.search,
        direct: todayBucket.direct,
        social: todayBucket.social
      },
      trafficYesterday: {
        ads: yesterdayBucket.ads,
        search: yesterdayBucket.search,
        direct: yesterdayBucket.direct,
        social: yesterdayBucket.social
      }
    });

    const response: SellerDashboardData = {
      dateRange,
      kpis,
      revenueSeries,
      orderStatus,
      topProducts,
      trafficSources,
      quickActions: [
        {
          id: 'add-product',
          title: 'Thêm sản phẩm',
          description: 'Tạo listing mới nhanh chóng',
          accent: 'orange'
        },
        {
          id: 'create-promo',
          title: 'Tạo khuyến mãi',
          description: 'Thiết lập ưu đãi theo chiến dịch',
          accent: 'purple'
        },
        {
          id: 'start-livestream',
          title: 'Bắt đầu livestream',
          description: 'Kích hoạt phiên live bán hàng',
          accent: 'blue'
        },
        {
          id: 'run-ads',
          title: 'Chạy quảng cáo',
          description: 'Đẩy traffic từ kênh ads',
          accent: 'green'
        },
        {
          id: 'process-orders',
          title: 'Xử lý đơn hàng',
          description: 'Vào hàng chờ để thao tác ngay',
          accent: 'slate'
        }
      ],
      alerts,
      insights,
      news: newsItems
    };

    return ok(response, 'backend');
  } catch (error) {
    // Keep a server-side trace for local debugging while returning standard envelope to client.
    // eslint-disable-next-line no-console
    console.error('[seller-dashboard] route failed', error);
    return toErrorResponse(error);
  }
}

function resolveDateRange(fromRaw: string | null, toRaw: string | null): { from: string; to: string } | null {
  const toDate = parseDateOrNow(toRaw);
  if (!toDate) {
    return null;
  }

  const fromDate = parseDateOrDefault(fromRaw, new Date(toDate.getTime() - 7 * 24 * 60 * 60 * 1000));

  if (!fromDate || fromDate >= toDate) {
    return null;
  }

  return {
    from: fromDate.toISOString(),
    to: toDate.toISOString()
  };
}

function parseDateOrNow(raw: string | null): Date | null {
  if (!raw || raw.trim().length === 0) {
    return new Date();
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateOrDefault(raw: string | null, fallback: Date): Date | null {
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildAnalyticsQuery(from: string, to: string, sellerId: string): string {
  const params = new URLSearchParams({
    from,
    to
  });

  if (sellerId) {
    params.set('sellerId', sellerId);
  }

  return `?${params.toString()}`;
}

function normalizeSellerId(raw: string | null): string {
  if (!raw) {
    return '';
  }

  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return '';
  }
}

async function fetchOrderCount(accessToken: string, status: string): Promise<number> {
  const data = await requestUpstream<OrderListOutput>(
    `${serviceBaseUrls.order}/orders?page=1&pageSize=1&status=${encodeURIComponent(status)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  return sanitizeNumber(data.pagination.totalItems);
}

async function fetchRecentOrders(accessToken: string): Promise<OrderRecord[]> {
  const data = await requestUpstream<OrderListOutput>(
    `${serviceBaseUrls.order}/orders?page=1&pageSize=100&sortBy=createdAt&sortOrder=DESC`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!Array.isArray(data.items)) {
    return [];
  }

  return data.items.map((order) => ({
    id: typeof order.id === 'string' ? order.id : '',
    status: typeof order.status === 'string' ? order.status : '',
    items: Array.isArray(order.items) ? order.items : []
  }));
}

async function fetchManagedProducts(accessToken: string): Promise<ManagedProduct[]> {
  const data = await requestUpstream<ProductListOutput>(
    `${serviceBaseUrls.product}/products/my?page=1&pageSize=100&sortBy=updatedAt&sortOrder=DESC`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!Array.isArray(data.items)) {
    return [];
  }

  return data.items.map((product) => ({
    id: typeof product.id === 'string' ? product.id : '',
    name: typeof product.name === 'string' ? product.name : '',
    images: Array.isArray(product.images) ? product.images : [],
    variants: Array.isArray(product.variants) ? product.variants : []
  }));
}

async function fetchLatestNotifications(accessToken: string): Promise<NotificationListOutput> {
  const candidates = buildNotificationBaseCandidates(serviceBaseUrls.notification);

  for (const baseUrl of candidates) {
    try {
      return await requestUpstream<NotificationListOutput>(
        `${baseUrl}/notifications?page=1&pageSize=8&sortBy=createdAt&sortOrder=DESC`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );
    } catch (error) {
      if (
        error instanceof UpstreamHttpError &&
        (error.status === 404 || error.status === 503 || error.status >= 500 || error.isNetworkError)
      ) {
        continue;
      }

      throw error;
    }
  }

  return {
    items: [],
    pagination: {
      page: 1,
      pageSize: 8,
      totalItems: 0,
      totalPages: 0
    }
  };
}

function buildNotificationBaseCandidates(baseUrl: string): string[] {
  const normalized = baseUrl.replace(/\/$/, '');
  const output = new Set<string>([normalized]);

  if (normalized.includes('localhost:3009')) {
    output.add(normalized.replace('localhost:3009', 'localhost:3011'));
  }

  if (normalized.includes('localhost:3011')) {
    output.add(normalized.replace('localhost:3011', 'localhost:3009'));
  }

  if (normalized.endsWith('/api/v1')) {
    output.add(normalized.slice(0, -'/api/v1'.length) + '/api');
  }

  if (normalized.endsWith('/api')) {
    output.add(normalized.slice(0, -'/api'.length) + '/api/v1');
  }

  return [...output];
}

async function fetchLowStockCount(products: ManagedProduct[]): Promise<number> {
  const skuSet = new Set<string>();

  for (const product of products) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const defaultVariant = variants.find((variant) => variant.isDefault) ?? variants[0];
    if (defaultVariant?.sku) {
      skuSet.add(defaultVariant.sku.trim().toUpperCase());
    }

    if (skuSet.size >= 24) {
      break;
    }
  }

  const skuList = [...skuSet];
  if (skuList.length === 0) {
    return 0;
  }

  const checks = await Promise.allSettled(
    skuList.map((sku) =>
      requestUpstream<InventoryValidateOutput>(
        `${serviceBaseUrls.inventory}/inventory/validate?sku=${encodeURIComponent(sku)}&quantity=5`,
        {
          method: 'GET'
        }
      )
    )
  );

  return checks.reduce((total, result) => {
    if (result.status !== 'fulfilled') {
      return total;
    }

    const available = sanitizeNumber(result.value.availableQuantity);
    return available <= 5 ? total + 1 : total;
  }, 0);
}

function aggregateDailyMetrics(items: AnalyticsTimeseriesOutput['items'] | undefined): DailyMetricBucket[] {
  const safeItems = Array.isArray(items) ? items : [];
  const byBucket = new Map<string, DailyMetricBucket>();

  for (const item of safeItems) {
    const bucket = typeof item.bucket === 'string' && item.bucket.trim().length > 0 ? item.bucket : '';
    if (!bucket) {
      continue;
    }

    const value = sanitizeNumber(item.totalEvents);
    const eventType = (item.eventType ?? '').toLowerCase();

    const current = byBucket.get(bucket) ?? createEmptyDailyBucket(bucket);

    current.totalEvents += value;

    if (includesAny(eventType, ['page.view', 'shop.view', 'product.view', 'session.started', 'visit'])) {
      current.visits += value;
    }

    if (includesAny(eventType, ['click', 'product.click', 'banner.click', 'ad.click'])) {
      current.clicks += value;
    }

    if (includesAny(eventType, ['order.created'])) {
      current.ordersCreated += value;
    }

    if (includesAny(eventType, ['order.cancelled', 'order.failed', 'payment.refunded', 'payment.failed'])) {
      current.cancelledEvents += value;
    }

    if (includesAny(eventType, ['ad.', 'campaign', 'banner', 'ads'])) {
      current.ads += value;
    }

    if (includesAny(eventType, ['search', 'keyword'])) {
      current.search += value;
    }

    if (includesAny(eventType, ['session.started', 'direct', 'shop.view'])) {
      current.direct += value;
    }

    if (includesAny(eventType, ['social', 'affiliate', 'kol', 'creator', 'live'])) {
      current.social += value;
    }

    byBucket.set(bucket, current);
  }

  return [...byBucket.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
}

function createEmptyDailyBucket(bucket: string): DailyMetricBucket {
  return {
    bucket,
    totalEvents: 0,
    visits: 0,
    clicks: 0,
    ordersCreated: 0,
    cancelledEvents: 0,
    ads: 0,
    search: 0,
    direct: 0,
    social: 0
  };
}

function deriveRevenueSeries(dailyBuckets: DailyMetricBucket[], totalRevenue: number): DashboardSeriesPoint[] {
  if (dailyBuckets.length === 0) {
    return [];
  }

  const totalEvents = dailyBuckets.reduce((sum, bucket) => sum + bucket.totalEvents, 0);

  if (totalEvents <= 0 || totalRevenue <= 0) {
    return dailyBuckets.map((bucket) => ({
      label: toDateLabel(bucket.bucket),
      value: 0
    }));
  }

  return dailyBuckets.map((bucket) => ({
    label: toDateLabel(bucket.bucket),
    value: (bucket.totalEvents / totalEvents) * totalRevenue
  }));
}

function buildKpis(input: {
  revenueSeries: DashboardSeriesPoint[];
  dailyBuckets: DailyMetricBucket[];
  todayRevenue: number;
  yesterdayRevenue: number;
  todayOrders: number;
  yesterdayOrders: number;
  todayConversion: number;
  yesterdayConversion: number;
  todayVisits: number;
  yesterdayVisits: number;
  todayReturns: number;
  yesterdayReturns: number;
  lowStockCount: number;
}): SellerDashboardKpi[] {
  const orderSpark = lastN(input.dailyBuckets.map((item) => item.ordersCreated), 7);
  const visitSpark = lastN(input.dailyBuckets.map((item) => item.visits), 7);
  const returnSpark = lastN(input.dailyBuckets.map((item) => item.cancelledEvents), 7);
  const conversionSpark = lastN(
    input.dailyBuckets.map((item) => (item.visits > 0 ? (item.ordersCreated / item.visits) * 100 : 0)),
    7
  );
  const revenueSpark = lastN(input.revenueSeries.map((item) => item.value), 7);

  return [
    toKpiCard('revenue', 'Doanh thu hôm nay', input.todayRevenue, 'currency', input.yesterdayRevenue, revenueSpark),
    toKpiCard('orders', 'Số đơn hàng', input.todayOrders, 'number', input.yesterdayOrders, orderSpark),
    toKpiCard(
      'conversion',
      'Tỷ lệ chuyển đổi',
      input.todayConversion,
      'percent',
      input.yesterdayConversion,
      conversionSpark
    ),
    toKpiCard('visits', 'Lượt truy cập', input.todayVisits, 'number', input.yesterdayVisits, visitSpark),
    toKpiCard('returns', 'Đơn hoàn / hủy', input.todayReturns, 'number', input.yesterdayReturns, returnSpark),
    toKpiCard(
      'low-stock',
      'Sản phẩm sắp hết hàng',
      input.lowStockCount,
      'number',
      Math.max(0, input.lowStockCount - 1),
      buildStableSpark(input.lowStockCount)
    )
  ];
}

function toKpiCard(
  id: string,
  label: string,
  value: number,
  metricType: SellerDashboardKpi['metricType'],
  previousValue: number,
  sparklineSource: number[]
): SellerDashboardKpi {
  const changePercent = toChangePercent(value, previousValue);

  return {
    id,
    label,
    value,
    metricType,
    changePercent,
    trend: toTrend(changePercent),
    sparkline: normalizeSparkline(sparklineSource)
  };
}

function toChangePercent(current: number, previous: number): number {
  if (previous === 0) {
    if (current === 0) {
      return 0;
    }

    return 100;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
}

function toTrend(changePercent: number): SellerDashboardKpi['trend'] {
  if (changePercent > 0.01) {
    return 'up';
  }

  if (changePercent < -0.01) {
    return 'down';
  }

  return 'flat';
}

function normalizeSparkline(values: number[]): number[] {
  if (values.length === 0) {
    return [0, 0, 0, 0, 0, 0, 0];
  }

  const output = [...values];
  while (output.length < 7) {
    output.unshift(output[0] ?? 0);
  }

  return output.slice(-7);
}

function buildStableSpark(value: number): number[] {
  return [
    Math.max(0, value - 2),
    Math.max(0, value - 1),
    value,
    Math.max(0, value - 1),
    value,
    Math.max(0, value - 1),
    value
  ];
}

function buildTopProducts(recentOrders: OrderRecord[], managedProducts: ManagedProduct[]): TopProductPerformance[] {
  const productMap = new Map<string, { name: string; sold: number; revenue: number }>();

  for (const order of recentOrders) {
    for (const item of order.items ?? []) {
      const key = item.productId || item.id;
      const current = productMap.get(key) ?? {
        name: item.productName || key,
        sold: 0,
        revenue: 0
      };

      current.sold += sanitizeNumber(item.quantity);
      current.revenue += sanitizeNumber(item.totalPrice);
      productMap.set(key, current);
    }
  }

  const imagesByProductId = new Map<string, string | null>();
  for (const product of managedProducts) {
    const productId = typeof product.id === 'string' ? product.id : '';
    if (!productId) {
      continue;
    }

    const firstImage = Array.isArray(product.images) ? (product.images[0] ?? null) : null;
    imagesByProductId.set(productId, firstImage);
  }

  let rows: TopProductPerformance[] = [...productMap.entries()]
    .map(([id, value]) => ({
      id,
      name: value.name,
      imageUrl: imagesByProductId.get(id) ?? null,
      revenue: value.revenue,
      sold: value.sold
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  if (rows.length === 0 && managedProducts.length > 0) {
    rows = managedProducts.slice(0, 6).map((product) => ({
      id: product.id,
      name: product.name,
      imageUrl: product.images?.[0] ?? null,
      revenue: 0,
      sold: 0
    }));
  }

  return rows;
}

function buildTrafficSources(dailyBuckets: DailyMetricBucket[]): TrafficSourceSlice[] {
  const totals = dailyBuckets.reduce(
    (acc, bucket) => ({
      ads: acc.ads + bucket.ads,
      search: acc.search + bucket.search,
      direct: acc.direct + bucket.direct,
      social: acc.social + bucket.social
    }),
    {
      ads: 0,
      search: 0,
      direct: 0,
      social: 0
    }
  );

  return [
    {
      id: 'ads',
      label: 'Quảng cáo',
      value: totals.ads,
      color: TRAFFIC_COLORS.ads
    },
    {
      id: 'search',
      label: 'Tìm kiếm',
      value: totals.search,
      color: TRAFFIC_COLORS.search
    },
    {
      id: 'direct',
      label: 'Trực tiếp',
      value: totals.direct,
      color: TRAFFIC_COLORS.direct
    },
    {
      id: 'social',
      label: 'Mạng xã hội',
      value: totals.social,
      color: TRAFFIC_COLORS.social
    }
  ];
}

function buildAlerts(input: {
  lowStockCount: number;
  todayReturns: number;
  todayOrders: number;
  news: SellerNewsItem[];
}): DashboardAlertItem[] {
  const alerts: DashboardAlertItem[] = [];

  if (input.lowStockCount > 0) {
    alerts.push({
      id: 'low-stock',
      level: 'warning',
      title: 'Cảnh báo tồn kho thấp',
      description: `${input.lowStockCount} sản phẩm có tồn kho dưới ngưỡng 5.`
    });
  }

  if (input.todayOrders > 0 && input.todayReturns / input.todayOrders >= 0.2) {
    alerts.push({
      id: 'return-rate',
      level: 'warning',
      title: 'Tỷ lệ hoàn/hủy đang cao',
      description: 'Đơn hoàn/hủy vượt 20% số đơn mới hôm nay, cần kiểm tra chất lượng vận hành.'
    });
  }

  if (input.news[0]) {
    alerts.push({
      id: `system-${input.news[0].id}`,
      level: 'info',
      title: input.news[0].title,
      description: input.news[0].content
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'all-good',
      level: 'success',
      title: 'Vận hành ổn định',
      description: 'Chưa phát hiện cảnh báo quan trọng trong phiên theo dõi hiện tại.'
    });
  }

  return alerts.slice(0, 4);
}

function buildInsights(input: {
  revenueToday: number;
  revenueYesterday: number;
  todayVisits: number;
  yesterdayVisits: number;
  todayConversion: number;
  yesterdayConversion: number;
  trafficToday: {
    ads: number;
    search: number;
    direct: number;
    social: number;
  };
  trafficYesterday: {
    ads: number;
    search: number;
    direct: number;
    social: number;
  };
}): string[] {
  const insights: string[] = [];

  const revenueChange = toChangePercent(input.revenueToday, input.revenueYesterday);
  const visitsChange = toChangePercent(input.todayVisits, input.yesterdayVisits);
  const adsChange = toChangePercent(input.trafficToday.ads, input.trafficYesterday.ads);

  if (revenueChange < 0 && adsChange < 0) {
    insights.push(`Doanh thu giảm ${Math.abs(revenueChange).toFixed(1)}% do traffic ads giảm ${Math.abs(adsChange).toFixed(1)}%.`);
  }

  if (input.todayConversion < input.yesterdayConversion && input.todayVisits >= input.yesterdayVisits) {
    insights.push('Traffic tăng nhưng tỷ lệ chuyển đổi giảm, cần tối ưu trang sản phẩm và ưu đãi chốt đơn.');
  }

  if (visitsChange > 0 && revenueChange > 0) {
    insights.push('Tăng trưởng đồng thời ở traffic và doanh thu, nên duy trì ngân sách cho kênh đang hiệu quả.');
  }

  if (insights.length === 0) {
    insights.push('Hiệu suất ổn định. Tiếp tục theo dõi biến động traffic theo từng nguồn để tối ưu ngân sách.');
  }

  return insights.slice(0, 4);
}

function sanitizeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function toNewsItems(items: NotificationItem[]): SellerNewsItem[] {
  return items.map((item) => ({
    id: item.id,
    title: item.subject?.trim() || item.eventType?.trim() || 'Thông báo hệ thống',
    content: item.content,
    category: item.category,
    eventType: item.eventType,
    status: item.status,
    createdAt: item.createdAt
  }));
}

function toDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit'
  }).format(date);
}

function includesAny(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern));
}

function lastN(values: number[], size: number): number[] {
  if (values.length >= size) {
    return values.slice(-size);
  }

  if (values.length === 0) {
    return new Array(size).fill(0);
  }

  const output = [...values];
  while (output.length < size) {
    output.unshift(output[0]);
  }

  return output;
}
