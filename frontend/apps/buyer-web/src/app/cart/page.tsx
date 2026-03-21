'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { BuyerApiClientError } from '@/lib/api/client';
import { createBuyerOrder } from '@/lib/api/orders';
import { useAuth, useCart, useLanguage } from '@/providers/AppProvider';

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

function buildIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `order-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function CartPage() {
  const router = useRouter();
  const { text } = useLanguage();
  const { ready: authReady, user, accessToken } = useAuth();
  const { ready: cartReady, items, cartTotal, setItemQuantity, removeFromCart, clearCart } = useCart();

  const [feedback, setFeedback] = useState('');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  const ready = cartReady && authReady;
  const orderCurrency = items[0]?.currency ? normalizeCurrency(items[0].currency) : 'USD';

  const handleCheckout = async () => {
    if (items.length === 0 || isPlacingOrder) {
      return;
    }

    setFeedback('');

    if (!user || !accessToken) {
      setFeedback(text.cart.checkoutLoginRequired);
      router.push(buildLoginRedirectUrl('/cart'));
      return;
    }

    const orderItems = items
      .filter((item) => item.productId.trim().length > 0)
      .map((item) => ({
        productId: item.productId,
        sku: normalizeSku(item.sku, item.productId),
        productName: item.title.slice(0, 255),
        quantity: item.quantity,
        unitPrice: item.unitPrice
      }));

    if (orderItems.length === 0) {
      setFeedback(text.orders.invalidData);
      return;
    }

    setIsPlacingOrder(true);

    try {
      await createBuyerOrder({
        accessToken,
        idempotencyKey: buildIdempotencyKey(),
        payload: {
          currency: orderCurrency,
          items: orderItems
        }
      });

      clearCart();
      setFeedback(text.cart.orderPlaced);
      router.push('/orders');
    } catch (error) {
      if (error instanceof BuyerApiClientError) {
        if (error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN' || error.code === 'HTTP_401' || error.code === 'HTTP_403') {
          setFeedback(text.cart.checkoutLoginRequired);
          router.push(buildLoginRedirectUrl('/cart'));
          return;
        }

        setFeedback(error.message || text.cart.checkoutFailed);
      } else {
        setFeedback(text.cart.checkoutFailed);
      }
    } finally {
      setIsPlacingOrder(false);
    }
  };

  return (
    <div className="min-h-screen bg-app-bg text-slate-900">
      <Header keywords={[]} />

      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-3 py-4 md:px-4 md:py-6">
        <section className="rounded-md bg-white p-4 shadow-card md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <h1 className="text-2xl font-semibold text-slate-900">{text.cart.title}</h1>

            {items.length > 0 ? (
              <button
                type="button"
                onClick={clearCart}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-brand-500 hover:text-brand-600"
              >
                {text.cart.clear}
              </button>
            ) : null}
          </div>

          {!ready ? <p className="py-8 text-center text-sm text-slate-600">{text.product.loading}</p> : null}

          {ready && items.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-600">{text.cart.empty}</p>
              <Link href="/" className="mt-4 inline-flex rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white">
                {text.cart.continueShopping}
              </Link>
            </div>
          ) : null}

          {ready && items.length > 0 ? (
            <div className="space-y-3">
              {items.map((item) => {
                const maxStock = item.stock === null ? null : Math.max(1, item.stock);
                const canIncrease = maxStock === null || item.quantity < maxStock;
                const canDecrease = item.quantity > 1;

                return (
                  <article
                    key={item.productId}
                    className="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-[84px_minmax(0,1fr)_140px_180px_120px_auto] md:items-center"
                  >
                    <img src={item.image} alt={item.title} className="h-20 w-20 rounded border border-slate-200 object-cover" />

                    <div>
                      <p className="line-clamp-2 text-sm font-semibold text-slate-800">{item.title}</p>
                      {item.stock !== null ? (
                        <p className="mt-1 text-xs text-slate-500">
                          {text.product.stock}: {item.stock}
                        </p>
                      ) : null}
                    </div>

                    <div className="text-sm text-slate-700">
                      <p className="font-semibold">{text.cart.price}</p>
                      <p className="mt-1">{formatPrice(item.unitPrice, item.currency)}</p>
                    </div>

                    <div className="text-sm text-slate-700">
                      <p className="mb-1 font-semibold">{text.cart.quantity}</p>
                      <div className="inline-flex items-center rounded-md border border-slate-300">
                        <button
                          type="button"
                          disabled={!canDecrease}
                          onClick={() => {
                            setItemQuantity(item.productId, item.quantity - 1);
                          }}
                          className="h-8 w-8 border-r border-slate-300 text-base disabled:cursor-not-allowed disabled:text-slate-300"
                          aria-label="Decrease quantity"
                        >
                          -
                        </button>
                        <span className="inline-flex h-8 min-w-10 items-center justify-center px-2 text-sm font-semibold">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          disabled={!canIncrease}
                          onClick={() => {
                            setItemQuantity(item.productId, item.quantity + 1);
                          }}
                          className="h-8 w-8 border-l border-slate-300 text-base disabled:cursor-not-allowed disabled:text-slate-300"
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="text-sm text-slate-700">
                      <p className="font-semibold">{text.cart.subtotal}</p>
                      <p className="mt-1 font-semibold text-brand-600">{formatPrice(item.unitPrice * item.quantity, item.currency)}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeFromCart(item.productId)}
                      className="justify-self-start rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:border-red-400"
                    >
                      {text.cart.remove}
                    </button>
                  </article>
                );
              })}

              {feedback ? <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{feedback}</p> : null}

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <p className="text-lg font-semibold text-slate-900">
                  {text.cart.total}: <span className="text-brand-600">{formatPrice(cartTotal, orderCurrency)}</span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void handleCheckout();
                  }}
                  disabled={isPlacingOrder}
                  className="h-11 rounded-md bg-brand-500 px-5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isPlacingOrder ? text.cart.placingOrder : text.cart.checkout}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
