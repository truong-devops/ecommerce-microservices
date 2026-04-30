'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { BuyerApiClientError } from '@/lib/api/client';
import { fetchBuyerProducts, fetchBuyerShopDetail } from '@/lib/api/products';
import type { BuyerShopDetail, ProductSearchItem } from '@/lib/api/types';
import { formatPrice } from '@/lib/price';

type ShopPageStatus = 'loading' | 'success' | 'error';

interface ShopPageProps {
  params: {
    sellerId: string;
  };
}

export default function BuyerShopPage({ params }: ShopPageProps) {
  const rawSellerId = params.sellerId ?? '';
  const sellerId = useMemo(() => decodeSellerId(rawSellerId), [rawSellerId]);

  const [status, setStatus] = useState<ShopPageStatus>('loading');
  const [shop, setShop] = useState<BuyerShopDetail | null>(null);
  const [products, setProducts] = useState<ProductSearchItem[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!sellerId) {
        setStatus('error');
        setErrorMessage('Invalid shop identifier.');
        return;
      }

      setStatus('loading');
      setErrorMessage('');

      try {
        const [shopResult, productResult] = await Promise.all([
          fetchBuyerShopDetail(sellerId),
          fetchBuyerProducts({ page: 1, pageSize: 12, sellerId, sortBy: 'createdAt', sortOrder: 'DESC' })
        ]);

        if (!active) {
          return;
        }

        setShop(shopResult);
        setProducts(productResult.items);
        setStatus('success');
      } catch (error) {
        if (!active) {
          return;
        }

        if (error instanceof BuyerApiClientError) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage('Cannot load shop page at this time.');
        }
        setStatus('error');
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [sellerId]);

  return (
    <div className="min-h-screen bg-app-bg text-slate-900">
      <Header keywords={[]} />

      <main className="mx-auto w-full max-w-[1200px] px-3 py-4 md:px-4 md:py-6">
        {status === 'loading' ? (
          <section className="rounded-md bg-white p-6 text-center shadow-card">
            <p className="text-sm text-slate-600">Đang tải trang shop...</p>
          </section>
        ) : null}

        {status === 'error' ? (
          <section className="rounded-md bg-white p-6 text-center shadow-card">
            <p className="text-sm text-red-600">{errorMessage || 'Không tải được shop.'}</p>
          </section>
        ) : null}

        {status === 'success' && shop ? (
          <section className="space-y-4">
            <article className="overflow-hidden rounded-md bg-white shadow-card">
              <div className="h-3" style={{ backgroundColor: normalizeColor(shop.accentColor) }} />
              <div className="relative p-4">
                {shop.bannerUrl ? (
                  <img src={shop.bannerUrl} alt={shop.shopName} className="h-52 w-full rounded-md object-cover" />
                ) : (
                  <div className="flex h-52 w-full items-center justify-center rounded-md bg-slate-200 text-sm text-slate-600">Shop banner</div>
                )}

                <div className="-mt-14 rounded-md bg-white/95 p-4 shadow-lg backdrop-blur">
                  <div className="grid gap-4 md:grid-cols-[96px_minmax(0,1fr)_auto] md:items-center">
                    {shop.logoUrl ? (
                      <img src={shop.logoUrl} alt={shop.shopName} className="h-24 w-24 rounded-full border border-slate-200 object-cover" />
                    ) : (
                      <div className="grid h-24 w-24 place-items-center rounded-full bg-slate-100 text-xs text-slate-500">LOGO</div>
                    )}
                    <div>
                      <h1 className="text-2xl font-semibold">{shop.shopName}</h1>
                      <p className="text-sm text-slate-600">{shop.slogan}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>Người theo dõi: 12.4k</span>
                        <span>•</span>
                        <span>Đánh giá: 4.9/5</span>
                        <span>•</span>
                        <span>Phản hồi chat: 98%</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="h-10 rounded-md px-4 text-sm font-semibold text-white"
                      style={{ backgroundColor: normalizeColor(shop.accentColor) }}
                    >
                      + Theo dõi
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 border-b border-slate-200 pb-2">
                  {shop.navItems.map((item) => (
                    <span key={item} className="rounded-full bg-white px-3 py-1 text-sm text-slate-700 shadow-sm">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </article>

            <article className="rounded-md bg-white p-4 shadow-card">
              <h2 className="text-lg font-semibold">{shop.introTitle}</h2>
              <p className="mt-1 text-sm text-slate-600">{shop.introDescription}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {shop.featuredCategories.map((item) => (
                  <span key={item} className="rounded-md px-3 py-1 text-xs font-medium text-white" style={{ backgroundColor: normalizeColor(shop.accentColor) }}>
                    {item}
                  </span>
                ))}
              </div>
            </article>

            <article className="rounded-md bg-white p-4 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Sản phẩm trong shop</h2>
                <span className="text-sm text-slate-500">{products.length} sản phẩm hiển thị</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {products.map((item) => (
                  <Link key={item.id} href={`/products/${encodeURIComponent(item.id)}`} className="overflow-hidden rounded-md border border-slate-200 bg-white">
                    <img src={item.image} alt={item.title} className="h-40 w-full object-cover" />
                    <div className="space-y-1 p-3">
                      <p className="line-clamp-2 min-h-[2.6rem] text-sm font-medium text-slate-800">{item.title}</p>
                      <p className="text-base font-semibold text-brand-600">{formatPrice(item.price, item.currency)}</p>
                    </div>
                  </Link>
                ))}
              </div>
              {products.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
                  Shop này hiện chưa có sản phẩm công khai.
                </div>
              ) : null}
            </article>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function decodeSellerId(raw: string): string {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return '';
  }
}

function normalizeColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : '#ee4d2d';
}
