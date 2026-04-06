import type { SellerDashboardData, SellerNewsItem } from '@/lib/api/types';
import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { toErrorResponse } from '@/lib/server/route-error';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

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

interface AnalyticsPaymentsSummaryOutput {
  items: Array<{
    eventType: string;
    status: string | null;
    totalEvents: number;
    totalAmount: number;
    totalRefundedAmount: number;
  }>;
}

interface AnalyticsShippingSummaryOutput {
  items: Array<{
    eventType: string;
    status: string | null;
    totalEvents: number;
  }>;
}

interface PaginationOutput {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

interface OrderListOutput {
  pagination: PaginationOutput;
}

interface ProductListOutput {
  pagination: PaginationOutput;
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

  const analyticsQuery = buildAnalyticsQuery(dateRange.from, dateRange.to, sellerId);
  const shouldFetchManagedProducts = claims.role !== 'SUPPORT';
  const authHeaders = {
    Authorization: `Bearer ${accessToken}`
  };

  try {
    const [
      overview,
      timeseries,
      paymentsSummary,
      shippingSummary,
      campaignNotifications,
      latestNotifications,
      pendingCount,
      confirmedCount,
      processingCount,
      shippedCount,
      deliveredCount,
      cancelledCount,
      failedCount,
      hiddenProductsCount
    ] = await Promise.all([
      requestUpstream<AnalyticsOverviewOutput>(`${serviceBaseUrls.analytics}/analytics/overview${analyticsQuery}`, {
        method: 'GET',
        headers: authHeaders
      }),
      requestUpstream<AnalyticsTimeseriesOutput>(`${serviceBaseUrls.analytics}/analytics/events/timeseries${analyticsQuery}&interval=day`, {
        method: 'GET',
        headers: authHeaders
      }),
      requestUpstream<AnalyticsPaymentsSummaryOutput>(`${serviceBaseUrls.analytics}/analytics/payments/summary${analyticsQuery}`, {
        method: 'GET',
        headers: authHeaders
      }),
      requestUpstream<AnalyticsShippingSummaryOutput>(`${serviceBaseUrls.analytics}/analytics/shipping/summary${analyticsQuery}`, {
        method: 'GET',
        headers: authHeaders
      }),
      requestUpstream<NotificationListOutput>(
        `${serviceBaseUrls.notification}/notifications?page=1&pageSize=5&category=CAMPAIGN&sortBy=createdAt&sortOrder=DESC`,
        {
          method: 'GET',
          headers: authHeaders
        }
      ),
      requestUpstream<NotificationListOutput>(
        `${serviceBaseUrls.notification}/notifications?page=1&pageSize=5&sortBy=createdAt&sortOrder=DESC`,
        {
          method: 'GET',
          headers: authHeaders
        }
      ),
      fetchOrderCount(accessToken, ORDER_STATUS.pending),
      fetchOrderCount(accessToken, ORDER_STATUS.confirmed),
      fetchOrderCount(accessToken, ORDER_STATUS.processing),
      fetchOrderCount(accessToken, ORDER_STATUS.shipped),
      fetchOrderCount(accessToken, ORDER_STATUS.delivered),
      fetchOrderCount(accessToken, ORDER_STATUS.cancelled),
      fetchOrderCount(accessToken, ORDER_STATUS.failed),
      shouldFetchManagedProducts ? fetchHiddenProductsCount(accessToken) : Promise.resolve(0)
    ]);

    const waitingForPickup = pendingCount + confirmedCount;
    const processedOrders = processingCount + shippedCount + deliveredCount;
    const returnOrCancelledOrders = cancelledCount + failedCount;

    const visits = sumEventsByMatchers(timeseries.items, ['page.view', 'shop.view', 'product.view', 'session.started']);
    const clicks = sumEventsByMatchers(timeseries.items, ['product.click', 'banner.click', 'ad.click']);
    const orders = sanitizeNumber(overview.uniqueOrders);
    const conversionRate = visits > 0 ? (orders / visits) * 100 : 0;

    // TODO(backend): no dedicated seller endpoints for display service / KOL / livestream modules yet.
    // Current implementation derives these modules from analytics eventType patterns and notifications.
    const displayEvents = sumEventsByMatchers(timeseries.items, ['display', 'impression', 'banner']);
    const displayClicks = sumEventsByMatchers(timeseries.items, ['banner.click', 'ad.click']);
    const displayCtr = displayEvents > 0 ? (displayClicks / displayEvents) * 100 : 0;

    const affiliateEvents = sumEventsByMatchers(timeseries.items, ['affiliate', 'kol', 'creator']);
    const affiliateRevenue = sumPaymentsByMatchers(paymentsSummary.items, ['affiliate', 'kol', 'creator']);

    const livestreamEvents = sumEventsByMatchers(timeseries.items, ['live', 'livestream', 'stream']);
    const shippingEvents = shippingSummary.items.reduce((acc, item) => acc + sanitizeNumber(item.totalEvents), 0);

    const newsItems = toNewsItems(latestNotifications.items);

    const response: SellerDashboardData = {
      dateRange: {
        from: dateRange.from,
        to: dateRange.to
      },
      kpis: {
        waitingForPickup,
        processedOrders,
        returnOrCancelledOrders,
        lockedProducts: hiddenProductsCount
      },
      salesAnalysis: {
        revenue: sanitizeNumber(overview.capturedAmount),
        visits,
        clicks,
        orders,
        conversionRate
      },
      performance: {
        uniquePayments: sanitizeNumber(overview.uniquePayments),
        uniqueShipments: sanitizeNumber(overview.uniqueShipments),
        refundedAmount: sanitizeNumber(overview.refundedAmount)
      },
      displayService: {
        title: 'Dich vu hien thi',
        subtitle: 'Tong hop tu analytics events theo nhom display/impression',
        primaryValue: displayEvents,
        secondaryValue: displayCtr,
        unit: '%'
      },
      kolAffiliate: {
        title: 'KOL / Affiliate',
        subtitle: 'Tong hop event lien quan affiliate/creator trong khoang thoi gian chon',
        primaryValue: affiliateEvents,
        secondaryValue: affiliateRevenue,
        unit: 'VND'
      },
      livestream: {
        title: 'Livestream',
        subtitle: 'Theo doi event livestream va van chuyen lien quan den xu ly don',
        primaryValue: livestreamEvents,
        secondaryValue: shippingEvents
      },
      campaign: {
        totalCampaigns: campaignNotifications.pagination.totalItems,
        recent: toNewsItems(campaignNotifications.items)
      },
      suggestions: buildSuggestions({
        waitingForPickup,
        conversionRate,
        lockedProducts: hiddenProductsCount,
        cancelledOrFailed: returnOrCancelledOrders,
        visits,
        clicks
      }),
      news: newsItems
    };

    return ok(response, 'backend');
  } catch (error) {
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

async function fetchHiddenProductsCount(accessToken: string): Promise<number> {
  const data = await requestUpstream<ProductListOutput>(
    `${serviceBaseUrls.product}/products/my?page=1&pageSize=1&status=HIDDEN&sortBy=updatedAt&sortOrder=DESC`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  return sanitizeNumber(data.pagination.totalItems);
}

function sumEventsByMatchers(items: AnalyticsTimeseriesOutput['items'], matchers: string[]): number {
  if (items.length === 0) {
    return 0;
  }

  return items.reduce((acc, item) => {
    const type = item.eventType.trim().toLowerCase();
    const matched = matchers.some((matcher) => type.includes(matcher));

    return matched ? acc + sanitizeNumber(item.totalEvents) : acc;
  }, 0);
}

function sumPaymentsByMatchers(items: AnalyticsPaymentsSummaryOutput['items'], matchers: string[]): number {
  if (items.length === 0) {
    return 0;
  }

  return items.reduce((acc, item) => {
    const type = item.eventType.trim().toLowerCase();
    const matched = matchers.some((matcher) => type.includes(matcher));

    return matched ? acc + sanitizeNumber(item.totalAmount) : acc;
  }, 0);
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
    title: item.subject?.trim() || item.eventType?.trim() || 'Notification update',
    content: item.content,
    category: item.category,
    eventType: item.eventType,
    status: item.status,
    createdAt: item.createdAt
  }));
}

function buildSuggestions(input: {
  waitingForPickup: number;
  conversionRate: number;
  lockedProducts: number;
  cancelledOrFailed: number;
  visits: number;
  clicks: number;
}): string[] {
  const suggestions: string[] = [];

  if (input.waitingForPickup > 0) {
    suggestions.push(`Ban co ${input.waitingForPickup} don dang cho xu ly. Uu tien xac nhan de tranh giao cham.`);
  }

  if (input.lockedProducts > 0) {
    suggestions.push(`Co ${input.lockedProducts} san pham dang o trang thai HIDDEN. Kiem tra lai vi pham/noi dung listing.`);
  }

  if (input.cancelledOrFailed > 0) {
    suggestions.push(`Tong don huy/that bai la ${input.cancelledOrFailed}. Nen doi soat ton kho va lead time giao hang.`);
  }

  if (input.visits > 0 && input.conversionRate < 1) {
    suggestions.push(
      `Ty le chuyen doi hien tai ${input.conversionRate.toFixed(2)}%. Co the toi uu anh san pham va gia de tang chot don.`
    );
  }

  if (input.clicks === 0) {
    suggestions.push('Luot click dang thap. Nen tao them campaign/banner de cai thien traffic chat luong.');
  }

  if (suggestions.length === 0) {
    suggestions.push('Hieu suat dang on dinh. Tiep tuc theo doi bien dong don hang va campaign theo ngay.');
  }

  return suggestions.slice(0, 4);
}
