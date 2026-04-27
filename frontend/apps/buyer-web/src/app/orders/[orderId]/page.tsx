'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { BuyerApiClientError } from '@/lib/api/client';
import {
  fetchBuyerOrderById,
  fetchBuyerOrderStatusHistory
} from '@/lib/api/orders';
import { fetchBuyerPaymentByOrderId } from '@/lib/api/payments';
import { formatPrice } from '@/lib/price';
import {
  fetchBuyerShipmentByOrderId,
  fetchBuyerShipmentTrackingEvents
} from '@/lib/api/shipping';
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

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-slate-900">
      <Header keywords={[]} />

      <main className="mx-auto w-full max-w-[1200px] space-y-4 px-3 pb-8 pt-5 md:px-4 md:pb-10 md:pt-6">
        <section className="rounded-md bg-white p-4 shadow-card md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">{text.orders.detailTitle}</h1>
              <p className="mt-1 text-sm text-slate-600">{text.orders.detailSubtitle}</p>
            </div>

            <Link
              href="/orders"
              className="inline-flex h-10 items-center rounded-sm border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:border-brand-500 hover:text-brand-600"
            >
              {text.orders.backToOrders}
            </Link>
          </div>

          <div className="mt-4 grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 md:grid-cols-2">
            <p>
              {text.orders.orderCode}: <span className="font-semibold text-slate-900">{order.orderNumber}</span>
            </p>
            <p>
              {text.orders.orderedAt}: {formatDateTime(order.createdAt, locale)}
            </p>
            <p>
              {text.orders.paymentLabel}:{' '}
              <span className="font-semibold text-slate-900">
                {payment ? paymentStatusLabel(payment.status, text) : text.orders.paymentMissing}
              </span>
            </p>
            <p>
              {text.orders.shipmentLabel}:{' '}
              <span className="font-semibold text-slate-900">
                {shipment ? shipmentStatusLabel(shipment.status, text) : text.orders.shipmentMissing}
              </span>
            </p>
            {trackingCode ? (
              <p className="md:col-span-2">
                {text.orders.trackingCode}: {trackingCode}
              </p>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <article className="rounded-md bg-white p-4 shadow-card md:p-6">
            <h2 className="text-base font-semibold text-slate-900">{text.orders.sectionItems}</h2>

            <div className="mt-4 space-y-3">
              {order.items.length === 0 ? <p className="text-sm text-slate-500">{text.orders.noItem}</p> : null}

              {order.items.map((item) => (
                <div key={item.id} className="grid gap-2 border-b border-dashed border-slate-200 pb-3 last:border-b-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div>
                    <p className="line-clamp-2 text-sm text-slate-800">{item.productName}</p>
                    <p className="mt-1 text-xs text-slate-500">SKU: {item.sku}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {text.orders.quantity}: x{item.quantity}
                    </p>
                  </div>
                  <p className="text-right text-sm font-semibold text-brand-600">
                    {formatPrice(item.totalPrice, orderCurrency)}
                  </p>
                </div>
              ))}
            </div>
          </article>

          <div className="space-y-4">
            <article className="rounded-md bg-white p-4 shadow-card md:p-6">
              <h2 className="text-base font-semibold text-slate-900">{text.orders.sectionSummary}</h2>

              <div className="mt-4 space-y-2 text-sm text-slate-700">
                <div className="flex items-center justify-between">
                  <span>{text.orders.subtotal}</span>
                  <span>{formatPrice(order.subtotalAmount, orderCurrency)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{text.orders.shipping}</span>
                  <span>{formatPrice(order.shippingAmount, orderCurrency)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{text.orders.discount}</span>
                  <span>{formatPrice(order.discountAmount, orderCurrency)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
                  <span>{text.orders.total}</span>
                  <span className="text-brand-600">{formatPrice(order.totalAmount, orderCurrency)}</span>
                </div>
                {order.note ? (
                  <p className="pt-1 text-xs text-slate-500">
                    {text.orders.note}: {order.note}
                  </p>
                ) : null}
              </div>
            </article>

            <article className="rounded-md bg-white p-4 shadow-card md:p-6">
              <h2 className="text-base font-semibold text-slate-900">{text.orders.sectionShipment}</h2>

              {!shipment ? <p className="mt-3 text-sm text-slate-500">{text.orders.shipmentMissing}</p> : null}

              {shipment ? (
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p>
                    {text.orders.recipient}: {shipment.recipientName}
                  </p>
                  <p>{shipment.recipientPhone}</p>
                  <p>{shipment.recipientAddress}</p>
                  <p>
                    {text.orders.shipmentLabel}: {shipmentStatusLabel(shipment.status, text)}
                  </p>
                </div>
              ) : null}

              {payment && payment.status === 'REQUIRES_ACTION' && payment.requiresActionUrl ? (
                <a
                  href={payment.requiresActionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex h-10 items-center rounded-sm border border-brand-500 px-4 text-sm font-semibold text-brand-600 hover:bg-brand-50"
                >
                  {text.orders.paymentAction}
                </a>
              ) : null}
            </article>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-md bg-white p-4 shadow-card md:p-6">
            <h2 className="text-base font-semibold text-slate-900">{text.orders.sectionOrderHistory}</h2>

            {histories.length === 0 ? <p className="mt-4 text-sm text-slate-500">{text.orders.noHistory}</p> : null}

            {histories.length > 0 ? (
              <div className="mt-4 space-y-3">
                {histories.map((history) => (
                  <div key={history.id} className="rounded-md border border-slate-200 p-3 text-sm">
                    <p className="font-semibold text-slate-800">{orderStatusLabel(history.toStatus, text)}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(history.createdAt, locale)}</p>
                    {history.reason ? <p className="mt-1 text-slate-600">{history.reason}</p> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </article>

          <article className="rounded-md bg-white p-4 shadow-card md:p-6">
            <h2 className="text-base font-semibold text-slate-900">{text.orders.sectionTracking}</h2>

            {trackingEvents.length === 0 ? <p className="mt-4 text-sm text-slate-500">{text.orders.noTracking}</p> : null}

            {trackingEvents.length > 0 ? (
              <div className="mt-4 space-y-3">
                {trackingEvents.map((event) => (
                  <div key={event.id} className="rounded-md border border-slate-200 p-3 text-sm">
                    <p className="font-semibold text-slate-800">{shipmentStatusLabel(event.status, text)}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(event.occurredAt, locale)}</p>
                    {event.description ? <p className="mt-1 text-slate-600">{event.description}</p> : null}
                    {event.location ? <p className="mt-1 text-xs text-slate-500">{event.location}</p> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        </section>
      </main>
    </div>
  );
}
