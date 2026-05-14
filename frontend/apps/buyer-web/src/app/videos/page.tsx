'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { BuyerApiClientError } from '@/lib/api/client';
import { fetchHomeSections } from '@/lib/api/home';
import type { HomeSectionsData, ProductItem } from '@/lib/api/types';
import { formatPrice } from '@/lib/price';
import { useLanguage } from '@/providers/AppProvider';

type VideosStatus = 'loading' | 'error' | 'success';

const emptyHomeSections: HomeSectionsData = {
  keywords: [],
  categories: [],
  flashSaleItems: [],
  mallDeals: [],
  topSearchItems: [],
  recommendationProducts: []
};

export default function VideosPage() {
  const { text } = useLanguage();
  const [status, setStatus] = useState<VideosStatus>('loading');
  const [error, setError] = useState('');
  const [sections, setSections] = useState<HomeSectionsData>(emptyHomeSections);

  const loadData = useCallback(async () => {
    setStatus('loading');
    setError('');

    try {
      const data = await fetchHomeSections();
      setSections(data);
      setStatus('success');
    } catch (loadError) {
      if (loadError instanceof BuyerApiClientError) {
        setError(loadError.message);
      } else {
        setError(text.home.loadError);
      }
      setStatus('error');
    }
  }, [text.home.loadError]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const feedItems = useMemo(() => buildVideoFeedItems(sections.recommendationProducts), [sections.recommendationProducts]);

  return (
    <div className="min-h-screen bg-app-bg text-slate-900">
      <Header keywords={sections.keywords} />

      <main className="mx-auto w-full max-w-[1200px] px-3 py-4 md:px-4 md:py-6">
        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">{text.home.videoHighlightsTitle}</h1>
              <p className="mt-1 text-sm text-slate-600">Khám phá video ngắn từ các shop và mua ngay sản phẩm trong video.</p>
            </div>
            <Link
              href="/"
              className="rounded-md border border-brand-500 px-3 py-2 text-sm font-semibold text-brand-600 transition hover:bg-brand-50"
            >
              Về trang chủ
            </Link>
          </div>

          {status === 'loading' ? <p className="py-8 text-center text-sm text-slate-600">{text.home.loading}</p> : null}

          {status === 'error' ? (
            <div className="py-8 text-center">
              <p className="text-sm text-red-600">{error || text.home.loadError}</p>
              <button
                type="button"
                onClick={() => {
                  void loadData();
                }}
                className="mt-3 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
              >
                {text.home.retry}
              </button>
            </div>
          ) : null}

          {status === 'success' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {feedItems.map((item, index) => (
                <article key={item.id} className="overflow-hidden rounded-md border border-slate-200 bg-white">
                  <div className="relative">
                    <img src={item.image} alt={item.title} className="h-64 w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    <span className="absolute left-2 top-2 rounded bg-black/55 px-2 py-1 text-xs font-semibold text-white">
                      {`${Math.max(5, 15 - (index % 7))}.${(index % 5) + 1}k`}
                    </span>
                    <span className="absolute right-2 top-2 rounded bg-black/55 px-2 py-1 text-xs font-semibold text-white">
                      {`00:${String(35 + (index % 6) * 7).padStart(2, '0')}`}
                    </span>
                    <button
                      type="button"
                      className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-900"
                    >
                      ▶ {text.home.watchNow}
                    </button>
                  </div>
                  <div className="space-y-2 p-3">
                    <h2 className="line-clamp-2 text-sm font-semibold text-slate-900">{item.title}</h2>
                    <p className="text-lg font-bold text-brand-600">{formatPrice(item.price)}</p>
                    <Link href={`/products/${encodeURIComponent(item.id)}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                      Mua sản phẩm này
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function buildVideoFeedItems(products: ProductItem[]): ProductItem[] {
  if (products.length > 0) {
    return products.slice(0, 12);
  }

  return [
    {
      id: 'video-demo-1',
      title: 'Váy maxi họa tiết hè',
      categoryId: 'fashion',
      price: 349000,
      sold: '1.2k',
      discountPercent: 18,
      image: 'https://picsum.photos/seed/video-demo-1/900/1200'
    },
    {
      id: 'video-demo-2',
      title: 'Laptop mỏng nhẹ cho dân văn phòng',
      categoryId: 'electronics',
      price: 17990000,
      sold: '412',
      discountPercent: 10,
      image: 'https://picsum.photos/seed/video-demo-2/900/1200'
    },
    {
      id: 'video-demo-3',
      title: 'Set skincare buổi tối',
      categoryId: 'beauty',
      price: 589000,
      sold: '2.3k',
      discountPercent: 15,
      image: 'https://picsum.photos/seed/video-demo-3/900/1200'
    },
    {
      id: 'video-demo-4',
      title: 'Combo áo polo nam premium',
      categoryId: 'fashion',
      price: 279000,
      sold: '866',
      discountPercent: 12,
      image: 'https://picsum.photos/seed/video-demo-4/900/1200'
    }
  ];
}
