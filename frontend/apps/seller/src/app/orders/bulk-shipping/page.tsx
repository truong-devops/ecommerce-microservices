'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { SellerApiClientError } from '@/lib/api/client';
import { listSellerOrders } from '@/lib/api/orders';
import { listSellerShipments } from '@/lib/api/shipping';
import type { SellerOrder, SellerShipment, SellerShipmentStatus } from '@/lib/api/types';
import { formatCustomerCode, formatOrderCode } from '@/lib/order-codes';
import { useAuth } from '@/providers/AppProvider';

const WAITING_SHIPMENT_STATUSES: SellerShipmentStatus[] = ['PENDING', 'AWB_CREATED', 'PICKED_UP'];

export default function BulkShippingPage() {
  const router = useRouter();
  const { ready, user, accessToken, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [waitingShipments, setWaitingShipments] = useState<SellerShipment[]>([]);
  const [ordersById, setOrdersById] = useState<Record<string, SellerOrder>>({});

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
        const [shipmentResult, orderResult] = await Promise.all([
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

        const filtered = shipmentResult.items.filter((item) => WAITING_SHIPMENT_STATUSES.includes(item.status));
        const nextOrderMap = Object.fromEntries(orderResult.items.map((item) => [item.id, item]));

        setWaitingShipments(filtered);
        setOrdersById(nextOrderMap);
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

  const orderTypeFilters = useMemo(() => {
    const total = waitingShipments.length;
    return [`All (${total})`, `Đơn thường (${total})`, 'Đơn Hỏa Tốc (0)'];
  }, [waitingShipments.length]);

  const dueDateFilters = useMemo(() => {
    const now = Date.now();
    let overdue = 0;
    let within24Hours = 0;
    let above24Hours = 0;

    for (const shipment of waitingShipments) {
      const updatedAt = new Date(shipment.updatedAt).getTime();
      if (Number.isNaN(updatedAt)) {
        continue;
      }

      const diffHours = (now - updatedAt) / (1000 * 60 * 60);
      if (diffHours > 24) {
        overdue += 1;
      } else if (diffHours >= 12) {
        within24Hours += 1;
      } else {
        above24Hours += 1;
      }
    }

    return [
      `Tất cả trạng thái (${waitingShipments.length})`,
      `Quá hạn giao hàng (${overdue})`,
      `Trong vòng 24 tiếng (${within24Hours})`,
      `Trên 24 tiếng (${above24Hours})`
    ];
  }, [waitingShipments]);

  const shippingUnitFilters = useMemo(() => {
    if (providerCounts.length === 0) {
      return ['Đơn vị vận chuyển khác (0)'];
    }

    return providerCounts.slice(0, 16).map(([provider, count]) => `${provider} (${count})`);
  }, [providerCounts]);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-slate-600">
        Đang kiểm tra phiên đăng nhập...
      </main>
    );
  }

  if (!user || !accessToken) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-orange-500">eMall Seller</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Bạn chưa đăng nhập</h1>
          <p className="mt-2 text-sm text-slate-600">Đăng nhập để truy cập Seller Center.</p>

          <Link
            href="/login"
            className="mt-5 inline-flex rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
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
            <Link href="/" className="hover:text-[#ee4d2d]">
              Trang chủ
            </Link>
            <span>›</span>
            <span className="font-medium text-slate-700">Giao Hàng Loạt</span>
          </div>

          <h1 className="text-sm font-semibold tracking-tight text-slate-900">Giao Hàng Loạt</h1>

          {error ? (
            <section className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</section>
          ) : null}

          <section className="mt-4 flex items-center gap-6 border-b border-slate-200 text-sm font-semibold">
            <button type="button" className="border-b-[3px] border-[#ee4d2d] pb-3 text-[#ee4d2d]">
              Chờ giao hàng
            </button>
            <button type="button" className="pb-3 text-slate-800">
              Tạo phiếu
            </button>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
            <div className="rounded-md border border-slate-200 bg-white p-5">
              <FilterRow label="Loại Đơn hàng" values={orderTypeFilters} activeValue={orderTypeFilters[1]} />
              <FilterRow label="Hạn giao hàng" values={dueDateFilters} activeValue={dueDateFilters[0]} />
              <FilterRow label="Đơn vị vận chuyển" values={shippingUnitFilters} activeValue={shippingUnitFilters[0]} />

              <button type="button" className="text-sm font-medium text-[#3b82f6] hover:underline">
                Mở rộng bộ lọc
              </button>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <h2 className="text-sm font-semibold text-slate-900">{waitingShipments.length} Kiện hàng</h2>

                <button
                  type="button"
                  className="rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Sắp xếp theo: Hạn gửi hàng (Xa - Gần nhất)
                </button>
              </div>

              <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
                <table className="w-full border-collapse text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Sản phẩm</th>
                      <th className="px-3 py-2">Mã đơn hàng</th>
                      <th className="px-3 py-2">Người mua</th>
                      <th className="px-3 py-2">Đơn vị vận chuyển</th>
                      <th className="px-3 py-2">Thời gian xác nhận</th>
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
                    ) : waitingShipments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-400">
                          Chưa có đơn hàng nào trong bộ lọc hiện tại.
                        </td>
                      </tr>
                    ) : (
                      waitingShipments.map((shipment) => {
                        const order = ordersById[shipment.orderId];
                        const productLabel = buildProductLabel(order);
                        const orderLabel = formatOrderCode(order?.orderNumber, shipment.orderId);
                        const buyerLabel = formatCustomerCode(order?.userId || shipment.buyerId);

                        return (
                          <tr key={shipment.id} className="border-t border-slate-100">
                            <td className="px-3 py-3 font-medium text-slate-700">{productLabel}</td>
                            <td className="px-3 py-3">
                              <Link href={`/orders/${encodeURIComponent(shipment.orderId)}`} className="text-[#2563eb] hover:underline">
                                {orderLabel}
                              </Link>
                            </td>
                            <td className="px-3 py-3">{buyerLabel}</td>
                            <td className="px-3 py-3">{normalizeLabel(shipment.provider)}</td>
                            <td className="px-3 py-3">{formatDateTime(order?.updatedAt ?? shipment.updatedAt)}</td>
                            <td className="px-3 py-3">
                              <span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-700">
                                {toShipmentStatusLabel(shipment.status)}
                              </span>
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
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold leading-tight text-slate-900">Chuẩn bị đơn hàng loạt</h2>
                <p className="mt-1 text-sm text-slate-500">{waitingShipments.length} parcels selected</p>

                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <h3 className="text-sm font-semibold text-slate-900">Pickup</h3>
                  <p className="mt-2 text-sm font-medium text-slate-500">Địa chỉ lấy hàng</p>
                  <p className="mt-2 text-sm font-semibold text-slate-800">Kho mặc định của Shop</p>
                  <p className="text-sm text-[#ee4d2d]">Đến Lấy Hàng</p>
                  <p className="text-sm text-slate-700">Sử dụng thông tin giao nhận từ dịch vụ vận chuyển</p>

                  <label className="mt-4 block text-sm font-medium text-slate-600">
                    Ngày lấy hàng
                    <select className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-orange-400">
                      <option>{new Date().toLocaleDateString('vi-VN')}</option>
                    </select>
                  </label>

                  <button
                    type="button"
                    className="mt-3 w-full rounded-md bg-[#f9a696] px-3 py-2 text-sm font-semibold text-white hover:bg-[#f3917e]"
                  >
                    Yêu cầu đơn vị vận chuyển đến lấy hàng
                  </button>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-900">Drop off</h3>
                <p className="mt-2 text-sm text-slate-700">Bưu cục gần bạn nhất:</p>
                <p className="mt-1 text-sm text-slate-500">Theo dõi danh sách đơn vị vận chuyển ở trang cài đặt vận chuyển.</p>
              </div>
            </aside>
          </section>
        </main>
      </div>
    </div>
  );
}

function FilterRow({
  label,
  values,
  activeValue
}: {
  label: string;
  values: string[];
  activeValue?: string;
}) {
  return (
    <div className="mb-5 grid gap-3 lg:grid-cols-[150px_1fr]">
      <p className="pt-1 text-sm font-medium text-slate-700">{label}</p>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => {
          const isActive = value === activeValue;

          return (
            <button
              key={value}
              type="button"
              className={[
                'rounded-full border px-4 py-2 text-xs transition md:text-sm',
                isActive ? 'border-[#ee4d2d] bg-[#fff4f1] text-[#ee4d2d]' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
              ].join(' ')}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
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
