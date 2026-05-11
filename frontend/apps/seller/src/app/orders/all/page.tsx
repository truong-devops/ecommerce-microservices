'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { SellerApiClientError } from '@/lib/api/client';
import { listSellerOrders } from '@/lib/api/orders';
import type { SellerOrder, SellerOrderStatus } from '@/lib/api/types';
import { formatCustomerCode, formatOrderCode } from '@/lib/order-codes';
import { useAuth } from '@/providers/AppProvider';

const statusTabs: Array<{ label: string; value: '' | SellerOrderStatus }> = [
  { label: 'Tất cả', value: '' },
  { label: 'Chờ xác nhận', value: 'PENDING' },
  { label: 'Đã xác nhận', value: 'CONFIRMED' },
  { label: 'Đang xử lý', value: 'PROCESSING' },
  { label: 'Đang giao', value: 'SHIPPED' },
  { label: 'Hoàn tất', value: 'DELIVERED' },
  { label: 'Đã hủy', value: 'CANCELLED' },
  { label: 'Thất bại', value: 'FAILED' }
];

export default function AllOrdersPage() {
  const router = useRouter();
  const { ready, user, accessToken, logout } = useAuth();

  const [activeStatus, setActiveStatus] = useState<'' | SellerOrderStatus>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<SellerOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  const loadOrders = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await listSellerOrders(accessToken, {
        page: 1,
        pageSize: 100,
        status: activeStatus || undefined,
        search: search || undefined,
        sortBy: 'createdAt',
        sortOrder: 'DESC'
      });

      setItems(response.items);
    } catch (loadError) {
      if (loadError instanceof SellerApiClientError) {
        setError(loadError.message);
      } else {
        setError('Không tải được danh sách đơn hàng.');
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeStatus, search]);

  useEffect(() => {
    if (!ready || !accessToken) {
      return;
    }

    void loadOrders();
  }, [ready, accessToken, loadOrders]);

  const statusCountLabel = useMemo(() => {
    const map: Record<'' | SellerOrderStatus, number> = {
      '': items.length,
      PENDING: items.filter((item) => item.status === 'PENDING').length,
      CONFIRMED: items.filter((item) => item.status === 'CONFIRMED').length,
      PROCESSING: items.filter((item) => item.status === 'PROCESSING').length,
      SHIPPED: items.filter((item) => item.status === 'SHIPPED').length,
      DELIVERED: items.filter((item) => item.status === 'DELIVERED').length,
      CANCELLED: items.filter((item) => item.status === 'CANCELLED').length,
      FAILED: items.filter((item) => item.status === 'FAILED').length
    };

    return map;
  }, [items]);

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
          <Link href="/login" className="mt-5 inline-flex rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600">
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
            <Link href="/" className="hover:text-[#ee4d2d]">
              Trang chủ
            </Link>
            <span>›</span>
            <span className="font-medium text-slate-700">Tất cả đơn hàng</span>
          </div>

          <section className="rounded-md border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
              <div className="flex min-w-0 flex-1 items-end gap-5 overflow-x-auto whitespace-nowrap">
                {statusTabs.map((tab) => {
                  const isActive = activeStatus === tab.value;
                  const count = statusCountLabel[tab.value];

                  return (
                    <button
                      key={tab.label}
                      type="button"
                      onClick={() => {
                        setActiveStatus(tab.value);
                      }}
                      className={[
                        'border-b-[3px] pb-2 text-sm font-semibold transition',
                        isActive ? 'border-[#ee4d2d] text-[#ee4d2d]' : 'border-transparent text-slate-800'
                      ].join(' ')}
                    >
                      {tab.label} ({count})
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  void loadOrders();
                }}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Làm mới
              </button>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_140px_140px_auto]">
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Tìm theo mã đơn / mã khách hàng"
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => {
                  setSearch(searchInput.trim());
                }}
                className="rounded-md border border-[#ee4d2d] px-3 py-2 text-sm font-semibold text-[#ee4d2d]"
              >
                Áp dụng
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSearch('');
                  setActiveStatus('');
                }}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Đặt lại
              </button>
              <button type="button" className="text-sm font-medium text-[#2563eb] hover:underline">
                Mở rộng ▾
              </button>
            </div>

            {error ? <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

            <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-left text-sm text-slate-700">
                  <thead className="bg-slate-50 text-sm font-medium text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Mã đơn</th>
                      <th className="px-4 py-3 font-medium">Khách hàng</th>
                      <th className="px-4 py-3 font-medium">Sản phẩm</th>
                      <th className="px-4 py-3 font-medium">Tổng tiền</th>
                      <th className="px-4 py-3 font-medium">Trạng thái</th>
                      <th className="px-4 py-3 font-medium">Cập nhật</th>
                      <th className="px-4 py-3 font-medium">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="h-[180px] px-4 py-6 text-center text-slate-500">
                          Đang tải đơn hàng...
                        </td>
                      </tr>
                    ) : items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="h-[200px] px-4 py-6 text-center text-slate-400">
                          Không có đơn hàng phù hợp.
                        </td>
                      </tr>
                    ) : (
                      items.map((order) => (
                        <tr key={order.id} className="border-t border-slate-200 align-top">
                          <td className="px-4 py-3 font-medium text-slate-800">
                            <Link href={`/orders/${encodeURIComponent(order.id)}`} className="hover:underline">
                              {formatOrderCode(order.orderNumber, order.id)}
                            </Link>
                          </td>
                          <td className="px-4 py-3">{formatCustomerCode(order.userId)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <OrderItemThumbnail imageUrl={getPrimaryOrderImage(order)} />
                              <span>{toProductSummary(order)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">{formatCurrency(order.totalAmount, order.currency)}</td>
                          <td className="px-4 py-3">
                            <span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-700">
                              {toStatusLabel(order.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3">{formatDateTime(order.updatedAt)}</td>
                          <td className="px-4 py-3">
                            <Link href={`/orders/${encodeURIComponent(order.id)}`} className="text-[#2563eb] hover:underline">
                              Chi tiết
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function getPrimaryOrderImage(order: SellerOrder): string | null {
  for (const item of order.items) {
    const imageUrl = item.imageUrl?.trim();
    if (imageUrl) {
      return imageUrl;
    }
  }

  return null;
}

function OrderItemThumbnail({ imageUrl }: { imageUrl: string | null }) {
  if (!imageUrl) {
    return (
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-400">
        N/A
      </span>
    );
  }

  return <img src={imageUrl} alt="Ảnh sản phẩm" className="h-10 w-10 rounded-md border border-slate-200 object-cover" loading="lazy" />;
}

function toProductSummary(order: SellerOrder): string {
  if (order.items.length === 0) {
    return 'N/A';
  }

  const firstName = order.items[0].productName;
  if (order.items.length === 1) {
    return firstName;
  }

  return `${firstName} +${order.items.length - 1}`;
}

function toStatusLabel(status: SellerOrderStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Chờ xác nhận';
    case 'CONFIRMED':
      return 'Đã xác nhận';
    case 'PROCESSING':
      return 'Đang xử lý';
    case 'SHIPPED':
      return 'Đang giao';
    case 'DELIVERED':
      return 'Đã giao';
    case 'CANCELLED':
      return 'Đã hủy';
    case 'FAILED':
      return 'Thất bại';
    default:
      return status;
  }
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
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
