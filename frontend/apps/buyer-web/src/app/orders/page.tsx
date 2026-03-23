'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { BuyerApiClientError } from '@/lib/api/client';
import { cancelBuyerOrder, confirmBuyerOrderReceived, fetchBuyerOrders } from '@/lib/api/orders';
import { fetchBuyerPaymentByOrderId } from '@/lib/api/payments';
import { fetchBuyerShipmentByOrderId } from '@/lib/api/shipping';
import type {
  Order,
  OrderItem,
  OrderListOutput,
  OrderStatus,
  Payment,
  PaymentStatus,
  Shipment,
  ShipmentStatus
} from '@/lib/api/types';
import { useAuth, useCart, useLanguage } from '@/providers/AppProvider';

type OrdersTabKey = 'all' | 'pending' | 'shipping' | 'waiting-delivery' | 'completed' | 'cancelled' | 'return-refund';
type FetchStatus = 'idle' | 'loading' | 'success' | 'error';

const FALLBACK_SHOP_NAME = 'Market Mall';
const validOrderStatusSet: Set<OrderStatus> = new Set([
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'FAILED'
]);
const validShipmentStatusSet: Set<ShipmentStatus> = new Set([
  'PENDING',
  'AWB_CREATED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'FAILED',
  'RETURNED'
]);

function formatPrice(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function buildLoginRedirectUrl(path: string): string {
  return `/login?returnUrl=${encodeURIComponent(path)}`;
}

function buildItemImage(productId: string): string {
  return `https://picsum.photos/seed/order-${encodeURIComponent(productId)}/120/120`;
}

function normalizeCurrency(raw: unknown): string {
  if (typeof raw !== 'string') {
    return 'USD';
  }

  const normalized = raw.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : 'USD';
}

function toOrderStatus(raw: unknown): OrderStatus {
  if (typeof raw === 'string' && validOrderStatusSet.has(raw as OrderStatus)) {
    return raw as OrderStatus;
  }

  return 'FAILED';
}

function sanitizeItem(raw: unknown): OrderItem | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Partial<OrderItem>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const productId = typeof record.productId === 'string' ? record.productId.trim() : '';
  const sku = typeof record.sku === 'string' && record.sku.trim().length > 0 ? record.sku.trim() : `SKU-${productId.slice(0, 8)}`;
  const productName = typeof record.productName === 'string' ? record.productName.trim() : '';
  const quantity = typeof record.quantity === 'number' && Number.isFinite(record.quantity) ? Math.max(1, Math.floor(record.quantity)) : 1;
  const unitPrice =
    typeof record.unitPrice === 'number' && Number.isFinite(record.unitPrice) && record.unitPrice >= 0 ? record.unitPrice : 0;
  const totalPrice =
    typeof record.totalPrice === 'number' && Number.isFinite(record.totalPrice) && record.totalPrice >= 0
      ? record.totalPrice
      : unitPrice * quantity;

  if (!id || !productId || !productName) {
    return null;
  }

  return {
    id,
    productId,
    sku,
    productName,
    quantity,
    unitPrice,
    totalPrice
  };
}

function sanitizeOrder(raw: unknown): Order | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Partial<Order>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const orderNumber = typeof record.orderNumber === 'string' ? record.orderNumber.trim() : '';
  const userId = typeof record.userId === 'string' ? record.userId.trim() : '';
  const status = toOrderStatus(record.status);
  const currency = normalizeCurrency(record.currency);
  const subtotalAmount = typeof record.subtotalAmount === 'number' && Number.isFinite(record.subtotalAmount) ? record.subtotalAmount : 0;
  const shippingAmount = typeof record.shippingAmount === 'number' && Number.isFinite(record.shippingAmount) ? record.shippingAmount : 0;
  const discountAmount = typeof record.discountAmount === 'number' && Number.isFinite(record.discountAmount) ? record.discountAmount : 0;
  const totalAmount = typeof record.totalAmount === 'number' && Number.isFinite(record.totalAmount) ? record.totalAmount : 0;
  const note = typeof record.note === 'string' ? record.note : null;
  const createdAt = typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString();
  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : createdAt;
  const items = Array.isArray(record.items)
    ? record.items.map((item) => sanitizeItem(item)).filter((item): item is OrderItem => item !== null)
    : [];

  if (!id || !orderNumber || !userId) {
    return null;
  }

  return {
    id,
    orderNumber,
    userId,
    status,
    currency,
    subtotalAmount,
    shippingAmount,
    discountAmount,
    totalAmount,
    note,
    createdAt,
    updatedAt,
    items
  };
}

function sanitizeOrdersResponse(raw: OrderListOutput): Order[] {
  if (!raw || !Array.isArray(raw.items)) {
    return [];
  }

  return raw.items.map((order) => sanitizeOrder(order)).filter((order): order is Order => order !== null);
}

function formatOrderDate(rawDate: string, locale: 'vi' | 'en'): string {
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

function statusLabel(status: OrderStatus, localeText: ReturnType<typeof useLanguage>['text']): string {
  const dictionary: Record<OrderStatus, string> = {
    PENDING: localeText.orders.statusPending,
    CONFIRMED: localeText.orders.statusConfirmed,
    PROCESSING: localeText.orders.statusProcessing,
    SHIPPED: localeText.orders.statusShipped,
    DELIVERED: localeText.orders.statusDelivered,
    CANCELLED: localeText.orders.statusCancelled,
    FAILED: localeText.orders.statusFailed
  };

  return dictionary[status] ?? status;
}

function paymentStatusLabel(status: PaymentStatus, localeText: ReturnType<typeof useLanguage>['text']): string {
  const dictionary: Record<PaymentStatus, string> = {
    PENDING: localeText.orders.paymentPending,
    REQUIRES_ACTION: localeText.orders.paymentRequiresAction,
    AUTHORIZED: localeText.orders.paymentAuthorized,
    CAPTURED: localeText.orders.paymentCaptured,
    FAILED: localeText.orders.paymentFailed,
    CANCELLED: localeText.orders.paymentCancelled,
    PARTIALLY_REFUNDED: localeText.orders.paymentPartiallyRefunded,
    REFUNDED: localeText.orders.paymentRefunded,
    CHARGEBACK: localeText.orders.paymentChargeback
  };

  return dictionary[status] ?? status;
}

function toShipmentStatus(raw: unknown): ShipmentStatus {
  if (typeof raw === 'string' && validShipmentStatusSet.has(raw as ShipmentStatus)) {
    return raw as ShipmentStatus;
  }

  return 'FAILED';
}

function sanitizeShipment(raw: unknown): Shipment | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Partial<Shipment>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const orderId = typeof record.orderId === 'string' ? record.orderId.trim() : '';
  const buyerId = typeof record.buyerId === 'string' ? record.buyerId.trim() : '';
  const sellerId = typeof record.sellerId === 'string' ? record.sellerId.trim() : '';

  if (!id || !orderId || !buyerId || !sellerId) {
    return null;
  }

  return {
    id,
    orderId,
    buyerId,
    sellerId,
    provider: typeof record.provider === 'string' ? record.provider.trim() : '',
    awb: typeof record.awb === 'string' ? record.awb : null,
    trackingNumber: typeof record.trackingNumber === 'string' ? record.trackingNumber : null,
    status: toShipmentStatus(record.status),
    currency: normalizeCurrency(record.currency),
    shippingFee: typeof record.shippingFee === 'number' && Number.isFinite(record.shippingFee) ? record.shippingFee : 0,
    codAmount: typeof record.codAmount === 'number' && Number.isFinite(record.codAmount) ? record.codAmount : 0,
    recipientName: typeof record.recipientName === 'string' ? record.recipientName : '',
    recipientPhone: typeof record.recipientPhone === 'string' ? record.recipientPhone : '',
    recipientAddress: typeof record.recipientAddress === 'string' ? record.recipientAddress : '',
    note: typeof record.note === 'string' ? record.note : null,
    metadata: record.metadata && typeof record.metadata === 'object' ? (record.metadata as Record<string, unknown>) : null,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString()
  };
}

function shipmentStatusLabel(status: ShipmentStatus, localeText: ReturnType<typeof useLanguage>['text']): string {
  const dictionary: Record<ShipmentStatus, string> = {
    PENDING: localeText.orders.shipmentPending,
    AWB_CREATED: localeText.orders.shipmentAwbCreated,
    PICKED_UP: localeText.orders.shipmentPickedUp,
    IN_TRANSIT: localeText.orders.shipmentInTransit,
    OUT_FOR_DELIVERY: localeText.orders.shipmentOutForDelivery,
    DELIVERED: localeText.orders.shipmentDelivered,
    CANCELLED: localeText.orders.shipmentCancelled,
    FAILED: localeText.orders.shipmentFailed,
    RETURNED: localeText.orders.shipmentReturned
  };

  return dictionary[status] ?? status;
}

function getBackendStatusForTab(tab: OrdersTabKey): OrderStatus | null {
  if (tab === 'pending') {
    return 'PENDING';
  }

  return null;
}

function matchesTab(order: Order, payment: Payment | null | undefined, shipment: Shipment | null | undefined, tab: OrdersTabKey): boolean {
  if (tab === 'all') {
    return true;
  }

  if (tab === 'pending') {
    return order.status === 'PENDING';
  }

  if (tab === 'shipping') {
    if (order.status === 'CONFIRMED' || order.status === 'PROCESSING') {
      return true;
    }

    return shipment?.status === 'PENDING' || shipment?.status === 'AWB_CREATED' || shipment?.status === 'PICKED_UP';
  }

  if (tab === 'waiting-delivery') {
    if (order.status === 'SHIPPED') {
      return true;
    }

    return shipment?.status === 'IN_TRANSIT' || shipment?.status === 'OUT_FOR_DELIVERY';
  }

  if (tab === 'completed') {
    return order.status === 'DELIVERED' || shipment?.status === 'DELIVERED';
  }

  if (tab === 'cancelled') {
    if (order.status === 'CANCELLED' || order.status === 'FAILED') {
      return true;
    }

    return shipment?.status === 'CANCELLED' || shipment?.status === 'FAILED' || shipment?.status === 'RETURNED';
  }

  return payment?.status === 'PARTIALLY_REFUNDED' || payment?.status === 'REFUNDED' || payment?.status === 'CHARGEBACK' || shipment?.status === 'RETURNED';
}

export default function OrdersPage() {
  const router = useRouter();
  const { locale, text } = useLanguage();
  const { ready, user, accessToken } = useAuth();
  const { addToCart } = useCart();

  const [fetchStatus, setFetchStatus] = useState<FetchStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [activeTab, setActiveTab] = useState<OrdersTabKey>('all');
  const [orders, setOrders] = useState<Order[]>([]);
  const [paymentsByOrderId, setPaymentsByOrderId] = useState<Record<string, Payment | null>>({});
  const [shipmentsByOrderId, setShipmentsByOrderId] = useState<Record<string, Shipment | null>>({});
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);
  const [isShipmentLoading, setIsShipmentLoading] = useState(false);
  const [actingOrderId, setActingOrderId] = useState<string | null>(null);
  const requestRef = useRef(0);

  const loadOrders = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    const backendStatus = getBackendStatusForTab(activeTab);

    setFetchStatus('loading');
    setErrorMessage('');

    try {
      const payload = await fetchBuyerOrders({
        accessToken,
        params: {
          page: 1,
          pageSize: 100,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
          ...(backendStatus ? { status: backendStatus } : {})
        }
      });

      if (requestRef.current !== requestId) {
        return;
      }

      const sanitizedOrders = sanitizeOrdersResponse(payload);
      setOrders(sanitizedOrders);
      setFetchStatus('success');
      setPaymentsByOrderId({});
      setShipmentsByOrderId({});
      setIsPaymentLoading(false);
      setIsShipmentLoading(false);

      if (sanitizedOrders.length === 0) {
        return;
      }

      setIsPaymentLoading(true);
      setIsShipmentLoading(true);
      const [paymentEntries, shipmentEntries] = await Promise.all([
        Promise.all(
          sanitizedOrders.map(async (order) => {
            try {
              const payment = await fetchBuyerPaymentByOrderId({
                accessToken,
                orderId: order.id
              });
              return [order.id, payment] as const;
            } catch (error) {
              if (error instanceof BuyerApiClientError) {
                if (error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN' || error.code === 'HTTP_401' || error.code === 'HTTP_403') {
                  throw error;
                }

                if (error.code === 'PAYMENT_NOT_FOUND' || error.code === 'NOT_FOUND' || error.code === 'HTTP_404') {
                  return [order.id, null] as const;
                }
              }

              return [order.id, null] as const;
            }
          })
        ),
        Promise.all(
          sanitizedOrders.map(async (order) => {
            try {
              const shipment = await fetchBuyerShipmentByOrderId({
                accessToken,
                orderId: order.id
              });
              return [order.id, sanitizeShipment(shipment)] as const;
            } catch (error) {
              if (error instanceof BuyerApiClientError) {
                if (error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN' || error.code === 'HTTP_401' || error.code === 'HTTP_403') {
                  throw error;
                }

                if (error.code === 'SHIPMENT_NOT_FOUND' || error.code === 'NOT_FOUND' || error.code === 'HTTP_404') {
                  return [order.id, null] as const;
                }
              }

              return [order.id, null] as const;
            }
          })
        )
      ]);

      if (requestRef.current !== requestId) {
        return;
      }

      setPaymentsByOrderId(Object.fromEntries(paymentEntries));
      setShipmentsByOrderId(Object.fromEntries(shipmentEntries));
      setIsPaymentLoading(false);
      setIsShipmentLoading(false);
    } catch (error) {
      if (error instanceof BuyerApiClientError) {
        if (error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN' || error.code === 'HTTP_401' || error.code === 'HTTP_403') {
          router.replace(buildLoginRedirectUrl('/orders'));
          return;
        }

        setErrorMessage(error.message);
      } else {
        setErrorMessage(text.product.loadError);
      }

      setFetchStatus('error');
      setIsPaymentLoading(false);
      setIsShipmentLoading(false);
    }
  }, [accessToken, activeTab, router, text.product.loadError]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!user || !accessToken) {
      router.replace(buildLoginRedirectUrl('/orders'));
      return;
    }

    void loadOrders();
  }, [accessToken, loadOrders, ready, router, user]);

  const visibleOrders = useMemo(() => {
    const keyword = searchValue.trim().toLowerCase();

    return orders.filter((order) => {
      const payment = paymentsByOrderId[order.id];
      const shipment = shipmentsByOrderId[order.id];

      if (!matchesTab(order, payment, shipment, activeTab)) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      if (order.orderNumber.toLowerCase().includes(keyword)) {
        return true;
      }

      if (FALLBACK_SHOP_NAME.toLowerCase().includes(keyword)) {
        return true;
      }

      return order.items.some((item) => item.productName.toLowerCase().includes(keyword));
    });
  }, [activeTab, orders, paymentsByOrderId, searchValue, shipmentsByOrderId]);

  const tabs: Array<{ key: OrdersTabKey; label: string }> = [
    { key: 'all', label: text.orders.all },
    { key: 'pending', label: text.orders.pendingPayment },
    { key: 'shipping', label: text.orders.shipping },
    { key: 'waiting-delivery', label: text.orders.waitingDelivery },
    { key: 'completed', label: text.orders.completed },
    { key: 'cancelled', label: text.orders.cancelled },
    { key: 'return-refund', label: text.orders.returnRefund }
  ];

  const handleCancelOrder = async (orderId: string) => {
    if (!accessToken || actingOrderId) {
      return;
    }

    setActingOrderId(orderId);
    setNotice('');

    try {
      await cancelBuyerOrder({
        accessToken,
        orderId,
        payload: {
          reason: 'Cancelled by customer'
        }
      });
      setNotice(text.orders.cancelSuccess);
      await loadOrders();
    } catch (error) {
      if (error instanceof BuyerApiClientError) {
        setNotice(error.message || text.orders.actionFailed);
      } else {
        setNotice(text.orders.actionFailed);
      }
    } finally {
      setActingOrderId(null);
    }
  };

  const handleConfirmReceived = async (orderId: string) => {
    if (!accessToken || actingOrderId) {
      return;
    }

    setActingOrderId(orderId);
    setNotice('');

    try {
      await confirmBuyerOrderReceived({ accessToken, orderId });
      setNotice(text.orders.confirmSuccess);
      await loadOrders();
    } catch (error) {
      if (error instanceof BuyerApiClientError) {
        setNotice(error.message || text.orders.actionFailed);
      } else {
        setNotice(text.orders.actionFailed);
      }
    } finally {
      setActingOrderId(null);
    }
  };

  const handleBuyAgain = (order: Order) => {
    for (const item of order.items) {
      addToCart(
        {
          productId: item.productId,
          title: item.productName,
          image: buildItemImage(item.productId),
          unitPrice: item.unitPrice,
          stock: null,
          sku: item.sku,
          currency: order.currency
        },
        item.quantity
      );
    }

    router.push('/cart');
  };

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center bg-app-bg text-slate-700">{text.orders.loading}</div>
    );
  }

  if (!user || !accessToken) {
    return (
      <div className="min-h-screen grid place-items-center bg-app-bg text-slate-700">{text.orders.loginRequired}</div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-slate-900">
      <Header keywords={[]} />

      <main className="mx-auto w-full max-w-[1200px] px-3 pb-8 pt-5 md:px-4 md:pb-10 md:pt-6">
        <section className="space-y-3 rounded-sm bg-white p-3 shadow-card md:p-4">
          <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">{text.orders.title}</h1>
          <p className="text-sm text-slate-600">{text.orders.subtitle}</p>

          <div className="overflow-x-auto border-b border-slate-200">
            <div className="flex min-w-max items-center gap-5">
              {tabs.map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`border-b-2 px-1 pb-2 pt-1 text-[15px] transition ${
                      active ? 'border-brand-500 font-semibold text-brand-600' : 'border-transparent text-slate-700 hover:text-brand-600'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-sm bg-slate-100 p-2">
            <input
              type="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={text.orders.searchPlaceholder}
              className="h-10 w-full rounded-sm border border-transparent bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
            />
          </div>

          {notice ? <p className="rounded-sm bg-slate-100 px-3 py-2 text-sm text-slate-700">{notice}</p> : null}

          {fetchStatus === 'loading' ? <p className="py-8 text-center text-sm text-slate-600">{text.orders.loading}</p> : null}

          {fetchStatus === 'error' ? (
            <div className="py-8 text-center">
              <p className="text-sm text-red-600">{errorMessage || text.product.loadError}</p>
              <button
                type="button"
                onClick={() => {
                  void loadOrders();
                }}
                className="mt-3 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white"
              >
                {text.orders.retry}
              </button>
            </div>
          ) : null}

          {fetchStatus === 'success' && visibleOrders.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-600">{text.orders.empty}</p>
          ) : null}

          {fetchStatus === 'success' && visibleOrders.length > 0 ? (
            <div className="space-y-4">
              {visibleOrders.map((order) => {
                const canCancel = order.status === 'PENDING' || order.status === 'CONFIRMED';
                const canConfirmReceived = order.status === 'SHIPPED';
                const canBuyAgain = order.status === 'DELIVERED';
                const payment = paymentsByOrderId[order.id];
                const shipment = shipmentsByOrderId[order.id];
                const paymentLabel =
                  payment === undefined && isPaymentLoading
                    ? '...'
                    : payment
                      ? paymentStatusLabel(payment.status, text)
                      : text.orders.paymentMissing;
                const shipmentLabel =
                  shipment === undefined && isShipmentLoading
                    ? '...'
                    : shipment
                      ? shipmentStatusLabel(shipment.status, text)
                      : text.orders.shipmentMissing;
                const shipmentCode = shipment?.trackingNumber?.trim() || shipment?.awb?.trim() || '';

                return (
                  <article key={order.id} className="overflow-hidden rounded-sm border border-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 text-sm md:px-4">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex rounded bg-brand-500 px-1.5 py-0.5 text-xs font-semibold text-white">Mall</span>
                        <span className="font-semibold text-slate-800">{FALLBACK_SHOP_NAME}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500">
                          {text.orders.orderCode}: <span className="font-medium text-slate-700">{order.orderNumber}</span>
                        </span>
                        <span className="text-slate-500">
                          {text.orders.paymentLabel}: <span className="font-medium text-slate-700">{paymentLabel}</span>
                        </span>
                        <span className="text-slate-500">
                          {text.orders.shipmentLabel}: <span className="font-medium text-slate-700">{shipmentLabel}</span>
                        </span>
                        <span className="font-semibold text-brand-600">{statusLabel(order.status, text)}</span>
                      </div>
                    </div>

                    <div className="space-y-3 px-3 py-3 md:px-4">
                      {order.items.length === 0 ? <p className="text-sm text-slate-500">{text.orders.noItem}</p> : null}

                      {order.items.map((item) => (
                        <div key={item.id} className="grid gap-3 border-b border-dashed border-slate-200 pb-3 last:border-b-0 last:pb-0 md:grid-cols-[72px_minmax(0,1fr)_auto] md:items-center">
                          <img src={buildItemImage(item.productId)} alt={item.productName} className="h-16 w-16 rounded border border-slate-200 object-cover" />

                          <div>
                            <p className="line-clamp-2 text-sm text-slate-800">{item.productName}</p>
                            <p className="mt-1 text-xs text-slate-500">SKU: {item.sku}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {text.orders.quantity}: x{item.quantity}
                            </p>
                          </div>

                          <div className="text-right text-sm">
                            <p className="text-slate-500 line-through">{formatPrice(item.unitPrice * 1.1, order.currency)}</p>
                            <p className="font-semibold text-brand-600">{formatPrice(item.totalPrice, order.currency)}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-3 bg-slate-50 px-3 py-3 md:px-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
                        <p>
                          {text.orders.orderedAt}: {formatOrderDate(order.createdAt, locale)}
                        </p>
                        <p className="text-base font-semibold text-slate-800">
                          {text.orders.total}: <span className="text-brand-600">{formatPrice(order.totalAmount, order.currency)}</span>
                        </p>
                      </div>

                      {shipmentCode ? (
                        <p className="text-xs text-slate-500">
                          {shipment?.provider ? `${shipment.provider} - ` : ''}
                          {shipmentCode}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap justify-end gap-2">
                        <Link
                          href={`/orders/${encodeURIComponent(order.id)}`}
                          className="inline-flex h-10 items-center rounded-sm border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:border-brand-500 hover:text-brand-600"
                        >
                          {text.orders.actionDetail}
                        </Link>

                        {payment && payment.status === 'REQUIRES_ACTION' && payment.requiresActionUrl ? (
                          <a
                            href={payment.requiresActionUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-10 items-center rounded-sm border border-brand-500 px-4 text-sm font-semibold text-brand-600 hover:bg-brand-50"
                          >
                            {text.orders.paymentAction}
                          </a>
                        ) : null}

                        {canCancel ? (
                          <button
                            type="button"
                            disabled={actingOrderId === order.id}
                            onClick={() => {
                              void handleCancelOrder(order.id);
                            }}
                            className="h-10 rounded-sm border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:border-brand-500 hover:text-brand-600 disabled:cursor-not-allowed disabled:text-slate-400"
                          >
                            {text.orders.actionCancel}
                          </button>
                        ) : null}

                        {canConfirmReceived ? (
                          <button
                            type="button"
                            disabled={actingOrderId === order.id}
                            onClick={() => {
                              void handleConfirmReceived(order.id);
                            }}
                            className="h-10 rounded-sm bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            {text.orders.actionConfirmReceived}
                          </button>
                        ) : null}

                        {canBuyAgain ? (
                          <button
                            type="button"
                            onClick={() => {
                              handleBuyAgain(order);
                            }}
                            className="h-10 rounded-sm bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
                          >
                            {text.orders.actionBuyAgain}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
