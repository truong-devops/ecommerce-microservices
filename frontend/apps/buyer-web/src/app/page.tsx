'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlashSaleSection } from '@/components/home/FlashSaleSection';
import { MallSection } from '@/components/home/MallSection';
import { RecommendationSection } from '@/components/home/RecommendationSection';
import { TopSearchSection } from '@/components/home/TopSearchSection';
import { Header } from '@/components/layout/Header';
import { fetchHomeSections } from '@/lib/api/home';
import { BuyerApiClientError } from '@/lib/api/client';
import type { HomeSectionsData } from '@/lib/api/types';
import { useLanguage } from '@/providers/AppProvider';

type HomeStatus = 'loading' | 'error' | 'success';

const emptyHomeSections: HomeSectionsData = {
  keywords: [],
  flashSaleItems: [],
  mallDeals: [],
  topSearchItems: [],
  recommendationProducts: []
};

export default function HomePage() {
  const { text } = useLanguage();
  const [status, setStatus] = useState<HomeStatus>('loading');
  const [error, setError] = useState('');
  const [sections, setSections] = useState<HomeSectionsData>(emptyHomeSections);

  const loadHomeData = useCallback(async () => {
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
    void loadHomeData();
  }, [loadHomeData]);

  const isEmpty = useMemo(
    () =>
      sections.flashSaleItems.length === 0 &&
      sections.mallDeals.length === 0 &&
      sections.topSearchItems.length === 0 &&
      sections.recommendationProducts.length === 0,
    [sections]
  );

  return (
    <div className="min-h-screen bg-app-bg text-slate-900">
      <Header keywords={sections.keywords} />

      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-3 py-4 md:px-4 md:py-6">
        {status === 'loading' ? (
          <section className="rounded-md bg-white p-6 text-center shadow-card">
            <p className="text-sm text-slate-600">{text.home.loading}</p>
          </section>
        ) : null}

        {status === 'error' ? (
          <section className="rounded-md bg-white p-6 text-center shadow-card">
            <p className="text-sm text-red-600">{error || text.home.loadError}</p>
            <button
              type="button"
              className="mt-3 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
              onClick={() => {
                void loadHomeData();
              }}
            >
              {text.home.retry}
            </button>
          </section>
        ) : null}

        {status === 'success' && isEmpty ? (
          <section className="rounded-md bg-white p-6 text-center shadow-card">
            <p className="text-sm text-slate-600">{text.home.empty}</p>
          </section>
        ) : null}

        {status === 'success' && !isEmpty ? (
          <>
            <FlashSaleSection items={sections.flashSaleItems} />
            <MallSection deals={sections.mallDeals} />
            <TopSearchSection items={sections.topSearchItems} />
            <RecommendationSection products={sections.recommendationProducts} />
          </>
        ) : null}
      </main>
    </div>
  );
}
