'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { SellerApiClientError } from '@/lib/api/client';
import { listSellerOrders } from '@/lib/api/orders';
import { listSellerProducts } from '@/lib/api/products';
import { fetchSellerRecommendationInsights } from '@/lib/api/recommendations';
import type {
  SellerOrder,
  SellerOrderStatus,
  SellerProduct,
  SellerProductStatus,
  SellerRecommendationInsights,
  SellerRecommendationRule
} from '@/lib/api/types';
import { useAuth } from '@/providers/AppProvider';

type Granularity = 'day' | 'month' | 'quarter' | 'year';
type RecommendationPriorityFilter = 'ALL' | 'VERY_HIGH' | 'HIGH' | 'TEST' | 'WATCH';

interface Bucket {
  key: string;
  label: string;
  start: Date;
  end: Date;
}

const ACTIVE_ORDER_STATUSES: SellerOrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
const PROFIT_RATIO = 0.22;

export default function SellerSalesAnalyticsPage() {
  const router = useRouter();
  const { ready, user, accessToken, logout } = useAuth();

  const [granularity, setGranularity] = useState<Granularity>('month');
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [recommendationInsights, setRecommendationInsights] = useState<SellerRecommendationInsights | null>(null);
  const [recommendationPriorityFilter, setRecommendationPriorityFilter] = useState<RecommendationPriorityFilter>('ALL');
  const [recommendationSearch, setRecommendationSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  const loadData = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [ordersResult, productsResult, recommendationsResult] = await Promise.allSettled([
        listSellerOrders(accessToken, {
          page: 1,
          pageSize: 100,
          sortBy: 'createdAt',
          sortOrder: 'DESC'
        }),
        listSellerProducts({
          accessToken,
          page: 1,
          pageSize: 100
        }),
        fetchSellerRecommendationInsights(accessToken, 10)
      ]);

      if (ordersResult.status === 'fulfilled') {
        setOrders(ordersResult.value.items);
      }

      if (productsResult.status === 'fulfilled') {
        setProducts(productsResult.value.items);
      }

      if (recommendationsResult.status === 'fulfilled') {
        setRecommendationInsights(recommendationsResult.value);
      } else {
        setRecommendationInsights(null);
      }

      if (ordersResult.status === 'rejected' && productsResult.status === 'rejected' && recommendationsResult.status === 'rejected') {
        throw ordersResult.reason;
      }

      if (ordersResult.status === 'rejected' || productsResult.status === 'rejected' || recommendationsResult.status === 'rejected') {
        const partialError =
          ordersResult.status === 'rejected'
            ? ordersResult.reason
            : productsResult.status === 'rejected'
              ? productsResult.reason
              : recommendationsResult.status === 'rejected'
                ? recommendationsResult.reason
                : new Error('Unknown partial error');
        if (partialError instanceof SellerApiClientError) {
          setError(`Một phần dữ liệu chưa tải được: ${partialError.message}`);
        } else {
          setError('Một phần dữ liệu chưa tải được.');
        }
      }
    } catch (loadError) {
      if (loadError instanceof SellerApiClientError) {
        setError(loadError.message);
      } else {
        setError('Không thể tải dữ liệu phân tích bán hàng.');
      }
      setOrders([]);
      setProducts([]);
      setRecommendationInsights(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!ready || !accessToken) {
      return;
    }

    void loadData();
  }, [ready, accessToken, loadData]);

  const buckets = useMemo(() => buildBuckets(granularity, new Date()), [granularity]);
  const firstBucket = buckets[0];
  const lastBucket = buckets[buckets.length - 1];

  const ordersInRange = useMemo(() => {
    if (!firstBucket || !lastBucket) {
      return [];
    }

    const from = firstBucket.start.getTime();
    const to = lastBucket.end.getTime();
    return orders.filter((order) => {
      const ts = new Date(order.createdAt).getTime();
      if (Number.isNaN(ts)) {
        return false;
      }

      return ts >= from && ts <= to;
    });
  }, [orders, firstBucket, lastBucket]);

  const revenueSeries = useMemo(() => {
    return buckets.map((bucket) => {
      const value = ordersInRange.reduce((sum, order) => {
        const ts = new Date(order.createdAt).getTime();
        if (Number.isNaN(ts) || ts < bucket.start.getTime() || ts > bucket.end.getTime()) {
          return sum;
        }

        if (!ACTIVE_ORDER_STATUSES.includes(order.status)) {
          return sum;
        }

        return sum + order.totalAmount;
      }, 0);

      return {
        label: bucket.label,
        value
      };
    });
  }, [buckets, ordersInRange]);

  const orderSeries = useMemo(() => {
    return buckets.map((bucket) => {
      const value = ordersInRange.reduce((sum, order) => {
        const ts = new Date(order.createdAt).getTime();
        if (Number.isNaN(ts) || ts < bucket.start.getTime() || ts > bucket.end.getTime()) {
          return sum;
        }

        return sum + 1;
      }, 0);

      return {
        label: bucket.label,
        value
      };
    });
  }, [buckets, ordersInRange]);

  const revenueTotal = useMemo(() => revenueSeries.reduce((sum, point) => sum + point.value, 0), [revenueSeries]);
  const estimatedProfit = revenueTotal * PROFIT_RATIO;
  const orderTotal = ordersInRange.length;

  const productsOnChannel = useMemo(
    () => products.filter((item) => item.status === 'ACTIVE' || item.status === 'HIDDEN').length,
    [products]
  );

  const productStatusDistribution = useMemo(
    () => countByProductStatus(products),
    [products]
  );

  const orderStatusDistribution = useMemo(
    () => countByOrderStatus(ordersInRange),
    [ordersInRange]
  );

  const profitSeries = useMemo(
    () => revenueSeries.map((point) => ({ ...point, value: point.value * PROFIT_RATIO })),
    [revenueSeries]
  );

  const productNameById = useMemo(() => {
    const names = new Map(products.map((product) => [product.id, product.name]));
    Object.entries(recommendationInsights?.productNames ?? {}).forEach(([productId, name]) => {
      if (name.trim()) {
        names.set(productId, name);
      }
    });
    return names;
  }, [products, recommendationInsights?.productNames]);

  const filteredRecommendationItems = useMemo(() => {
    const items = recommendationInsights?.items ?? [];
    const keyword = recommendationSearch.trim().toLowerCase();

    return items.filter((rule) => {
      if (recommendationPriorityFilter !== 'ALL' && recommendationPriorityLevel(rule) !== recommendationPriorityFilter) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const searchable = [
        ...rule.antecedentProductIds.map((id) => productNameById.get(id) ?? id),
        productNameById.get(rule.consequentProductId) ?? rule.consequentProductId
      ]
        .join(' ')
        .toLowerCase();

      return searchable.includes(keyword);
    });
  }, [productNameById, recommendationInsights?.items, recommendationPriorityFilter, recommendationSearch]);

  if (!ready) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-slate-600">Đang kiểm tra phiên đăng nhập...</main>;
  }

  if (!user || !accessToken) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-orange-500">eMall Seller</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Bạn chưa đăng nhập</h1>
          <p className="mt-2 text-sm text-slate-600">Đăng nhập để truy cập Seller Center.</p>
          <Link href="/login" className="mt-5 inline-flex rounded-md bg-[#ee4d2d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#db4729]">
            Đi đến trang đăng nhập
          </Link>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900">
      <SellerTopbar email={user.email} role={user.role} onLogout={handleLogout} />

      <div className="flex">
        <SellerSidebar />

        <main className="min-w-0 flex-1 px-3 py-3 lg:px-4">
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
            <Link href="/" className="hover:text-[#ee4d2d]">
              Trang chủ
            </Link>
            <span>›</span>
            <span className="font-medium text-slate-700">Phân Tích Bán Hàng</span>
          </div>

          <section className="rounded-lg border border-[#f3d7d0] bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-slate-900">Dashboard Doanh Thu & Lợi Nhuận</h1>
                <p className="mt-1 text-sm text-slate-500">So sánh theo ngày, tháng, quý, năm. Giao diện tối giản để theo dõi nhanh.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {([
                  { id: 'day', label: 'Ngày' },
                  { id: 'month', label: 'Tháng' },
                  { id: 'quarter', label: 'Quý' },
                  { id: 'year', label: 'Năm' }
                ] as const).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setGranularity(item.id)}
                    className={[
                      'rounded-md border px-3 py-1.5 text-sm font-semibold transition',
                      granularity === item.id
                        ? 'border-[#ee4d2d] bg-[#fff4f1] text-[#ee4d2d]'
                        : 'border-slate-200 text-slate-600 hover:border-[#f0b3a5]'
                    ].join(' ')}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {error ? <p className="mt-3 rounded-md border border-[#f4c6bb] bg-[#fff6f4] px-3 py-2 text-sm text-[#b45339]">{error}</p> : null}

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Doanh thu" value={formatCurrency(revenueTotal)} subLabel={`Kỳ ${labelForGranularity(granularity)}`} />
              <KpiCard label="Lợi nhuận ước tính" value={formatCurrency(estimatedProfit)} subLabel="Biên lợi nhuận 22%" />
              <KpiCard label="Số sản phẩm trên kênh" value={formatNumber(productsOnChannel)} subLabel="ACTIVE + HIDDEN" />
              <KpiCard label="Số đơn hàng" value={formatNumber(orderTotal)} subLabel={`Từ ${formatDate(firstBucket?.start)} đến ${formatDate(lastBucket?.end)}`} />
            </div>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-2">
            <ChartCard title="Doanh Thu vs Lợi Nhuận Theo Kỳ" subtitle="Biểu đồ đường theo bộ lọc">
              <LineChart primary={revenueSeries} secondary={profitSeries} />
            </ChartCard>

            <ChartCard title="Số Đơn Theo Kỳ" subtitle="Biểu đồ cột">
              <BarChart data={orderSeries} />
            </ChartCard>

            <ChartCard title="Phân Bổ Trạng Thái Đơn Hàng" subtitle="Tổng đơn trong kỳ đã chọn">
              <HorizontalStatusBars data={orderStatusDistribution} />
            </ChartCard>

            <ChartCard title="Cơ Cấu Sản Phẩm Trên Kênh" subtitle="Tỷ trọng theo trạng thái sản phẩm">
              <DonutChart data={productStatusDistribution} />
            </ChartCard>
          </section>

          <section className="mt-4 rounded-lg border border-[#f3d7d0] bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Sản phẩm thường được mua cùng</h2>
                <p className="mt-1 text-sm text-slate-500">Gợi ý bán kèm dựa trên các đơn đã hoàn tất trong 90 ngày gần đây.</p>
              </div>
              <p className="text-xs text-slate-500">
                {recommendationInsights?.latestTrainingRun
                  ? formatDataRefreshStatus(recommendationInsights.latestTrainingRun.status, recommendationInsights.latestTrainingRun.finishedAt ?? recommendationInsights.latestTrainingRun.startedAt)
                  : 'Chưa có dữ liệu gợi ý'}
              </p>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr]">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">Mức gợi ý</span>
                <select
                  value={recommendationPriorityFilter}
                  onChange={(event) => setRecommendationPriorityFilter(event.target.value as RecommendationPriorityFilter)}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#ee4d2d]"
                >
                  <option value="ALL">Tất cả</option>
                  <option value="VERY_HIGH">Rất nên gợi ý</option>
                  <option value="HIGH">Nên gợi ý</option>
                  <option value="TEST">Có thể thử</option>
                  <option value="WATCH">Theo dõi thêm</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-600">Tìm sản phẩm</span>
                <input
                  value={recommendationSearch}
                  onChange={(event) => setRecommendationSearch(event.target.value)}
                  placeholder="Nhập tên sản phẩm cần xem"
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#ee4d2d]"
                />
              </label>
            </div>

            <div className="mt-4 overflow-x-auto">
              {recommendationInsights && recommendationInsights.items.length > 0 ? (
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                      <th className="py-2 pr-4 font-semibold">Khi mua</th>
                      <th className="py-2 pr-4 font-semibold">Nên gợi ý</th>
                      <th className="py-2 pr-4 font-semibold">Tỷ lệ mua thêm</th>
                      <th className="py-2 pr-4 font-semibold">Ưu tiên hiển thị</th>
                      <th className="py-2 pr-4 font-semibold">Số đơn cùng mua</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecommendationItems.map((rule) => (
                      <tr key={rule.ruleId} className="border-b border-slate-100">
                        <td className="py-3 pr-4 font-medium text-slate-800">
                          {rule.antecedentProductIds.map((id) => productNameById.get(id) ?? shortId(id)).join(' + ')}
                        </td>
                        <td className="py-3 pr-4 text-slate-700">{productNameById.get(rule.consequentProductId) ?? shortId(rule.consequentProductId)}</td>
                        <td className="py-3 pr-4 text-slate-700">{formatPercent(rule.confidence)}</td>
                        <td className="py-3 pr-4 text-slate-700">{recommendationPriority(rule)}</td>
                        <td className="py-3 pr-4 text-slate-700">
                          {rule.supportCount}/{rule.transactionCount} đơn
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  Chưa có dữ liệu gợi ý bán kèm. Dữ liệu sẽ xuất hiện sau khi có đủ đơn đã hoàn tất.
                </p>
              )}
              {recommendationInsights && recommendationInsights.items.length > 0 && filteredRecommendationItems.length === 0 ? (
                <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  Không có gợi ý nào khớp với bộ lọc hiện tại.
                </p>
              ) : null}
            </div>
          </section>

          <p className="mt-3 text-xs text-slate-400">{loading ? 'Đang cập nhật dữ liệu...' : `Cập nhật lúc ${new Date().toLocaleString('vi-VN')}`}</p>
        </main>
      </div>
    </div>
  );
}

function KpiCard({ label, value, subLabel }: { label: string; value: string; subLabel: string }) {
  return (
    <article className="rounded-md border border-[#f4d8d1] bg-white p-3">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#ee4d2d]">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{subLabel}</p>
    </article>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <article className="rounded-lg border border-[#f3d7d0] bg-white p-4">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </article>
  );
}

function LineChart({
  primary,
  secondary
}: {
  primary: Array<{ label: string; value: number }>;
  secondary: Array<{ label: string; value: number }>;
}) {
  const width = 760;
  const height = 220;
  const padding = 28;
  const maxValue = Math.max(1, ...primary.map((item) => item.value), ...secondary.map((item) => item.value));

  const pointsA = primary.map((item, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(1, primary.length - 1);
    const y = height - padding - (item.value / maxValue) * (height - padding * 2);
    return `${x},${y}`;
  });

  const pointsB = secondary.map((item, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(1, secondary.length - 1);
    const y = height - padding - (item.value / maxValue) * (height - padding * 2);
    return `${x},${y}`;
  });

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] w-full">
        <rect x="0" y="0" width={width} height={height} fill="#fff" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#e2e8f0" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#e2e8f0" />
        <polyline fill="none" stroke="#ee4d2d" strokeWidth="3" points={pointsA.join(' ')} />
        <polyline fill="none" stroke="#fb923c" strokeWidth="3" strokeDasharray="6 5" points={pointsB.join(' ')} />
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-4 rounded-full bg-[#ee4d2d]" /> Doanh thu
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-4 rounded-full bg-[#fb923c]" /> Lợi nhuận ước tính
        </span>
      </div>
    </div>
  );
}

function BarChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const maxValue = Math.max(1, ...data.map((item) => item.value));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {data.map((item) => (
          <div key={item.label} className="rounded-md border border-slate-100 p-2">
            <p className="truncate text-xs text-slate-500">{item.label}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[#ee4d2d]" style={{ width: `${(item.value / maxValue) * 100}%` }} />
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-700">{formatNumber(item.value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function HorizontalStatusBars({ data }: { data: Array<{ label: string; value: number }> }) {
  const maxValue = Math.max(1, ...data.map((item) => item.value));

  return (
    <div className="space-y-2">
      {data.map((item, index) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-slate-600">{item.label}</span>
            <span className="font-semibold text-slate-800">{formatNumber(item.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={index % 2 === 0 ? 'h-full rounded-full bg-[#ee4d2d]' : 'h-full rounded-full bg-[#fb923c]'}
              style={{ width: `${(item.value / maxValue) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const safeTotal = total <= 0 ? 1 : total;
  const colors = ['#ee4d2d', '#fb923c', '#fdba74', '#fed7aa'];

  let accumulated = 0;
  const segments = data.map((item, index) => {
    const start = (accumulated / safeTotal) * 360;
    accumulated += item.value;
    const end = (accumulated / safeTotal) * 360;
    return `${colors[index % colors.length]} ${start}deg ${end}deg`;
  });

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div
        className="relative h-40 w-40 rounded-full"
        style={{
          background: `conic-gradient(${segments.join(', ') || '#f1f5f9 0deg 360deg'})`
        }}
      >
        <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
      </div>

      <div className="min-w-[180px] space-y-2">
        {data.map((item, index) => (
          <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2 text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
              {item.label}
            </span>
            <span className="font-semibold text-slate-800">
              {item.value} ({((item.value / safeTotal) * 100).toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildBuckets(granularity: Granularity, now: Date): Bucket[] {
  if (granularity === 'day') {
    return buildDailyBuckets(now, 14);
  }

  if (granularity === 'month') {
    return buildMonthlyBuckets(now, 12);
  }

  if (granularity === 'quarter') {
    return buildQuarterlyBuckets(now, 8);
  }

  return buildYearlyBuckets(now, 5);
}

function buildDailyBuckets(now: Date, size: number): Bucket[] {
  const buckets: Bucket[] = [];

  for (let i = size - 1; i >= 0; i -= 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);

    buckets.push({
      key: day.toISOString(),
      label: `${String(day.getDate()).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}`,
      start: day,
      end
    });
  }

  return buckets;
}

function buildMonthlyBuckets(now: Date, size: number): Bucket[] {
  const buckets: Bucket[] = [];

  for (let i = size - 1; i >= 0; i -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);

    buckets.push({
      key: start.toISOString(),
      label: `T${start.getMonth() + 1}/${String(start.getFullYear()).slice(-2)}`,
      start,
      end
    });
  }

  return buckets;
}

function buildQuarterlyBuckets(now: Date, size: number): Bucket[] {
  const currentQuarter = Math.floor(now.getMonth() / 3);
  const buckets: Bucket[] = [];

  for (let i = size - 1; i >= 0; i -= 1) {
    const quarterOffset = currentQuarter - i;
    const yearShift = Math.floor(quarterOffset / 4);
    const quarterIndex = ((quarterOffset % 4) + 4) % 4;
    const year = now.getFullYear() + yearShift;
    const startMonth = quarterIndex * 3;

    const start = new Date(year, startMonth, 1, 0, 0, 0, 0);
    const end = new Date(year, startMonth + 3, 0, 23, 59, 59, 999);

    buckets.push({
      key: start.toISOString(),
      label: `Q${quarterIndex + 1}/${String(year).slice(-2)}`,
      start,
      end
    });
  }

  return buckets;
}

function buildYearlyBuckets(now: Date, size: number): Bucket[] {
  const buckets: Bucket[] = [];

  for (let i = size - 1; i >= 0; i -= 1) {
    const year = now.getFullYear() - i;
    const start = new Date(year, 0, 1, 0, 0, 0, 0);
    const end = new Date(year, 11, 31, 23, 59, 59, 999);

    buckets.push({
      key: start.toISOString(),
      label: String(year),
      start,
      end
    });
  }

  return buckets;
}

function countByOrderStatus(orders: SellerOrder[]): Array<{ label: string; value: number }> {
  const counter: Record<SellerOrderStatus, number> = {
    PENDING: 0,
    CONFIRMED: 0,
    PROCESSING: 0,
    SHIPPED: 0,
    DELIVERED: 0,
    CANCELLED: 0,
    FAILED: 0
  };

  for (const order of orders) {
    counter[order.status] += 1;
  }

  return [
    { label: 'Chờ xác nhận', value: counter.PENDING },
    { label: 'Đã xác nhận', value: counter.CONFIRMED },
    { label: 'Đang xử lý', value: counter.PROCESSING },
    { label: 'Đang giao', value: counter.SHIPPED },
    { label: 'Hoàn tất', value: counter.DELIVERED },
    { label: 'Đã hủy', value: counter.CANCELLED + counter.FAILED }
  ];
}

function countByProductStatus(products: SellerProduct[]): Array<{ label: string; value: number }> {
  const counter: Record<SellerProductStatus, number> = {
    DRAFT: 0,
    ACTIVE: 0,
    HIDDEN: 0,
    ARCHIVED: 0
  };

  for (const product of products) {
    counter[product.status] += 1;
  }

  return [
    { label: 'Đang bán', value: counter.ACTIVE },
    { label: 'Tạm ẩn', value: counter.HIDDEN },
    { label: 'Nháp', value: counter.DRAFT },
    { label: 'Lưu trữ', value: counter.ARCHIVED }
  ];
}

function labelForGranularity(granularity: Granularity): string {
  if (granularity === 'day') {
    return 'ngày';
  }

  if (granularity === 'month') {
    return 'tháng';
  }

  if (granularity === 'quarter') {
    return 'quý';
  }

  return 'năm';
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDataRefreshStatus(status: string, value?: string | null): string {
  const normalized = status.trim().toUpperCase();
  const label =
    normalized === 'SUCCEEDED'
      ? 'Dữ liệu đã cập nhật'
      : normalized === 'RUNNING'
        ? 'Đang cập nhật dữ liệu'
        : normalized === 'FAILED'
          ? 'Cập nhật dữ liệu lỗi'
          : 'Trạng thái dữ liệu';

  return `${label} - ${formatDateTime(value)}`;
}

function recommendationPriority(rule: SellerRecommendationRule): string {
  switch (recommendationPriorityLevel(rule)) {
    case 'VERY_HIGH':
      return 'Rất nên gợi ý';
    case 'HIGH':
      return 'Nên gợi ý';
    case 'TEST':
      return 'Có thể thử';
    default:
      return 'Theo dõi thêm';
  }
}

function recommendationPriorityLevel(rule: SellerRecommendationRule): Exclude<RecommendationPriorityFilter, 'ALL'> {
  if (rule.confidence >= 0.8 && rule.supportCount >= 4) {
    return 'VERY_HIGH';
  }
  if (rule.confidence >= 0.5 && rule.supportCount >= 3) {
    return 'HIGH';
  }
  if (rule.confidence >= 0.25) {
    return 'TEST';
  }
  return 'WATCH';
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '--';
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return '--';
  }
  return date.toLocaleString('vi-VN');
}

function shortId(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= 12) {
    return normalized;
  }
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function formatDate(value?: Date): string {
  if (!value) {
    return '--';
  }

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(value);
}
