'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { fetchProductDetail } from '@/lib/api/products';
import type { ProductDetailVariant } from '@/lib/api/types';
import { formatPrice } from '@/lib/price';
import type { CartItem } from '@/providers/AppProvider';
import { useAuth, useCart, useLanguage } from '@/providers/AppProvider';

function buildLoginRedirectUrl(path: string): string {
  return `/login?returnUrl=${encodeURIComponent(path)}`;
}

function normalizeCurrency(rawCurrency: string): string {
  const normalized = rawCurrency.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : 'USD';
}

export default function CartPage() {
  const router = useRouter();
  const { text, locale } = useLanguage();
  const { ready: authReady, user, accessToken } = useAuth();
  const { ready: cartReady, items, setItemQuantity, updateCartItem, removeFromCart, clearCart } = useCart();

  const [feedback, setFeedback] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [didTouchSelection, setDidTouchSelection] = useState(false);
  const [variantDialogItem, setVariantDialogItem] = useState<CartItem | null>(null);
  const [variantOptions, setVariantOptions] = useState<ProductDetailVariant[]>([]);
  const [variantSelectedSku, setVariantSelectedSku] = useState<string | null>(null);
  const [isVariantLoading, setIsVariantLoading] = useState(false);
  const [variantError, setVariantError] = useState('');

  const ready = cartReady && authReady;
  const orderCurrency = items[0]?.currency ? normalizeCurrency(items[0].currency) : 'USD';
  const selectedIdSet = useMemo(() => new Set(selectedProductIds), [selectedProductIds]);
  const selectedItems = useMemo(() => items.filter((item) => selectedIdSet.has(item.productId)), [items, selectedIdSet]);
  const selectedCount = selectedItems.length;
  const selectedQuantity = selectedItems.reduce((total, item) => total + item.quantity, 0);
  const selectedSubtotal = selectedItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
  const allSelected = items.length > 0 && selectedProductIds.length === items.length;
  const variantUiText =
    locale === 'vi'
      ? {
          label: 'Phân loại',
          change: 'Đổi phân loại',
          back: 'Trở lại',
          confirm: 'Xác nhận',
          loading: 'Đang tải phân loại...',
          loadFailed: 'Không tải được phân loại sản phẩm.'
        }
      : {
          label: 'Variant',
          change: 'Change variant',
          back: 'Back',
          confirm: 'Confirm',
          loading: 'Loading variants...',
          loadFailed: 'Cannot load product variants.'
        };
  const selectedVariant = useMemo(
    () => variantOptions.find((variant) => variant.sku === variantSelectedSku) ?? null,
    [variantOptions, variantSelectedSku]
  );

  useEffect(() => {
    if (items.length === 0) {
      setSelectedProductIds([]);
      setDidTouchSelection(false);
      return;
    }

    const validIds = new Set(items.map((item) => item.productId));
    setSelectedProductIds((current) => {
      const filtered = current.filter((id) => validIds.has(id));
      if (!didTouchSelection && filtered.length === 0) {
        return items.map((item) => item.productId);
      }
      return filtered;
    });
  }, [didTouchSelection, items]);

  const toggleSelectItem = (productId: string) => {
    setDidTouchSelection(true);
    setSelectedProductIds((current) => (current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]));
  };

  const toggleSelectAll = () => {
    if (items.length === 0) {
      return;
    }
    setDidTouchSelection(true);
    setSelectedProductIds(allSelected ? [] : items.map((item) => item.productId));
  };

  const handleCheckout = () => {
    if (items.length === 0) {
      return;
    }

    if (selectedCount === 0) {
      setFeedback(text.cart.empty);
      return;
    }

    setFeedback('');

    if (!user || !accessToken) {
      setFeedback(text.cart.checkoutLoginRequired);
      router.push(buildLoginRedirectUrl('/checkout'));
      return;
    }

    router.push('/checkout');
  };

  const handleOpenVariantDialog = async (item: CartItem) => {
    setVariantDialogItem(item);
    setVariantOptions([]);
    setVariantSelectedSku(item.sku);
    setVariantError('');
    setIsVariantLoading(true);

    try {
      const detail = await fetchProductDetail(item.productId);
      const variants = detail.variants ?? [];
      setVariantOptions(variants);
      const matched = variants.find((variant) => variant.sku === item.sku);
      const fallback = variants.find((variant) => variant.isDefault) ?? variants[0] ?? null;
      setVariantSelectedSku((matched ?? fallback)?.sku ?? item.sku);
    } catch {
      setVariantError(variantUiText.loadFailed);
    } finally {
      setIsVariantLoading(false);
    }
  };

  const handleCloseVariantDialog = () => {
    setVariantDialogItem(null);
    setVariantOptions([]);
    setVariantSelectedSku(null);
    setIsVariantLoading(false);
    setVariantError('');
  };

  const handleConfirmVariantDialog = () => {
    if (!variantDialogItem || !selectedVariant) {
      return;
    }

    const nextStock = extractStockFromRecord(selectedVariant.metadata) ?? variantDialogItem.stock;
    const result = updateCartItem(variantDialogItem.productId, {
      sku: selectedVariant.sku,
      unitPrice: selectedVariant.price,
      currency: selectedVariant.currency,
      stock: nextStock
    });

    if (!result.ok) {
      setFeedback(result.message ?? variantUiText.loadFailed);
      return;
    }

    if (result.message) {
      setFeedback(result.message);
    } else {
      setFeedback('');
    }
    handleCloseVariantDialog();
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
              <div className="hidden items-center rounded-sm border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 md:flex">
                <div className="w-[42%]">
                  <button type="button" onClick={toggleSelectAll} className="inline-flex items-center gap-2">
                    <span className={`inline-flex h-4 w-4 items-center justify-center rounded-sm border ${allSelected ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 bg-white'}`}>
                      {allSelected ? 'x' : ''}
                    </span>
                    <span className="font-medium text-slate-800">Sản phẩm</span>
                  </button>
                </div>
                <div className="w-[14.5%] text-center">{text.cart.price}</div>
                <div className="w-[14.5%] text-center">{text.cart.quantity}</div>
                <div className="w-[14.5%] text-center">{text.cart.subtotal}</div>
                <div className="w-[14.5%] text-center">Thao tác</div>
              </div>

              <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
                <div className="flex items-center border-b border-slate-100 px-4 py-3">
                  <span className="mr-2 inline-flex rounded bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold text-white">Mall</span>
                  <span className="text-sm font-semibold text-slate-800">E-Mall Official</span>
                </div>

                {items.map((item) => {
                  const maxStock = item.stock === null ? null : Math.max(1, item.stock);
                  const canIncrease = maxStock === null || item.quantity < maxStock;
                  const canDecrease = item.quantity > 1;
                  const isSelected = selectedIdSet.has(item.productId);

                  return (
                    <article key={item.productId} className="grid gap-3 border-b border-slate-100 p-3 md:grid-cols-[42%_14.5%_14.5%_14.5%_14.5%] md:items-center md:px-4 md:py-4">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => toggleSelectItem(item.productId)}
                          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${isSelected ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 bg-white'}`}
                        >
                          {isSelected ? 'x' : ''}
                        </button>
                        <img src={item.image} alt={item.title} className="h-20 w-20 rounded border border-slate-200 object-cover" />
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm font-semibold text-slate-800">{item.title}</p>
                          <button
                            type="button"
                            onClick={() => void handleOpenVariantDialog(item)}
                            className="mt-1 text-left text-xs text-slate-500 hover:text-brand-600"
                          >
                            {variantUiText.label}: <span className="font-medium">{item.sku ?? 'N/A'}</span>
                          </button>
                          {item.stock !== null ? <p className="mt-1 text-xs text-slate-500">{text.product.stock}: {item.stock}</p> : null}
                        </div>
                      </div>

                      <div className="text-sm text-slate-700 md:text-center">{formatPrice(item.unitPrice, item.currency)}</div>

                      <div className="text-sm text-slate-700 md:text-center">
                        <div className="inline-flex items-center rounded border border-slate-300">
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

                      <div className="text-sm font-semibold text-brand-600 md:text-center">{formatPrice(item.unitPrice * item.quantity, item.currency)}</div>

                      <div className="md:text-center">
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.productId)}
                          className="text-sm font-medium text-red-600 hover:text-red-700"
                        >
                          {text.cart.remove}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </section>

              {feedback ? <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{feedback}</p> : null}

              <div className="sticky bottom-2 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-orange-200 bg-orange-50 px-4 py-3">
                <button type="button" onClick={toggleSelectAll} className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <span className={`inline-flex h-4 w-4 items-center justify-center rounded-sm border ${allSelected ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 bg-white'}`}>
                    {allSelected ? 'x' : ''}
                  </span>
                  Chọn tất cả ({items.length})
                </button>
                <div className="ml-auto text-right">
                  <p className="text-sm text-slate-600">
                    {text.cart.subtotal}: <span className="font-medium text-slate-800">{formatPrice(selectedSubtotal, orderCurrency)}</span>
                  </p>
                  <p className="text-lg font-semibold text-slate-900">
                    {text.cart.total}: <span className="text-brand-600">{formatPrice(selectedSubtotal, orderCurrency)}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleCheckout();
                  }}
                  className="h-11 rounded-md bg-brand-500 px-5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={selectedCount === 0}
                >
                  {text.cart.checkout} ({selectedQuantity})
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </main>

      {variantDialogItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-3">
          <div className="w-full max-w-[560px] rounded bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <p className="text-base font-semibold text-slate-900">{variantUiText.change}</p>
              <p className="mt-1 line-clamp-2 text-sm text-slate-600">{variantDialogItem.title}</p>
            </div>

            <div className="max-h-[52vh] overflow-y-auto px-5 py-4">
              {isVariantLoading ? <p className="text-sm text-slate-600">{variantUiText.loading}</p> : null}
              {variantError ? <p className="text-sm text-red-600">{variantError}</p> : null}

              {!isVariantLoading && !variantError && variantOptions.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-700">{variantUiText.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {variantOptions.map((variant) => {
                      const active = variant.sku === variantSelectedSku;
                      return (
                        <button
                          key={variant.sku}
                          type="button"
                          onClick={() => setVariantSelectedSku(variant.sku)}
                          className={`rounded border px-3 py-2 text-sm transition ${
                            active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-700 hover:border-brand-300'
                          }`}
                        >
                          <span className="block">{variant.name}</span>
                          <span className="mt-1 block text-xs">{formatPrice(variant.price, variant.currency)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={handleCloseVariantDialog}
                className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400"
              >
                {variantUiText.back}
              </button>
              <button
                type="button"
                onClick={handleConfirmVariantDialog}
                disabled={isVariantLoading || !selectedVariant}
                className="rounded bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {variantUiText.confirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function extractStockFromRecord(
  source?: Record<string, string | number | boolean | null>
): number | null {
  if (!source) {
    return null;
  }

  const candidates = [source.stock, source.inventory, source.availableStock, source.availableQuantity, source.quantity];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) {
      return Math.floor(candidate);
    }
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      const parsed = Number(candidate.trim());
      if (Number.isFinite(parsed) && parsed >= 0) {
        return Math.floor(parsed);
      }
    }
  }

  return null;
}
