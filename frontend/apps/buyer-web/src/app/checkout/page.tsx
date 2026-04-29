'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { createBuyerOrder } from '@/lib/api/orders';
import { createBuyerPaymentIntent } from '@/lib/api/payments';
import { BuyerApiClientError } from '@/lib/api/client';
import { formatPrice } from '@/lib/price';
import { isValidProductId } from '@/lib/product-id';
import type { CreateOrderItemInput } from '@/lib/api/types';
import type { CartItem } from '@/providers/AppProvider';
import { useAuth, useCart, useLanguage } from '@/providers/AppProvider';

type PaymentMethod = 'cod' | 'online';

function buildLoginRedirectUrl(path: string): string {
  return `/login?returnUrl=${encodeURIComponent(path)}`;
}

function normalizeSku(rawSku: string | null, productId: string): string {
  if (rawSku && rawSku.trim().length > 0) {
    return rawSku.trim().slice(0, 64);
  }

  return `SKU-${productId.slice(0, 8).toUpperCase()}`;
}

function normalizeCurrency(rawCurrency: string): string {
  const normalized = rawCurrency.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : 'USD';
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toCreateOrderItem(item: CartItem): CreateOrderItemInput | null {
  const productId = item.productId.trim();
  if (!isValidProductId(productId)) {
    return null;
  }

  const quantity = Number.isFinite(item.quantity) ? Math.floor(item.quantity) : NaN;
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
    return null;
  }

  return {
    productId,
    sku: normalizeSku(item.sku, productId),
    productName: item.title.trim().slice(0, 255),
    quantity,
    unitPrice: roundMoney(item.unitPrice)
  };
}

function buildIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `payment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { text } = useLanguage();
  const { ready: authReady, user, accessToken } = useAuth();
  const { ready: cartReady, items, cartTotal, clearCart } = useCart();

  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const ready = authReady && cartReady;
  const orderCurrency = items[0]?.currency ? normalizeCurrency(items[0].currency) : 'USD';
  const shippingAmount = 0;
  const discountAmount = 0;
  const totalDue = roundMoney(cartTotal + shippingAmount - discountAmount);

  useEffect(() => {
    if (!user) {
      return;
    }

    setRecipientName(user.name);
    setRecipientPhone(user.phone);
    setRecipientAddress(user.address);
  }, [user]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!user || !accessToken) {
      router.replace(buildLoginRedirectUrl('/checkout'));
    }
  }, [accessToken, ready, router, user]);

  const canSubmit = useMemo(
    () => !isSubmitting && items.length > 0 && recipientName.trim().length > 0 && recipientPhone.trim().length > 0 && recipientAddress.trim().length > 0,
    [isSubmitting, items.length, recipientAddress, recipientName, recipientPhone]
  );

  const handlePlaceOrder = async () => {
    if (!canSubmit) {
      if (items.length > 0) {
        setFeedback(text.checkout.addressRequired);
      }
      return;
    }

    if (!user || !accessToken) {
      setFeedback(text.checkout.loginRequired);
      router.push(buildLoginRedirectUrl('/checkout'));
      return;
    }

    const currencies = new Set(items.map((item) => normalizeCurrency(item.currency)));
    if (currencies.size !== 1) {
      setFeedback(text.checkout.invalidData);
      return;
    }

    const orderItems = items.map((item) => toCreateOrderItem(item)).filter((item): item is CreateOrderItemInput => item !== null);
    if (orderItems.length !== items.length) {
      setFeedback(text.checkout.invalidData);
      return;
    }

    setFeedback('');
    setIsSubmitting(true);

    try {
      const createdOrder = await createBuyerOrder({
        accessToken,
        idempotencyKey: buildIdempotencyKey(),
        payload: {
          currency: orderCurrency,
          shippingAmount,
          discountAmount,
          note: note.trim().length > 0 ? note.trim() : undefined,
          items: orderItems
        }
      });

      let nextFeedback = text.checkout.orderSuccess;

      if (paymentMethod === 'online' && createdOrder.totalAmount > 0) {
        try {
          await createBuyerPaymentIntent({
            accessToken,
            idempotencyKey: buildIdempotencyKey(),
            payload: {
              orderId: createdOrder.id,
              currency: createdOrder.currency,
              amount: createdOrder.totalAmount,
              description: `Payment for order ${createdOrder.orderNumber}`
            }
          });

          nextFeedback = `${text.checkout.orderSuccess} ${text.checkout.paymentIntentSuccess}`;
        } catch {
          nextFeedback = text.checkout.paymentIntentFailed;
        }
      }

      clearCart();
      setFeedback(nextFeedback);
      router.push('/orders');
    } catch (error) {
      if (error instanceof BuyerApiClientError) {
        if (error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN' || error.code === 'HTTP_401' || error.code === 'HTTP_403') {
          setFeedback(text.checkout.loginRequired);
          router.push(buildLoginRedirectUrl('/checkout'));
          return;
        }

        setFeedback(error.message || text.cart.checkoutFailed);
      } else {
        setFeedback(text.cart.checkoutFailed);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center bg-app-bg text-slate-700">{text.product.loading}</div>
    );
  }

  if (!user || !accessToken) {
    return <div className="min-h-screen grid place-items-center bg-app-bg text-slate-700">{text.product.loading}</div>;
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-app-bg text-slate-900">
        <Header keywords={[]} />
        <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-3 py-4 md:px-4 md:py-6">
          <section className="rounded-md bg-white p-6 text-center shadow-card">
            <p className="text-sm text-slate-600">{text.checkout.empty}</p>
            <Link href="/cart" className="mt-4 inline-flex rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white">
              {text.checkout.goCart}
            </Link>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app-bg text-slate-900">
      <Header keywords={[]} />

      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-3 py-4 md:px-4 md:py-6">
        <section className="rounded-md bg-white p-4 shadow-card md:p-6">
          <h1 className="text-2xl font-semibold text-slate-900">{text.checkout.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{text.checkout.subtitle}</p>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <article className="rounded-md border border-slate-200 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{text.checkout.sectionAddress}</h2>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-500">{text.checkout.recipientName}</span>
                    <input
                      value={recipientName}
                      onChange={(event) => setRecipientName(event.target.value)}
                      className="h-10 rounded-md border border-slate-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-500">{text.checkout.recipientPhone}</span>
                    <input
                      value={recipientPhone}
                      onChange={(event) => setRecipientPhone(event.target.value)}
                      className="h-10 rounded-md border border-slate-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
                    />
                  </label>
                </div>

                <label className="mt-3 flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500">{text.checkout.recipientAddress}</span>
                  <textarea
                    rows={3}
                    value={recipientAddress}
                    onChange={(event) => setRecipientAddress(event.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                  />
                </label>
              </article>

              <article className="rounded-md border border-slate-200 p-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{text.checkout.paymentMethod}</h2>

                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={paymentMethod === 'cod'}
                      onChange={() => setPaymentMethod('cod')}
                      className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span>{text.checkout.paymentCod}</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={paymentMethod === 'online'}
                      onChange={() => setPaymentMethod('online')}
                      className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span>{text.checkout.paymentOnline}</span>
                  </label>
                </div>
              </article>

              <label className="flex flex-col gap-1 rounded-md border border-slate-200 p-4">
                <span className="text-xs font-medium text-slate-500">{text.checkout.note}</span>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                />
              </label>
            </div>

            <aside className="h-fit rounded-md border border-slate-200 bg-slate-50 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{text.checkout.summary}</h2>

              <div className="mt-3 space-y-3">
                {items.map((item) => (
                  <article key={item.productId} className="flex items-center gap-3 rounded-md bg-white p-2">
                    <img src={item.image} alt={item.title} className="h-12 w-12 rounded border border-slate-200 object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm text-slate-800">{item.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">x{item.quantity}</p>
                    </div>
                    <p className="text-sm font-semibold text-slate-700">{formatPrice(item.unitPrice * item.quantity, item.currency)}</p>
                  </article>
                ))}
              </div>

              <div className="mt-4 space-y-2 border-t border-slate-200 pt-3 text-sm text-slate-600">
                <p className="flex items-center justify-between">
                  <span>{text.checkout.shippingFee}</span>
                  <span>{formatPrice(shippingAmount, orderCurrency)}</span>
                </p>
                <p className="flex items-center justify-between">
                  <span>{text.checkout.discount}</span>
                  <span>-{formatPrice(discountAmount, orderCurrency)}</span>
                </p>
                <p className="flex items-center justify-between text-base font-semibold text-slate-900">
                  <span>{text.checkout.total}</span>
                  <span className="text-brand-600">{formatPrice(totalDue, orderCurrency)}</span>
                </p>
              </div>

              {feedback ? <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{feedback}</p> : null}

              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => {
                  void handlePlaceOrder();
                }}
                className="mt-4 h-11 w-full rounded-md bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSubmitting ? text.checkout.placingOrder : text.checkout.placeOrder}
              </button>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}
