'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { BuyerApiClientError } from '@/lib/api/client';
import { fetchProductDetail } from '@/lib/api/products';
import { isValidProductId } from '@/lib/product-id';
import type { ProductDetail } from '@/lib/api/types';
import { useCart, useLanguage } from '@/providers/AppProvider';

type ProductPageStatus = 'loading' | 'error' | 'invalid-id' | 'not-found' | 'success';

interface ProductDetailPageProps {
  params: {
    productId: string;
  };
}

function formatPrice(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export default function ProductDetailPage({ params }: ProductDetailPageProps) {
  const router = useRouter();
  const { text } = useLanguage();
  const { addToCart } = useCart();

  const rawProductId = params.productId ?? '';
  const productId = useMemo(() => {
    try {
      return decodeURIComponent(rawProductId).trim();
    } catch {
      return '';
    }
  }, [rawProductId]);

  const [status, setStatus] = useState<ProductPageStatus>('loading');
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState('');

  const maxQuantity = useMemo(() => {
    if (!product || product.stock === null) {
      return 99;
    }

    return Math.max(1, product.stock);
  }, [product]);

  const loadProduct = useCallback(async () => {
    if (!isValidProductId(productId)) {
      setStatus('invalid-id');
      setProduct(null);
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      const detail = await fetchProductDetail(productId);
      setProduct(detail);
      setQuantity(1);
      setStatus('success');
    } catch (error) {
      if (error instanceof BuyerApiClientError) {
        if (error.code === 'INVALID_PRODUCT_ID') {
          setStatus('invalid-id');
          setProduct(null);
          return;
        }

        if (error.code === 'PRODUCT_NOT_FOUND' || error.code === 'HTTP_404') {
          setStatus('not-found');
          setProduct(null);
          return;
        }

        setErrorMessage(error.message);
      } else {
        setErrorMessage(text.product.loadError);
      }

      setStatus('error');
      setProduct(null);
    }
  }, [productId, text.product.loadError]);

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  const handleQuantityChange = (next: number) => {
    if (!Number.isFinite(next) || next <= 0) {
      setQuantity(1);
      return;
    }

    setQuantity(Math.min(maxQuantity, Math.max(1, Math.floor(next))));
  };

  const handleAddToCart = () => {
    if (!product) {
      return;
    }

    const result = addToCart(
      {
        productId: product.id,
        title: product.title,
        image: product.image,
        unitPrice: product.price,
        stock: product.stock,
        sku: product.defaultSku,
        currency: product.currency
      },
      quantity
    );

    setNotice(result.message ?? (result.ok ? text.product.addedToCart : text.product.loadError));
  };

  const handleBuyNow = () => {
    if (!product) {
      return;
    }

    const result = addToCart(
      {
        productId: product.id,
        title: product.title,
        image: product.image,
        unitPrice: product.price,
        stock: product.stock,
        sku: product.defaultSku,
        currency: product.currency
      },
      quantity
    );

    if (!result.ok) {
      setNotice(result.message ?? text.product.loadError);
      return;
    }

    router.push('/checkout');
  };

  const isOutOfStock = product ? product.stock !== null && product.stock <= 0 : false;

  return (
    <div className="min-h-screen bg-app-bg text-slate-900">
      <Header keywords={[]} />

      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-3 py-4 md:px-4 md:py-6">
        {status === 'loading' ? (
          <section className="rounded-md bg-white p-6 text-center shadow-card">
            <p className="text-sm text-slate-600">{text.product.loading}</p>
          </section>
        ) : null}

        {status === 'invalid-id' ? (
          <section className="rounded-md bg-white p-6 text-center shadow-card">
            <p className="text-sm text-red-600">{text.product.invalidId}</p>
            <Link href="/" className="mt-3 inline-flex rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white">
              {text.cart.continueShopping}
            </Link>
          </section>
        ) : null}

        {status === 'not-found' ? (
          <section className="rounded-md bg-white p-6 text-center shadow-card">
            <p className="text-sm text-red-600">{text.product.notFound}</p>
            <Link href="/" className="mt-3 inline-flex rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white">
              {text.cart.continueShopping}
            </Link>
          </section>
        ) : null}

        {status === 'error' ? (
          <section className="rounded-md bg-white p-6 text-center shadow-card">
            <p className="text-sm text-red-600">{errorMessage || text.product.loadError}</p>
            <button
              type="button"
              className="mt-3 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
              onClick={() => {
                void loadProduct();
              }}
            >
              {text.product.retry}
            </button>
          </section>
        ) : null}

        {status === 'success' && product ? (
          <section className="rounded-md bg-white p-4 shadow-card md:p-6">
            <div className="mb-4 text-sm text-slate-500">
              <Link href="/" className="font-medium text-brand-600 hover:text-brand-700">
                Home
              </Link>{' '}
              / <span>{product.title}</span>
            </div>

            <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
              <div className="space-y-3">
                <img src={product.image} alt={product.title} className="h-[420px] w-full rounded-md border border-slate-200 object-cover" />
                <div className="grid grid-cols-4 gap-2">
                  {product.images.slice(0, 4).map((image, index) => (
                    <img
                      key={`${image}-${index}`}
                      src={image}
                      alt={`${product.title} ${index + 1}`}
                      className="h-20 w-full rounded border border-slate-200 object-cover"
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <h1 className="text-2xl font-semibold leading-tight text-slate-900">{product.title}</h1>

                <div className="rounded-md bg-slate-50 p-4">
                  <p className="text-3xl font-bold text-brand-600">{formatPrice(product.price, product.currency)}</p>
                  {product.compareAtPrice && product.compareAtPrice > product.price ? (
                    <p className="mt-1 text-sm text-slate-500 line-through">
                      {formatPrice(product.compareAtPrice, product.currency)}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2 text-sm text-slate-700">
                  <p>
                    <span className="font-semibold">{text.product.description}: </span>
                    <span>{product.description}</span>
                  </p>
                  <p>
                    <span className="font-semibold">{text.product.stock}: </span>
                    <span>
                      {product.stock === null
                        ? text.product.stockUnknown
                        : product.stock > 0
                          ? `${product.stock}`
                          : text.product.stockOut}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold text-slate-700">{text.product.quantity}</span>
                  <div className="inline-flex items-center rounded-md border border-slate-300">
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(quantity - 1)}
                      className="h-10 w-10 border-r border-slate-300 text-lg text-slate-700"
                      aria-label="Decrease quantity"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={maxQuantity}
                      value={quantity}
                      onChange={(event) => {
                        handleQuantityChange(Number(event.target.value));
                      }}
                      className="h-10 w-16 border-0 text-center text-sm font-semibold focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(quantity + 1)}
                      className="h-10 w-10 border-l border-slate-300 text-lg text-slate-700"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                </div>

                {notice ? <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{notice}</p> : null}

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    disabled={Boolean(isOutOfStock)}
                    className="h-11 rounded-md border border-brand-500 px-6 text-sm font-semibold text-brand-600 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
                  >
                    {text.product.addToCart}
                  </button>
                  <button
                    type="button"
                    onClick={handleBuyNow}
                    disabled={Boolean(isOutOfStock)}
                    className="h-11 rounded-md bg-brand-500 px-6 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {text.product.buyNow}
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
