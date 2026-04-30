'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { SellerApiClientError } from '@/lib/api/client';
import { listSellerOrders } from '@/lib/api/orders';
import { listSellerShipments } from '@/lib/api/shipping';
import type { SellerOrder, SellerOrderStatus, SellerShipment, SellerShipmentStatus } from '@/lib/api/types';
import { formatOrderCode } from '@/lib/order-codes';
import { useAuth } from '@/providers/AppProvider';

type HandoverMode = 'pickup' | 'dropoff';
type HandoverStatus = 'waiting' | 'done';

const PICKUP_WAITING_COLUMNS = ['Ngày lấy hàng', 'Đơn vị vận chuyển', 'Đơn lấy dự kiến', 'Đã lấy thành công', 'Còn chờ lấy'];
const PICKUP_DONE_COLUMNS = ['Ngày lấy hàng', 'Đơn vị vận chuyển', 'Đã lấy thành công', 'Thao tác'];
const DROPOFF_WAITING_COLUMNS = ['Đơn vị vận chuyển', 'Điểm gửi hàng', 'Số đơn cần gửi'];
const DROPOFF_DONE_COLUMNS = ['Ngày gửi bưu cục', 'Đơn vị vận chuyển', 'Đã gửi thành công', 'Thao tác'];
const WAITING_ORDER_STATUSES: SellerOrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING'];

export default function OrderHandoverPage() {
  const router = useRouter();
  const { ready, user, accessToken, logout } = useAuth();

  const [mode, setMode] = useState<HandoverMode>('pickup');
  const [status, setStatus] = useState<HandoverStatus>('waiting');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [shipments, setShipments] = useState<SellerShipment[]>([]);

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

        const orderItems = orderResult.status === 'fulfilled' ? orderResult.value.items : [];
        const shipmentItems = shipmentResult.status === 'fulfilled' ? shipmentResult.value.items : [];

        const shipmentOrderIds = new Set(shipmentItems.map((item) => item.orderId));
        const virtualShipments = orderItems
          .filter((item) => WAITING_ORDER_STATUSES.includes(item.status) && !shipmentOrderIds.has(item.id))
          .map((item) => toVirtualShipment(item));

        if (!cancelled) {
          setShipments([...shipmentItems, ...virtualShipments]);
        }

        if (orderResult.status === 'rejected' && shipmentResult.status === 'rejected') {
          throw orderResult.reason;
        }

        if (!cancelled && (orderResult.status === 'rejected' || shipmentResult.status === 'rejected')) {
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
          setError('Không tải được dữ liệu bàn giao đơn hàng.');
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

  const tableColumns = useMemo(() => {
    if (mode === 'pickup') {
      return status === 'done' ? PICKUP_DONE_COLUMNS : PICKUP_WAITING_COLUMNS;
    }

    return status === 'done' ? DROPOFF_DONE_COLUMNS : DROPOFF_WAITING_COLUMNS;
  }, [mode, status]);

  const scopedShipments = useMemo(() => {
    return shipments.filter((shipment) => matchesScope(shipment.status, mode, status));
  }, [mode, shipments, status]);

  const groupedRows = useMemo<ReactNode[][]>(() => {
    const grouped = groupByProviderAndDate(scopedShipments);

    return grouped.map((entry) => {
      if (mode === 'pickup' && status === 'waiting') {
        return [entry.dateLabel, entry.provider, String(entry.total), '0', String(entry.total)];
      }

      if (mode === 'pickup' && status === 'done') {
        return [
          entry.dateLabel,
          entry.provider,
          String(entry.total),
          <Link key={entry.sampleOrderId} href={`/orders/${encodeURIComponent(entry.sampleOrderId)}`} className="hover:underline">
            Xem {formatOrderCode(undefined, entry.sampleOrderId)}
          </Link>
        ];
      }

      if (mode === 'dropoff' && status === 'waiting') {
        return [entry.provider, 'Bưu cục gần nhất', String(entry.total)];
      }

      return [
        entry.dateLabel,
        entry.provider,
        String(entry.total),
        <Link key={entry.sampleOrderId} href={`/orders/${encodeURIComponent(entry.sampleOrderId)}`} className="hover:underline">
          Xem {formatOrderCode(undefined, entry.sampleOrderId)}
        </Link>
      ];
    });
  }, [mode, scopedShipments, status]);

  const providerSummary = useMemo(() => {
    const counter = new Map<string, number>();

    for (const shipment of scopedShipments) {
      const provider = normalizeProvider(shipment.provider);
      counter.set(provider, (counter.get(provider) ?? 0) + 1);
    }

    return Array.from(counter.entries()).sort((a, b) => b[1] - a[1]);
  }, [scopedShipments]);

  const globalSummary = useMemo(() => {
    const waitingPickup = shipments.filter((item) => item.status === 'PENDING' || item.status === 'AWB_CREATED').length;
    const pickedUp = shipments.filter((item) => item.status === 'PICKED_UP').length;
    const inTransit = shipments.filter((item) => item.status === 'IN_TRANSIT' || item.status === 'OUT_FOR_DELIVERY').length;
    const delivered = shipments.filter((item) => item.status === 'DELIVERED').length;

    return {
      waitingPickup,
      pickedUp,
      inTransit,
      delivered
    };
  }, [shipments]);

  const waitingTabLabel = mode === 'pickup' ? 'Chờ lấy hàng' : 'Chờ gửi hàng tại bưu cục';
  const doneTabLabel = mode === 'pickup' ? 'Đã lấy hàng' : 'Đã gửi hàng tại bưu cục';

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
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
            <Link href="/" className="hover:text-slate-700">
              Trang chủ
            </Link>
            <span>›</span>
            <span className="font-medium text-slate-700">Bàn Giao Đơn Hàng</span>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-600">Handover Hub</p>
                <h1 className="mt-1 text-lg font-semibold text-slate-900">Bàn Giao Đơn Hàng</h1>
                <p className="mt-1 text-sm text-slate-600">Theo dõi tiến độ lấy hàng và gửi bưu cục theo từng đợt bàn giao.</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMode('pickup');
                  setStatus('waiting');
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Về mặc định
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="Chờ lấy hàng" value={globalSummary.waitingPickup} tone="slate" />
              <SummaryCard label="Đã lấy hàng" value={globalSummary.pickedUp} tone="emerald" />
              <SummaryCard label="Đang trung chuyển" value={globalSummary.inTransit} tone="blue" />
              <SummaryCard label="Giao thành công" value={globalSummary.delivered} tone="teal" />
            </div>
          </section>

          {error ? <section className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{error}</section> : null}

          <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-end gap-6 border-b border-slate-200 pb-2 text-sm font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setMode('pickup');
                    setStatus('waiting');
                  }}
                  className={[
                    'border-b-[3px] pb-2 transition',
                    mode === 'pickup' ? 'border-slate-500 text-slate-900' : 'border-transparent text-slate-700'
                  ].join(' ')}
                >
                  Lấy hàng
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('dropoff');
                    setStatus('waiting');
                  }}
                  className={[
                    'border-b-[3px] pb-2 transition',
                    mode === 'dropoff' ? 'border-slate-500 text-slate-900' : 'border-transparent text-slate-700'
                  ].join(' ')}
                >
                  Gửi hàng tại bưu cục
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
                <button
                  type="button"
                  onClick={() => setStatus('waiting')}
                  className={[
                    'rounded-full border px-4 py-1.5 text-sm',
                    status === 'waiting' ? 'border-slate-400 bg-slate-100 font-semibold text-slate-900' : 'border-slate-300 text-slate-700'
                  ].join(' ')}
                >
                  {waitingTabLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setStatus('done')}
                  className={[
                    'rounded-full border px-4 py-1.5 text-sm',
                    status === 'done' ? 'border-slate-400 bg-slate-100 font-semibold text-slate-900' : 'border-slate-300 text-slate-700'
                  ].join(' ')}
                >
                  {doneTabLabel}
                </button>
              </div>

              <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-[820px] w-full border-collapse text-left text-sm text-slate-700">
                    <thead className="bg-slate-50 text-sm font-medium text-slate-500">
                      <tr>
                        {tableColumns.map((column) => (
                          <th key={column} className="px-4 py-3 font-medium">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading ? (
                        <tr>
                          <td colSpan={tableColumns.length} className="h-[260px] px-4 py-10 text-center text-sm text-slate-400">
                            Đang tải dữ liệu bàn giao...
                          </td>
                        </tr>
                      ) : groupedRows.length === 0 ? (
                        <tr>
                          <td colSpan={tableColumns.length} className="h-[280px] px-4 py-10 text-center text-sm text-slate-400">
                            Không tìm thấy đơn hàng theo điều kiện hiện tại.
                          </td>
                        </tr>
                      ) : (
                        groupedRows.map((row, index) => (
                          <tr key={`group-${index}`} className="border-t border-slate-100">
                            {row.map((cell, cellIndex) => (
                              <td key={`${index}-${cellIndex}`} className="px-4 py-3">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">Phân bổ theo đơn vị vận chuyển</h2>
                <div className="mt-3 space-y-2">
                  {providerSummary.length === 0 ? (
                    <p className="text-sm text-slate-500">Chưa có dữ liệu trong trạng thái hiện tại.</p>
                  ) : (
                    providerSummary.slice(0, 6).map(([provider, count]) => (
                      <div key={provider} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
                        <span className="font-medium text-slate-700">{provider}</span>
                        <span className="text-slate-500">{count} đơn</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">Lịch bàn giao</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Tự động gom đợt theo ngày và đơn vị vận chuyển để giảm số lần thao tác bàn giao trong ngày.
                </p>

                <button type="button" className="mt-3 w-full rounded-md bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
                  Tạo đợt bàn giao mới
                </button>
              </div>
            </aside>
          </section>
        </main>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'emerald' | 'blue' | 'teal' }) {
  const toneClass = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    emerald: 'border-slate-200 bg-slate-50 text-slate-700',
    blue: 'border-slate-200 bg-slate-50 text-slate-700',
    teal: 'border-slate-200 bg-slate-50 text-slate-700'
  }[tone];

  return (
    <article className={`rounded-lg border px-3 py-3 ${toneClass}`}>
      <p className="text-xs uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </article>
  );
}

function matchesScope(status: SellerShipmentStatus, mode: HandoverMode, handoverStatus: HandoverStatus): boolean {
  if (mode === 'pickup') {
    if (handoverStatus === 'waiting') {
      return status === 'PENDING' || status === 'AWB_CREATED';
    }

    return status === 'PICKED_UP' || status === 'IN_TRANSIT' || status === 'OUT_FOR_DELIVERY' || status === 'DELIVERED';
  }

  if (handoverStatus === 'waiting') {
    return status === 'PENDING' || status === 'AWB_CREATED';
  }

  return status === 'PICKED_UP' || status === 'IN_TRANSIT' || status === 'OUT_FOR_DELIVERY' || status === 'DELIVERED';
}

function groupByProviderAndDate(shipments: SellerShipment[]): Array<{ provider: string; dateLabel: string; total: number; sampleOrderId: string }> {
  const grouped = new Map<string, { provider: string; dateLabel: string; total: number; sampleOrderId: string }>();

  for (const shipment of shipments) {
    const provider = normalizeProvider(shipment.provider);
    const dateLabel = formatDate(shipment.updatedAt);
    const key = `${provider}::${dateLabel}`;

    const current = grouped.get(key);
    if (current) {
      current.total += 1;
    } else {
      grouped.set(key, {
        provider,
        dateLabel,
        total: 1,
        sampleOrderId: shipment.orderId
      });
    }
  }

  return Array.from(grouped.values()).sort((a, b) => b.dateLabel.localeCompare(a.dateLabel));
}

function normalizeProvider(value: string): string {
  return value
    .trim()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
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
