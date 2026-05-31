'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Header } from '@/components/layout/Header';
import { BuyerApiClientError } from '@/lib/api/client';
import {
  fetchBuyerOrderById,
  fetchBuyerOrderStatusHistory
} from '@/lib/api/orders';
import { fetchBuyerPaymentByOrderId } from '@/lib/api/payments';
import { formatPrice } from '@/lib/price';
import { formatOrderCode } from '@/lib/order-codes';
import {
  fetchBuyerShipmentByOrderId,
  fetchBuyerShipmentTrackingEvents
} from '@/lib/api/shipping';
import { fetchProductDetail } from '@/lib/api/products';
import type {
  Order,
  OrderStatus,
  OrderStatusHistoryItem,
  Payment,
  PaymentStatus,
  Shipment,
  ShipmentStatus,
  ShipmentTrackingEvent
} from '@/lib/api/types';
import { useAuth, useLanguage } from '@/providers/AppProvider';

type FetchStatus = 'idle' | 'loading' | 'success' | 'error';

const ORDER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORDER_IMAGE_PLACEHOLDER =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" fill="%23f1f5f9"/><path d="M35 78h50L71 58l-10 12-8-9-18 17Z" fill="%23cbd5e1"/><circle cx="48" cy="44" r="8" fill="%23cbd5e1"/></svg>';

function formatDateTime(rawDate: string, locale: 'vi' | 'en'): string {
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function buildLoginRedirectUrl(path: string): string {
  return `/login?returnUrl=${encodeURIComponent(path)}`;
}

function normalizeCurrency(raw: unknown): string {
  if (typeof raw !== 'string') {
    return 'USD';
  }

  const normalized = raw.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : 'USD';
}

function orderStatusLabel(status: OrderStatus, text: ReturnType<typeof useLanguage>['text']): string {
  const dictionary: Record<OrderStatus, string> = {
    PENDING: text.orders.statusPending,
    CONFIRMED: text.orders.statusConfirmed,
    PROCESSING: text.orders.statusProcessing,
    SHIPPED: text.orders.statusShipped,
    DELIVERED: text.orders.statusDelivered,
    CANCELLED: text.orders.statusCancelled,
    FAILED: text.orders.statusFailed
  };

  return dictionary[status] ?? status;
}

function displayOrderStatusLabel(order: Order, payment: Payment | null, text: ReturnType<typeof useLanguage>['text']): string {
  if (order.status === 'PENDING' && order.paymentMethod === 'ONLINE' && payment?.status === 'CAPTURED') {
    return text.orders.statusAwaitingConfirmation;
  }

  return orderStatusLabel(order.status, text);
}

function orderStatusTone(order: Order, payment: Payment | null): string {
  if (order.status === 'FAILED' || order.status === 'CANCELLED') {
    return 'bg-red-50 text-red-700 ring-red-200';
  }
  if (order.status === 'DELIVERED') {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  }
  if (order.status === 'PENDING' && order.paymentMethod === 'ONLINE' && payment?.status === 'CAPTURED') {
    return 'bg-amber-50 text-amber-700 ring-amber-200';
  }
  if (order.status === 'CONFIRMED' || order.status === 'PROCESSING' || order.status === 'SHIPPED') {
    return 'bg-blue-50 text-blue-700 ring-blue-200';
  }
  return 'bg-slate-100 text-slate-700 ring-slate-200';
}

function paymentStatusLabel(status: PaymentStatus, text: ReturnType<typeof useLanguage>['text']): string {
  const dictionary: Record<PaymentStatus, string> = {
    PENDING: text.orders.paymentPending,
    REQUIRES_ACTION: text.orders.paymentRequiresAction,
    AUTHORIZED: text.orders.paymentAuthorized,
    CAPTURED: text.orders.paymentCaptured,
    FAILED: text.orders.paymentFailed,
    CANCELLED: text.orders.paymentCancelled,
    PARTIALLY_REFUNDED: text.orders.paymentPartiallyRefunded,
    REFUNDED: text.orders.paymentRefunded,
    CHARGEBACK: text.orders.paymentChargeback
  };

  return dictionary[status] ?? status;
}

function paymentStatusTone(status: PaymentStatus | undefined): string {
  switch (status) {
    case 'CAPTURED':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'FAILED':
    case 'CANCELLED':
    case 'CHARGEBACK':
      return 'bg-red-50 text-red-700 ring-red-200';
    case 'AUTHORIZED':
    case 'PARTIALLY_REFUNDED':
    case 'REFUNDED':
      return 'bg-blue-50 text-blue-700 ring-blue-200';
    default:
      return 'bg-amber-50 text-amber-700 ring-amber-200';
  }
}

function canContinueOnlinePayment(order: Order, payment: Payment | null): boolean {
  if (order.paymentMethod !== 'ONLINE' || order.status !== 'PENDING') {
    return false;
  }
  if (payment === null) {
    return true;
  }
  return payment.status === 'PENDING' || payment.status === 'REQUIRES_ACTION' || payment.status === 'AUTHORIZED';
}

function shipmentStatusLabel(status: ShipmentStatus, text: ReturnType<typeof useLanguage>['text']): string {
  const dictionary: Record<ShipmentStatus, string> = {
    PENDING: text.orders.shipmentPending,
    AWB_CREATED: text.orders.shipmentAwbCreated,
    PICKED_UP: text.orders.shipmentPickedUp,
    IN_TRANSIT: text.orders.shipmentInTransit,
    OUT_FOR_DELIVERY: text.orders.shipmentOutForDelivery,
    DELIVERED: text.orders.shipmentDelivered,
    CANCELLED: text.orders.shipmentCancelled,
    FAILED: text.orders.shipmentFailed,
    RETURNED: text.orders.shipmentReturned
  };

  return dictionary[status] ?? status;
}

function buildProgressItems(order: Order, payment: Payment | null, shipment: Shipment | null, text: ReturnType<typeof useLanguage>['text']) {
  const paymentDone = order.paymentMethod === 'COD' || payment?.status === 'CAPTURED';
  const confirmedDone = order.status === 'CONFIRMED' || order.status === 'PROCESSING' || order.status === 'SHIPPED' || order.status === 'DELIVERED';
  const shippedDone =
    order.status === 'SHIPPED' ||
    order.status === 'DELIVERED' ||
    shipment?.status === 'IN_TRANSIT' ||
    shipment?.status === 'OUT_FOR_DELIVERY' ||
    shipment?.status === 'DELIVERED';
  const deliveredDone = order.status === 'DELIVERED' || shipment?.status === 'DELIVERED';

  const steps = [
    { label: text.orders.statusPlaced, done: true },
    { label: order.paymentMethod === 'COD' ? text.checkout.paymentCod : text.orders.paymentLabel, done: paymentDone },
    { label: text.orders.statusConfirmed, done: confirmedDone },
    { label: text.orders.statusShipped, done: shippedDone },
    { label: text.orders.statusDelivered, done: deliveredDone }
  ];

  const firstPendingIndex = steps.findIndex((step) => !step.done);
  return steps.map((step, index) => ({
    ...step,
    current: firstPendingIndex === index || (firstPendingIndex === -1 && index === steps.length - 1)
  }));
}

function normalizeOrderId(raw: string): string {
  try {
    return decodeURIComponent(raw ?? '').trim();
  } catch {
    return '';
  }
}

function normalizeHistory(items: OrderStatusHistoryItem[] | undefined): OrderStatusHistoryItem[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      ...item,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString()
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function normalizeTracking(items: ShipmentTrackingEvent[] | undefined): ShipmentTrackingEvent[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      ...item,
      occurredAt: typeof item.occurredAt === 'string' ? item.occurredAt : new Date().toISOString()
    }))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}

export default function OrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const router = useRouter();
  const { locale, text } = useLanguage();
  const { ready, user, accessToken } = useAuth();

  const [fetchStatus, setFetchStatus] = useState<FetchStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [histories, setHistories] = useState<OrderStatusHistoryItem[]>([]);
  const [trackingEvents, setTrackingEvents] = useState<ShipmentTrackingEvent[]>([]);
  const [productImagesById, setProductImagesById] = useState<Record<string, string>>({});

  const orderId = useMemo(
    () => normalizeOrderId(typeof params?.orderId === 'string' ? params.orderId : ''),
    [params?.orderId]
  );

  const loadDetail = useCallback(async () => {
    if (!accessToken || !ORDER_ID_PATTERN.test(orderId)) {
      return;
    }

    setFetchStatus('loading');
    setErrorMessage('');

    try {
      const [detail, paymentResult, shipmentResult, historyResult] = await Promise.all([
        fetchBuyerOrderById({
          accessToken,
          orderId
        }),
        (async () => {
          try {
            return await fetchBuyerPaymentByOrderId({
              accessToken,
              orderId
            });
          } catch (error) {
            if (error instanceof BuyerApiClientError) {
              if (error.code === 'PAYMENT_NOT_FOUND' || error.code === 'NOT_FOUND' || error.code === 'HTTP_404') {
                return null;
              }
            }

            throw error;
          }
        })(),
        (async () => {
          try {
            return await fetchBuyerShipmentByOrderId({
              accessToken,
              orderId
            });
          } catch (error) {
            if (error instanceof BuyerApiClientError) {
              if (error.code === 'SHIPMENT_NOT_FOUND' || error.code === 'NOT_FOUND' || error.code === 'HTTP_404') {
                return null;
              }
            }

            throw error;
          }
        })(),
        (async () => {
          try {
            return await fetchBuyerOrderStatusHistory({
              accessToken,
              orderId
            });
          } catch (error) {
            if (error instanceof BuyerApiClientError) {
              if (error.code === 'NOT_FOUND' || error.code === 'HTTP_404') {
                return {
                  orderId,
                  histories: []
                };
              }
            }

            throw error;
          }
        })()
      ]);

      let tracking: ShipmentTrackingEvent[] = [];
      if (shipmentResult) {
        try {
          const trackingPayload = await fetchBuyerShipmentTrackingEvents({
            accessToken,
            shipmentId: shipmentResult.id
          });
          tracking = normalizeTracking(trackingPayload.events);
        } catch (error) {
          if (error instanceof BuyerApiClientError) {
            if (error.code !== 'NOT_FOUND' && error.code !== 'HTTP_404') {
              throw error;
            }
          } else {
            throw error;
          }
        }
      }

      setOrder(detail);
      setPayment(paymentResult);
      setShipment(shipmentResult);
      setHistories(normalizeHistory(historyResult.histories));
      setTrackingEvents(tracking);
      setFetchStatus('success');
    } catch (error) {
      if (error instanceof BuyerApiClientError) {
        if (error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN' || error.code === 'HTTP_401' || error.code === 'HTTP_403') {
          router.replace(buildLoginRedirectUrl(`/orders/${encodeURIComponent(orderId)}`));
          return;
        }

        setErrorMessage(error.message);
      } else {
        setErrorMessage(text.product.loadError);
      }

      setFetchStatus('error');
    }
  }, [accessToken, orderId, router, text.product.loadError]);

  useEffect(() => {
    const productIds = Array.from(new Set(order?.items.map((item) => item.productId.trim()).filter(Boolean) ?? []));
    if (productIds.length === 0) {
      setProductImagesById({});
      return;
    }

    let cancelled = false;

    async function hydrateProductImages() {
      const entries = await Promise.all(
        productIds.map(async (productId) => {
          try {
            const detail = await fetchProductDetail(productId);
            const image = detail.image || detail.images[0] || '';
            return image ? ([productId, image] as const) : null;
          } catch {
            return null;
          }
        })
      );

      if (!cancelled) {
        setProductImagesById(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null)));
      }
    }

    void hydrateProductImages();

    return () => {
      cancelled = true;
    };
  }, [order?.items]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!user || !accessToken) {
      router.replace(buildLoginRedirectUrl(`/orders/${encodeURIComponent(orderId || '')}`));
      return;
    }

    if (!ORDER_ID_PATTERN.test(orderId)) {
      setErrorMessage(text.orders.invalidData);
      setFetchStatus('error');
      return;
    }

    void loadDetail();
  }, [accessToken, loadDetail, orderId, ready, router, text.orders.invalidData, user]);

  if (!ready || fetchStatus === 'loading') {
    return (
      <div className="min-h-screen grid place-items-center bg-app-bg text-slate-700">{text.orders.loading}</div>
    );
  }

  if (!user || !accessToken) {
    return (
      <div className="min-h-screen grid place-items-center bg-app-bg text-slate-700">{text.orders.loginRequired}</div>
    );
  }

  if (fetchStatus === 'error' || !order) {
    return (
      <div className="min-h-screen bg-app-bg text-slate-900">
        <Header keywords={[]} />
        <main className="mx-auto w-full max-w-[1200px] px-3 py-6 md:px-4">
          <div className="rounded-md bg-white p-6 text-center shadow-card">
            <p className="text-sm text-red-600">{errorMessage || text.product.loadError}</p>
            <button
              type="button"
              onClick={() => {
                void loadDetail();
              }}
              className="mt-4 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white"
            >
              {text.orders.retry}
            </button>
          </div>
        </main>
      </div>
    );
  }

  const orderCurrency = normalizeCurrency(order.currency);
  const trackingCode = shipment?.trackingNumber?.trim() || shipment?.awb?.trim() || '';
  const canContinuePayment = canContinueOnlinePayment(order, payment);
  const orderCode = formatOrderCode(order.orderNumber, order.id);
  const itemCount = order.items.reduce((total, item) => total + item.quantity, 0);
  const currentOrderLabel = displayOrderStatusLabel(order, payment, text);
  const currentOrderTone = orderStatusTone(order, payment);
  const paymentLabel =
    order.paymentMethod === 'COD'
      ? text.checkout.paymentCod
      : payment
        ? paymentStatusLabel(payment.status, text)
        : text.orders.paymentMissing;
  const paymentTone = order.paymentMethod === 'COD' ? 'bg-slate-100 text-slate-700 ring-slate-200' : paymentStatusTone(payment?.status);
  const shipmentLabel = shipment ? shipmentStatusLabel(shipment.status, text) : text.orders.shipmentMissing;
  const progressItems = buildProgressItems(order, payment, shipment, text);
  const recipientName = shipment?.recipientName || order.recipientName;
  const recipientPhone = shipment?.recipientPhone || order.recipientPhone;
  const recipientAddress =
    shipment?.recipientAddress ||
    [order.recipientAddress, order.recipientWard, order.recipientDistrict, order.recipientProvince].filter(Boolean).join(', ');
  const updatedAt = formatDateTime(order.updatedAt || order.createdAt, locale);
  const uiText =
    locale === 'vi'
      ? {
          status: 'Trạng thái',
          orderValue: 'Giá trị đơn',
          updatedAt: 'Cập nhật',
          productCount: 'Tổng sản phẩm',
          productTotal: 'Tổng sản phẩm',
          unitPrice: 'Đơn giá',
          paymentMethod: 'Phương thức',
          paidAt: 'Ghi nhận lúc',
          provider: 'Nhà cung cấp',
          shippingFee: 'Phí giao hàng',
          recipientInfo: 'Thông tin nhận hàng',
          noNote: 'Không có ghi chú',
          address: 'Địa chỉ',
          phone: 'Số điện thoại',
          shipmentStatus: 'Trạng thái giao hàng',
          orderStatus: 'Trạng thái đơn',
          paymentStatus: 'Trạng thái thanh toán'
        }
      : {
          status: 'Status',
          orderValue: 'Order value',
          updatedAt: 'Updated',
          productCount: 'Total items',
          productTotal: 'Items total',
          unitPrice: 'Unit price',
          paymentMethod: 'Method',
          paidAt: 'Captured at',
          provider: 'Provider',
          shippingFee: 'Shipping fee',
          recipientInfo: 'Recipient details',
          noNote: 'No note',
          address: 'Address',
          phone: 'Phone',
          shipmentStatus: 'Shipment status',
          orderStatus: 'Order status',
          paymentStatus: 'Payment status'
        };

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-slate-900">
      <Header keywords={[]} />

      <main className="mx-auto w-full max-w-[1200px] space-y-4 px-3 pb-8 pt-5 md:px-4 md:pb-10 md:pt-6">
        <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 md:px-6 md:py-5">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{text.orders.orderCode}</p>
              <h1 className="mt-1 break-all text-2xl font-semibold text-slate-950 md:text-3xl">{orderCode}</h1>
              <p className="mt-2 text-sm text-slate-500">
                {text.orders.orderedAt}: {formatDateTime(order.createdAt, locale)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex h-9 items-center rounded-sm px-3 text-sm font-semibold ring-1 ${currentOrderTone}`}>
                {currentOrderLabel}
              </span>
              <Link
                href="/orders"
                className="inline-flex h-10 items-center rounded-sm border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:border-brand-500 hover:text-brand-600"
              >
                {text.orders.backToOrders}
              </Link>
            </div>
          </div>

          <div className="grid border-b border-slate-200 bg-slate-50 sm:grid-cols-2 lg:grid-cols-4">
            <DetailStat label={uiText.orderValue} value={formatPrice(order.totalAmount, orderCurrency)} valueClassName="text-brand-600" />
            <DetailStat label={uiText.status} value={currentOrderLabel} />
            <DetailStat label={uiText.productCount} value={`${itemCount} ${text.orders.itemCount.toLowerCase()}`} />
            <DetailStat label={uiText.updatedAt} value={updatedAt} />
          </div>

          <div className="px-4 py-5 md:px-6">
            <ProgressTrack items={progressItems} />
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <article className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 md:px-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">{text.orders.sectionItems}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {itemCount} {text.orders.itemCount.toLowerCase()}
                </p>
              </div>
              <span className="rounded-sm bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                {uiText.productTotal}: {formatPrice(order.subtotalAmount, orderCurrency)}
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {order.items.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500 md:px-6">{text.orders.noItem}</p> : null}

              {order.items.map((item) => (
                <div key={item.id} className="grid gap-4 px-4 py-4 sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:items-center md:px-6">
                  <OrderItemImage src={productImagesById[item.productId]} alt={item.productName} />

                  <div className="min-w-0">
                    <p className="line-clamp-2 text-base font-semibold text-slate-900">{item.productName}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                      <span className="rounded-sm bg-slate-100 px-2 py-1">SKU: {item.sku}</span>
                      <span className="rounded-sm bg-slate-100 px-2 py-1">
                        {text.orders.quantity}: x{item.quantity}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-500">
                      {uiText.unitPrice}: {formatPrice(item.unitPrice, orderCurrency)}
                    </p>
                  </div>

                  <div className="text-left sm:text-right">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{text.orders.total}</p>
                    <p className="mt-1 text-lg font-semibold text-brand-600">{formatPrice(item.totalPrice, orderCurrency)}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <article className="rounded-md border border-slate-200 bg-white p-4 shadow-card md:p-5">
              <h2 className="text-lg font-semibold text-slate-950">{text.orders.sectionSummary}</h2>

              <div className="mt-4 space-y-3 text-sm">
                <SummaryRow label={text.orders.subtotal} value={formatPrice(order.subtotalAmount, orderCurrency)} />
                <SummaryRow label={text.orders.shipping} value={formatPrice(order.shippingAmount, orderCurrency)} />
                <SummaryRow label={text.orders.discount} value={formatPrice(order.discountAmount, orderCurrency)} />
                <div className="border-t border-slate-200 pt-3">
                  <SummaryRow
                    label={text.orders.total}
                    value={formatPrice(order.totalAmount, orderCurrency)}
                    strong
                    valueClassName="text-brand-600"
                  />
                </div>
              </div>

              <div className="mt-4 rounded-sm bg-slate-50 px-3 py-3 text-sm text-slate-600">
                <p className="font-semibold text-slate-700">{text.orders.note}</p>
                <p className="mt-1">{order.note?.trim() || uiText.noNote}</p>
              </div>
            </article>

            <article className="rounded-md border border-slate-200 bg-white p-4 shadow-card md:p-5">
              <h2 className="text-lg font-semibold text-slate-950">{text.orders.paymentLabel}</h2>
              <div className="mt-4 space-y-3">
                <InfoRow label={uiText.paymentMethod} value={order.paymentMethod === 'COD' ? text.checkout.paymentCod : text.checkout.paymentOnline} />
                <InfoRow
                  label={uiText.paymentStatus}
                  value={<span className={`inline-flex rounded-sm px-2.5 py-1 text-xs font-semibold ring-1 ${paymentTone}`}>{paymentLabel}</span>}
                />
                {payment?.provider ? <InfoRow label={uiText.provider} value={payment.provider.toUpperCase()} /> : null}
                {payment?.capturedAt ? <InfoRow label={uiText.paidAt} value={formatDateTime(payment.capturedAt, locale)} /> : null}
              </div>

              {canContinuePayment ? (
                <Link
                  href={`/checkout/payment/${encodeURIComponent(order.id)}`}
                  className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-sm bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
                >
                  {text.orders.paymentAction}
                </Link>
              ) : null}

              {payment && payment.status === 'REQUIRES_ACTION' && payment.requiresActionUrl ? (
                <a
                  href={payment.requiresActionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-sm border border-brand-500 px-4 text-sm font-semibold text-brand-600 hover:bg-brand-50"
                >
                  {text.orders.paymentAction}
                </a>
              ) : null}
            </article>

            <article className="rounded-md border border-slate-200 bg-white p-4 shadow-card md:p-5">
              <h2 className="text-lg font-semibold text-slate-950">{uiText.recipientInfo}</h2>
              <div className="mt-4 space-y-3">
                <InfoRow label={text.orders.recipient} value={recipientName} />
                <InfoRow label={uiText.phone} value={recipientPhone} />
                <InfoRow label={uiText.address} value={recipientAddress || text.orders.shipmentMissing} />
                <InfoRow
                  label={uiText.shipmentStatus}
                  value={<span className="inline-flex rounded-sm bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">{shipmentLabel}</span>}
                />
                <InfoRow label={uiText.shippingFee} value={formatPrice(shipment?.shippingFee ?? order.shippingAmount, orderCurrency)} />
                {trackingCode ? <InfoRow label={text.orders.trackingCode} value={trackingCode} /> : null}
              </div>
            </article>
          </aside>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-md border border-slate-200 bg-white p-4 shadow-card md:p-6">
            <h2 className="text-lg font-semibold text-slate-950">{text.orders.sectionOrderHistory}</h2>

            {histories.length === 0 ? <p className="mt-4 text-sm text-slate-500">{text.orders.noHistory}</p> : null}

            {histories.length > 0 ? (
              <ol className="mt-4 space-y-4">
                {histories.map((history) => (
                  <li key={history.id} className="relative border-l border-slate-200 pl-4 text-sm">
                    <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-brand-50" />
                    <p className="font-semibold text-slate-900">{orderStatusLabel(history.toStatus, text)}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(history.createdAt, locale)}</p>
                    {history.reason ? <p className="mt-2 leading-6 text-slate-600">{history.reason}</p> : null}
                  </li>
                ))}
              </ol>
            ) : null}
          </article>

          <article className="rounded-md border border-slate-200 bg-white p-4 shadow-card md:p-6">
            <h2 className="text-lg font-semibold text-slate-950">{text.orders.sectionTracking}</h2>

            {trackingEvents.length === 0 ? <p className="mt-4 text-sm text-slate-500">{text.orders.noTracking}</p> : null}

            {trackingEvents.length > 0 ? (
              <ol className="mt-4 space-y-4">
                {trackingEvents.map((event) => (
                  <li key={event.id} className="relative border-l border-slate-200 pl-4 text-sm">
                    <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-400 ring-4 ring-slate-100" />
                    <p className="font-semibold text-slate-900">{shipmentStatusLabel(event.status, text)}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(event.occurredAt, locale)}</p>
                    {event.description ? <p className="mt-2 leading-6 text-slate-600">{event.description}</p> : null}
                    {event.location ? <p className="mt-1 text-xs text-slate-500">{event.location}</p> : null}
                  </li>
                ))}
              </ol>
            ) : null}
          </article>
        </section>
      </main>
    </div>
  );
}

function DetailStat({
  label,
  value,
  valueClassName = ''
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="border-b border-slate-200 px-4 py-4 last:border-b-0 sm:border-r sm:last:border-r-0 lg:border-b-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-base font-semibold text-slate-950 ${valueClassName}`}>{value}</p>
    </div>
  );
}

function ProgressTrack({
  items
}: {
  items: Array<{
    label: string;
    done: boolean;
    current: boolean;
  }>;
}) {
  return (
    <div className="relative">
      <div className="absolute left-4 right-4 top-4 hidden h-px bg-slate-200 sm:block" />
      <div className="relative grid gap-3 sm:grid-cols-5">
        {items.map((item, index) => {
          const markerClassName = item.done
            ? 'border-brand-500 bg-brand-500 text-white'
            : item.current
              ? 'border-brand-500 bg-white text-brand-600 ring-4 ring-brand-50'
              : 'border-slate-300 bg-white text-slate-400';

          return (
            <div key={`${item.label}-${index}`} className="flex items-center gap-3 sm:block sm:text-center">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold sm:mx-auto ${markerClassName}`}>
                {index + 1}
              </span>
              <p className={`text-sm font-semibold sm:mt-2 ${item.done || item.current ? 'text-slate-900' : 'text-slate-400'}`}>
                {item.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
  valueClassName = ''
}: {
  label: string;
  value: string;
  strong?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 ${strong ? 'text-base font-semibold text-slate-950' : 'text-slate-700'}`}>
      <span>{label}</span>
      <span className={`shrink-0 ${valueClassName}`}>{value}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 text-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="break-words font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function OrderItemImage({ src, alt }: { src?: string; alt: string }) {
  const imageSrc = src?.trim() || ORDER_IMAGE_PLACEHOLDER;

  return (
    <img
      src={imageSrc}
      alt={alt}
      className="h-24 w-24 rounded-sm border border-slate-200 bg-slate-100 object-cover"
      onError={(event) => {
        event.currentTarget.src = ORDER_IMAGE_PLACEHOLDER;
      }}
    />
  );
}
