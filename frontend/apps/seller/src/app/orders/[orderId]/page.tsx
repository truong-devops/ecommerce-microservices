'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { SellerApiClientError } from '@/lib/api/client';
import { getSellerOrderById, getSellerOrderHistory, updateSellerOrderStatus } from '@/lib/api/orders';
import { getSellerShipmentByOrderId, getSellerShipmentTrackingEvents } from '@/lib/api/shipping';
import type {
  SellerOrder,
  SellerOrderStatus,
  SellerOrderStatusHistoryOutput,
  SellerShipment,
  SellerShipmentTrackingEventsOutput
} from '@/lib/api/types';
import { formatCustomerCode, formatOrderCode, formatSellerCode } from '@/lib/order-codes';
import { useAuth } from '@/providers/AppProvider';

const statusTransitionMap: Partial<Record<SellerOrderStatus, SellerOrderStatus[]>> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CANCELLED'],
  PROCESSING: ['CANCELLED'],
  SHIPPED: [],
  DELIVERED: [],
  CANCELLED: [],
  FAILED: []
};

export default function SellerOrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ orderId: string }>();
  const orderId = typeof params?.orderId === 'string' ? params.orderId : '';

  const { ready, user, accessToken, logout } = useAuth();

  const [order, setOrder] = useState<SellerOrder | null>(null);
  const [history, setHistory] = useState<SellerOrderStatusHistoryOutput | null>(null);
  const [shipment, setShipment] = useState<SellerShipment | null>(null);
  const [tracking, setTracking] = useState<SellerShipmentTrackingEventsOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [orderMissing, setOrderMissing] = useState(false);
  const [statusReason, setStatusReason] = useState('');

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  const loadDetail = useCallback(async () => {
    if (!accessToken || !orderId) {
      return;
    }

    setLoading(true);
    setError('');
    setOrderMissing(false);

    try {
      const [orderResult, shipmentResult] = await Promise.allSettled([
        getSellerOrderById(accessToken, orderId),
        getSellerShipmentByOrderId(accessToken, orderId)
      ]);

      let orderData: SellerOrder | null = null;
      let historyData: SellerOrderStatusHistoryOutput | null = null;
      let shipmentData: SellerShipment | null = null;

      if (orderResult.status === 'fulfilled') {
        orderData = orderResult.value;
      } else if (orderResult.reason instanceof SellerApiClientError && orderResult.reason.code === 'NOT_FOUND') {
        setOrderMissing(true);
      } else {
        throw orderResult.reason;
      }

      if (shipmentResult.status === 'fulfilled') {
        shipmentData = shipmentResult.value;
      } else {
        throw shipmentResult.reason;
      }

      if (orderData) {
        try {
          historyData = await getSellerOrderHistory(accessToken, orderId);
        } catch (historyError) {
          if (!(historyError instanceof SellerApiClientError && historyError.code === 'NOT_FOUND')) {
            throw historyError;
          }
        }
      }

      let trackingData: SellerShipmentTrackingEventsOutput | null = null;
      if (shipmentData) {
        trackingData = await getSellerShipmentTrackingEvents(accessToken, shipmentData.id);
      }

      setOrder(orderData);
      setHistory(historyData);
      setShipment(shipmentData);
      setTracking(trackingData);

      if (!orderData && shipmentData) {
        setError('Không tìm thấy đơn hàng trong Order Service. Đang hiển thị dữ liệu giao vận hiện có.');
      }
    } catch (loadError) {
      if (loadError instanceof SellerApiClientError) {
        setError(loadError.message);
      } else {
        setError('Không tải được chi tiết đơn hàng.');
      }
      setOrder(null);
      setHistory(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, orderId]);

  useEffect(() => {
    if (!ready || !accessToken || !orderId) {
      return;
    }

    void loadDetail();
  }, [ready, accessToken, orderId, loadDetail]);

  const availableTransitions = useMemo(() => {
    if (!order) {
      return [];
    }

    return statusTransitionMap[order.status] ?? [];
  }, [order]);

  const handleUpdateStatus = async (nextStatus: SellerOrderStatus) => {
    if (!accessToken || !orderId) {
      return;
    }

    setUpdating(true);
    setError('');

    try {
      await updateSellerOrderStatus(accessToken, orderId, {
        status: nextStatus,
        reason: statusReason.trim() || undefined
      });

      setStatusReason('');
      await loadDetail();
    } catch (updateError) {
      if (updateError instanceof SellerApiClientError) {
        setError(updateError.message);
      } else {
        setError('Không cập nhật được trạng thái đơn hàng.');
      }
    } finally {
      setUpdating(false);
    }
  };

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
            <Link href="/orders/all" className="hover:text-[#ee4d2d]">
              Tất cả đơn hàng
            </Link>
            <span>›</span>
            <span className="font-medium text-slate-700">Chi tiết đơn hàng</span>
          </div>

          {error ? <section className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</section> : null}

          {loading ? (
            <section className="rounded-md border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Đang tải chi tiết đơn hàng...</section>
          ) : !order ? (
            <section className="space-y-3">
              <article className="rounded-md border border-slate-200 bg-white p-4">
                <h1 className="text-base font-semibold text-slate-900">Không tìm thấy chi tiết đơn hàng</h1>
                <p className="mt-2 text-sm text-slate-600">
                  Mã đơn: <span className="font-medium text-slate-800">{formatOrderCode(undefined, orderId)}</span>
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {orderMissing
                    ? 'Order Service không có bản ghi cho mã này hoặc dữ liệu chưa đồng bộ.'
                    : 'Không thể tải dữ liệu đơn hàng từ hệ thống.'}
                </p>
                <div className="mt-3">
                  <Link href="/orders/all" className="text-sm font-medium text-slate-700 hover:underline">
                    Quay lại danh sách đơn
                  </Link>
                </div>
              </article>

              <section className="grid gap-3 xl:grid-cols-2">
                <article className="rounded-md border border-slate-200 bg-white p-4">
                  <h2 className="text-sm font-semibold text-slate-900">Thông tin giao vận</h2>
                  {!shipment ? (
                    <p className="mt-3 text-sm text-slate-500">Chưa có shipment cho đơn hàng này.</p>
                  ) : (
                    <div className="mt-3 space-y-1 text-sm text-slate-700">
                      <p>Đơn vị vận chuyển: {shipment.provider}</p>
                      <p>Trạng thái shipment: {shipment.status}</p>
                      <p>AWB: {shipment.awb ?? 'N/A'}</p>
                      <p>Tracking: {shipment.trackingNumber ?? 'N/A'}</p>
                      <p>Mã người mua: {formatCustomerCode(shipment.buyerId)}</p>
                      <p>Mã seller: {formatSellerCode(shipment.sellerId)}</p>
                      <p>Người nhận: {shipment.recipientName}</p>
                      <p>SĐT: {shipment.recipientPhone}</p>
                      <p>Địa chỉ: {shipment.recipientAddress}</p>
                    </div>
                  )}
                </article>

                <article className="rounded-md border border-slate-200 bg-white p-4">
                  <h2 className="text-sm font-semibold text-slate-900">Lịch sử tracking</h2>
                  {!tracking || tracking.events.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">Chưa có tracking event.</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {tracking.events.map((eventItem) => (
                        <div key={eventItem.id} className="rounded-md border border-slate-200 p-3 text-sm">
                          <p className="font-semibold text-slate-800">{eventItem.status}</p>
                          <p className="text-slate-600">{eventItem.description ?? 'Không có mô tả'}</p>
                          <p className="text-xs text-slate-500">{formatDateTime(eventItem.occurredAt)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </section>
            </section>
          ) : (
            <div className="space-y-3">
              <section className="rounded-md border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Order</p>
                    <h1 className="text-base font-semibold text-slate-900">{formatOrderCode(order.orderNumber, order.id)}</h1>
                    <p className="mt-1 text-sm text-slate-600">Khách hàng: {formatCustomerCode(order.userId)}</p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Trạng thái</p>
                    <p className="text-sm font-semibold text-slate-800">{toStatusLabel(order.status)}</p>
                    <p className="text-xs text-slate-500">Cập nhật: {formatDateTime(order.updatedAt)}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Metric label="Tạm tính" value={formatCurrency(order.subtotalAmount, order.currency)} />
                  <Metric label="Phí giao hàng" value={formatCurrency(order.shippingAmount, order.currency)} />
                  <Metric label="Giảm giá" value={formatCurrency(order.discountAmount, order.currency)} />
                  <Metric label="Tổng thanh toán" value={formatCurrency(order.totalAmount, order.currency)} />
                </div>
              </section>

              <section className="rounded-md border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-slate-900">Sản phẩm</h2>
                <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
                  <table className="w-full border-collapse text-left text-sm text-slate-700">
                    <thead className="bg-slate-50 text-sm font-medium text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Tên sản phẩm</th>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">SL</th>
                        <th className="px-3 py-2">Đơn giá</th>
                        <th className="px-3 py-2">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item) => (
                        <tr key={item.id} className="border-t border-slate-100">
                          <td className="px-3 py-2">{item.productName}</td>
                          <td className="px-3 py-2">{item.sku}</td>
                          <td className="px-3 py-2">{item.quantity}</td>
                          <td className="px-3 py-2">{formatCurrency(item.unitPrice, order.currency)}</td>
                          <td className="px-3 py-2">{formatCurrency(item.totalPrice, order.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-md border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-slate-900">Cập nhật trạng thái</h2>
                <p className="mt-1 text-sm text-slate-500">Hệ thống sẽ validate transition trước khi cập nhật.</p>

                {availableTransitions.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-600">Đơn hàng ở trạng thái cuối, không còn thao tác chuyển trạng thái.</p>
                ) : (
                  <>
                    <textarea
                      value={statusReason}
                      onChange={(event) => {
                        setStatusReason(event.target.value);
                      }}
                      placeholder="Lý do cập nhật trạng thái (không bắt buộc)"
                      className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none"
                      rows={3}
                    />

                    <div className="mt-3 flex flex-wrap gap-2">
                      {availableTransitions.map((nextStatus) => (
                        <button
                          key={nextStatus}
                          type="button"
                          disabled={updating}
                          onClick={() => {
                            void handleUpdateStatus(nextStatus);
                          }}
                          className="rounded-md border border-[#ee4d2d] px-3 py-2 text-sm font-semibold text-[#ee4d2d] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Chuyển sang {toStatusLabel(nextStatus)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </section>

              <section className="grid gap-3 xl:grid-cols-2">
                <article className="rounded-md border border-slate-200 bg-white p-4">
                  <h2 className="text-sm font-semibold text-slate-900">Thông tin giao vận</h2>
                  {!shipment ? (
                    <p className="mt-3 text-sm text-slate-500">Chưa có shipment cho đơn hàng này.</p>
                  ) : (
                    <div className="mt-3 space-y-1 text-sm text-slate-700">
                      <p>Đơn vị vận chuyển: {shipment.provider}</p>
                      <p>Trạng thái shipment: {shipment.status}</p>
                      <p>AWB: {shipment.awb ?? 'N/A'}</p>
                      <p>Tracking: {shipment.trackingNumber ?? 'N/A'}</p>
                      <p>Mã người mua: {formatCustomerCode(shipment.buyerId)}</p>
                      <p>Mã seller: {formatSellerCode(shipment.sellerId)}</p>
                      <p>Người nhận: {shipment.recipientName}</p>
                      <p>SĐT: {shipment.recipientPhone}</p>
                      <p>Địa chỉ: {shipment.recipientAddress}</p>
                    </div>
                  )}
                </article>

                <article className="rounded-md border border-slate-200 bg-white p-4">
                  <h2 className="text-sm font-semibold text-slate-900">Lịch sử tracking</h2>
                  {!tracking || tracking.events.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">Chưa có tracking event.</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {tracking.events.map((eventItem) => (
                        <div key={eventItem.id} className="rounded-md border border-slate-200 p-3 text-sm">
                          <p className="font-semibold text-slate-800">{eventItem.status}</p>
                          <p className="text-slate-600">{eventItem.description ?? 'Không có mô tả'}</p>
                          <p className="text-xs text-slate-500">{formatDateTime(eventItem.occurredAt)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </section>

              <section className="rounded-md border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-slate-900">Lịch sử trạng thái đơn hàng</h2>
                {!history || history.histories.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">Chưa có lịch sử trạng thái.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {history.histories.map((item) => (
                      <div key={item.id} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
                        <p className="font-semibold text-slate-800">
                          {item.fromStatus ? toStatusLabel(item.fromStatus) : 'Khởi tạo'} → {toStatusLabel(item.toStatus)}
                        </p>
                        <p className="text-slate-600">
                          Bởi: {item.changedBy} ({item.changedByRole})
                        </p>
                        <p className="text-slate-500">{item.reason || 'Không có ghi chú'}</p>
                        <p className="text-xs text-slate-500">{formatDateTime(item.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
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
