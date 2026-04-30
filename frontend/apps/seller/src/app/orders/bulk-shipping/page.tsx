'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { SellerApiClientError } from '@/lib/api/client';
import { listSellerOrders } from '@/lib/api/orders';
import { listSellerShipments } from '@/lib/api/shipping';
import type { SellerOrder, SellerOrderStatus, SellerShipment, SellerShipmentStatus } from '@/lib/api/types';
import { formatCustomerCode, formatOrderCode } from '@/lib/order-codes';
import { useAuth } from '@/providers/AppProvider';

const WAITING_SHIPMENT_STATUSES: SellerShipmentStatus[] = ['PENDING', 'AWB_CREATED', 'PICKED_UP'];
const WAITING_ORDER_STATUSES: SellerOrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING'];

type DueFilter = 'all' | 'critical' | 'soon' | 'stable';
type SortMode = 'oldest' | 'newest';

export default function BulkShippingPage() {
  const router = useRouter();
  const { ready, user, accessToken, logout } = useAuth();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [waitingShipments, setWaitingShipments] = useState<SellerShipment[]>([]);
  const [ordersById, setOrdersById] = useState<Record<string, SellerOrder>>({});

  const [activeDueFilter, setActiveDueFilter] = useState<DueFilter>('all');
  const [activeProvider, setActiveProvider] = useState('all');
  const [sortMode, setSortMode] = useState<SortMode>('oldest');

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  useEffect(() => {
    if (!ready || !accessToken) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError('');

      try {
        const [shipmentResult, orderResult] = await Promise.allSettled([
          listSellerShipments(accessToken, {
            page: 1,
            pageSize: 100,
            sortBy: 'createdAt',
            sortOrder: 'DESC'
          }),
          listSellerOrders(accessToken, {
            page: 1,
            pageSize: 100,
            sortBy: 'createdAt',
            sortOrder: 'DESC'
          })
        ]);

        if (cancelled) {
          return;
        }

        const orderItems = orderResult.status === 'fulfilled' ? orderResult.value.items : [];
        const shipmentItems = shipmentResult.status === 'fulfilled' ? shipmentResult.value.items : [];

        const waitingShipments = shipmentItems.filter((item) => WAITING_SHIPMENT_STATUSES.includes(item.status));
        const nextOrderMap = Object.fromEntries(orderItems.map((item) => [item.id, item]));
        const shipmentOrderIds = new Set(shipmentItems.map((item) => item.orderId));
        const virtualShipments = orderItems
          .filter((item) => WAITING_ORDER_STATUSES.includes(item.status) && !shipmentOrderIds.has(item.id))
          .map((item) => toVirtualShipment(item));

        setWaitingShipments([...waitingShipments, ...virtualShipments]);
        setOrdersById(nextOrderMap);

        if (orderResult.status === 'rejected' && shipmentResult.status === 'rejected') {
          throw orderResult.reason;
        }

        if (orderResult.status === 'rejected' || shipmentResult.status === 'rejected') {
          const partialError = orderResult.status === 'rejected' ? orderResult.reason : shipmentResult.reason;
          if (partialError instanceof SellerApiClientError) {
            setError(`Một phần dữ liệu chưa tải được: ${partialError.message}`);
          } else {
            setError('Một phần dữ liệu chưa tải được từ API.');
          }
        }
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        if (loadError instanceof SellerApiClientError) {
          setError(loadError.message);
        } else {
          setError('Không tải được dữ liệu giao hàng.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [accessToken, ready]);

  const providerCounts = useMemo(() => {
    const counter = new Map<string, number>();

    for (const shipment of waitingShipments) {
      const provider = normalizeLabel(shipment.provider || 'Khác');
      counter.set(provider, (counter.get(provider) ?? 0) + 1);
    }

    return Array.from(counter.entries()).sort((a, b) => b[1] - a[1]);
  }, [waitingShipments]);

  const providerOptions = useMemo(() => {
    return [{ id: 'all', label: `Tất cả (${waitingShipments.length})` }].concat(
      providerCounts.map(([provider, count]) => ({
        id: provider,
        label: `${provider} (${count})`
      }))
    );
  }, [providerCounts, waitingShipments.length]);

  const filteredShipments = useMemo(() => {
    const byProvider = waitingShipments.filter((shipment) => {
      if (activeProvider === 'all') {
        return true;
      }

      return normalizeLabel(shipment.provider || 'Khác') === activeProvider;
    });

    const byDue = byProvider.filter((shipment) => {
      const agingHours = getAgingHours(shipment.updatedAt);

      if (activeDueFilter === 'critical') {
        return agingHours >= 24;
      }

      if (activeDueFilter === 'soon') {
        return agingHours >= 12 && agingHours < 24;
      }

      if (activeDueFilter === 'stable') {
        return agingHours < 12;
      }

      return true;
    });

    const sorted = [...byDue].sort((a, b) => {
      const left = new Date(a.updatedAt).getTime();
      const right = new Date(b.updatedAt).getTime();

      if (sortMode === 'oldest') {
        return left - right;
      }

      return right - left;
    });

    return sorted;
  }, [activeDueFilter, activeProvider, sortMode, waitingShipments]);

  const dueSummary = useMemo(() => {
    let critical = 0;
    let soon = 0;
    let stable = 0;

    for (const shipment of waitingShipments) {
      const agingHours = getAgingHours(shipment.updatedAt);

      if (agingHours >= 24) {
        critical += 1;
      } else if (agingHours >= 12) {
        soon += 1;
      } else {
        stable += 1;
      }
    }

    return {
      critical,
      soon,
      stable
    };
  }, [waitingShipments]);

  const statusSummary = useMemo(() => {
    return {
      pending: waitingShipments.filter((item) => item.status === 'PENDING').length,
      awbCreated: waitingShipments.filter((item) => item.status === 'AWB_CREATED').length,
      pickedUp: waitingShipments.filter((item) => item.status === 'PICKED_UP').length
    };
  }, [waitingShipments]);

  if (!ready) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-slate-600">Đang kiểm tra phiên đăng nhập...</main>;
  }

  if (!user || !accessToken) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">eMall Seller</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Bạn chưa đăng nhập</h1>
          <p className="mt-2 text-sm text-slate-600">Đăng nhập để truy cập Seller Center.</p>
          <Link href="/login" className="mt-5 inline-flex rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700">
            Đi đến trang đăng nhập
          </Link>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen text-slate-900">
      <SellerTopbar email={user.email} role={user.role} onLogout={handleLogout} />

      <div className="flex">
        <SellerSidebar />

        <main className="min-w-0 flex-1 px-3 py-3 lg:px-4">
          <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
            <Link href="/" className="hover:text-slate-700">
              Trang chủ
            </Link>
            <span>›</span>
            <span className="font-medium text-slate-700">Giao Hàng Loạt</span>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-600">Fulfillment Console</p>
                <h1 className="mt-1 text-lg font-semibold text-slate-900">Giao Hàng Loạt</h1>
                <p className="mt-1 text-sm text-slate-600">Theo dõi lô đơn chờ bàn giao và xử lý theo mức ưu tiên giao vận.</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setActiveDueFilter('all');
                  setActiveProvider('all');
                  setSortMode('oldest');
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Đặt lại bộ lọc
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Đơn chờ giao" value={String(waitingShipments.length)} tone="orange" />
              <MetricCard label="Quá 24 giờ" value={String(dueSummary.critical)} tone="red" />
              <MetricCard label="Sắp tới hạn (12-24h)" value={String(dueSummary.soon)} tone="amber" />
              <MetricCard label="Đơn vị vận chuyển" value={String(providerCounts.length)} tone="blue" />
            </div>
          </section>

          {error ? <section className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{error}</section> : null}

          <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_350px]">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
                  <FilterGroup
                    label="Mức ưu tiên"
                    options={[
                      { id: 'all', label: `Tất cả (${waitingShipments.length})` },
                      { id: 'critical', label: `Quá 24h (${dueSummary.critical})` },
                      { id: 'soon', label: `12-24h (${dueSummary.soon})` },
                      { id: 'stable', label: `<12h (${dueSummary.stable})` }
                    ]}
                    activeId={activeDueFilter}
                    onChange={(value) => {
                      setActiveDueFilter(value as DueFilter);
                    }}
                  />

                  <FilterGroup
                    label="Đơn vị vận chuyển"
                    options={providerOptions}
                    activeId={activeProvider}
                    onChange={(value) => {
                      setActiveProvider(value);
                    }}
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <p className="text-sm font-medium text-slate-700">{filteredShipments.length} kiện hàng theo bộ lọc</p>

                  <div className="flex items-center gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => setSortMode('oldest')}
                      className={[
                        'rounded-md border px-3 py-1.5 font-medium',
                        sortMode === 'oldest' ? 'border-slate-400 bg-slate-100 text-slate-800' : 'border-slate-300 text-slate-700'
                      ].join(' ')}
                    >
                      Cũ nhất trước
                    </button>
                    <button
                      type="button"
                      onClick={() => setSortMode('newest')}
                      className={[
                        'rounded-md border px-3 py-1.5 font-medium',
                        sortMode === 'newest' ? 'border-slate-400 bg-slate-100 text-slate-800' : 'border-slate-300 text-slate-700'
                      ].join(' ')}
                    >
                      Mới nhất trước
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full border-collapse text-left text-sm text-slate-700">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Sản phẩm</th>
                      <th className="px-3 py-2">Mã đơn</th>
                      <th className="px-3 py-2">Mã người mua</th>
                      <th className="px-3 py-2">Đơn vị vận chuyển</th>
                      <th className="px-3 py-2">Thời gian chờ</th>
                      <th className="px-3 py-2">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-400">
                          Đang tải dữ liệu giao hàng...
                        </td>
                      </tr>
                    ) : filteredShipments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-400">
                          Không có kiện hàng phù hợp với bộ lọc hiện tại.
                        </td>
                      </tr>
                    ) : (
                      filteredShipments.map((shipment) => {
                        const order = ordersById[shipment.orderId];
                        const productLabel = buildProductLabel(order);
                        const orderLabel = formatOrderCode(order?.orderNumber, shipment.orderId);
                        const buyerLabel = formatCustomerCode(order?.userId || shipment.buyerId);
                        const agingHours = getAgingHours(shipment.updatedAt);

                        return (
                          <tr key={shipment.id} className="border-t border-slate-100">
                            <td className="px-3 py-3 font-medium text-slate-800">{productLabel}</td>
                            <td className="px-3 py-3">
                              <Link href={`/orders/${encodeURIComponent(shipment.orderId)}`} className="text-slate-700 hover:underline">
                                {orderLabel}
                              </Link>
                            </td>
                            <td className="px-3 py-3">{buyerLabel}</td>
                            <td className="px-3 py-3">{normalizeLabel(shipment.provider)}</td>
                            <td className="px-3 py-3">
                              <div className="flex flex-col">
                                <span>{formatAgingLabel(agingHours)}</span>
                                <span className="text-xs text-slate-500">{formatDateTime(order?.updatedAt ?? shipment.updatedAt)}</span>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <StatusBadge status={shipment.status} />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">Tiến độ xử lý</h2>
                <div className="mt-3 space-y-2 text-sm">
                  <ProgressItem label="Chờ xác nhận" value={statusSummary.pending} tone="bg-slate-500" />
                  <ProgressItem label="Đã tạo vận đơn" value={statusSummary.awbCreated} tone="bg-slate-500" />
                  <ProgressItem label="Đã lấy hàng" value={statusSummary.pickedUp} tone="bg-slate-500" />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">Top đơn vị vận chuyển</h3>
                <div className="mt-3 space-y-2">
                  {providerCounts.length === 0 ? (
                    <p className="text-sm text-slate-500">Chưa có dữ liệu đơn vị vận chuyển.</p>
                  ) : (
                    providerCounts.slice(0, 5).map(([provider, count]) => (
                      <div key={provider} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
                        <span className="font-medium text-slate-700">{provider}</span>
                        <span className="text-slate-500">{count} kiện</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">Lịch lấy hàng</h3>
                <p className="mt-2 text-sm text-slate-600">Ưu tiên lấy các đơn quá 24 giờ để hạn chế vi phạm SLA giao vận.</p>

                <label className="mt-3 block text-sm font-medium text-slate-600">
                  Ngày lấy hàng
                  <select className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400">
                    <option>{new Date().toLocaleDateString('vi-VN')}</option>
                  </select>
                </label>

                <button type="button" className="mt-3 w-full rounded-md bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
                  Tạo yêu cầu lấy hàng
                </button>
              </div>
            </aside>
          </section>
        </main>
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: 'orange' | 'red' | 'amber' | 'blue' }) {
  const toneClass = {
    orange: 'border-slate-200 bg-slate-50 text-slate-700',
    red: 'border-slate-200 bg-slate-50 text-slate-700',
    amber: 'border-slate-200 bg-slate-50 text-slate-700',
    blue: 'border-slate-200 bg-slate-50 text-slate-700'
  }[tone];

  return (
    <article className={`rounded-lg border px-3 py-3 ${toneClass}`}>
      <p className="text-xs uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </article>
  );
}

function FilterGroup({
  label,
  options,
  activeId,
  onChange
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  activeId: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-slate-700">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isActive = option.id === activeId;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              className={[
                'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                isActive ? 'border-slate-400 bg-slate-100 text-slate-800' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
              ].join(' ')}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProgressItem({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-slate-700">{label}</span>
        <span className="font-semibold text-slate-900">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, value * 8)}%` }} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: SellerShipmentStatus }) {
  const styleMap: Record<SellerShipmentStatus, string> = {
    PENDING: 'border-slate-300 bg-slate-50 text-slate-700',
    AWB_CREATED: 'border-slate-300 bg-slate-50 text-slate-700',
    PICKED_UP: 'border-slate-300 bg-slate-50 text-slate-700',
    IN_TRANSIT: 'border-slate-300 bg-slate-50 text-slate-700',
    OUT_FOR_DELIVERY: 'border-slate-300 bg-slate-50 text-slate-700',
    DELIVERED: 'border-slate-300 bg-slate-50 text-slate-700',
    CANCELLED: 'border-slate-300 bg-slate-50 text-slate-700',
    FAILED: 'border-slate-300 bg-slate-50 text-slate-700',
    RETURNED: 'border-slate-300 bg-slate-50 text-slate-700'
  };

  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${styleMap[status]}`}>{toShipmentStatusLabel(status)}</span>;
}

function buildProductLabel(order: SellerOrder | undefined): string {
  if (!order || order.items.length === 0) {
    return 'N/A';
  }

  const firstName = order.items[0].productName;
  if (order.items.length === 1) {
    return firstName;
  }

  return `${firstName} +${order.items.length - 1}`;
}

function normalizeLabel(value: string): string {
  return value
    .trim()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function toShipmentStatusLabel(status: SellerShipmentStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Chờ xử lý';
    case 'AWB_CREATED':
      return 'Đã tạo vận đơn';
    case 'PICKED_UP':
      return 'Đã lấy hàng';
    case 'IN_TRANSIT':
      return 'Đang vận chuyển';
    case 'OUT_FOR_DELIVERY':
      return 'Đang giao hàng';
    case 'DELIVERED':
      return 'Đã giao';
    case 'CANCELLED':
      return 'Đã hủy';
    case 'FAILED':
      return 'Thất bại';
    case 'RETURNED':
      return 'Hoàn hàng';
    default:
      return status;
  }
}

function getAgingHours(value: string): number {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return 0;
  }

  return Math.max(0, Math.round((Date.now() - timestamp) / (1000 * 60 * 60)));
}

function formatAgingLabel(hours: number): string {
  if (hours >= 24) {
    return `${hours} giờ (quá hạn)`;
  }

  return `${hours} giờ`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function toVirtualShipment(order: SellerOrder): SellerShipment {
  return {
    id: `virtual-${order.id}`,
    orderId: order.id,
    buyerId: order.userId,
    sellerId: '',
    provider: 'SYSTEM_AUTO',
    awb: null,
    trackingNumber: null,
    status: 'PENDING',
    currency: order.currency,
    shippingFee: 0,
    codAmount: 0,
    recipientName: '--',
    recipientPhone: '--',
    recipientAddress: '--',
    note: 'Shipment chưa được tạo',
    metadata: {
      source: 'ORDER_ONLY'
    },
    createdAt: order.createdAt,
    updatedAt: order.updatedAt
  };
}
