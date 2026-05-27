'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CategorySection } from '@/components/home/CategorySection';
import { FlashSaleSection } from '@/components/home/FlashSaleSection';
import { MallSection } from '@/components/home/MallSection';
import { RecommendationSection } from '@/components/home/RecommendationSection';
import { TopSearchSection } from '@/components/home/TopSearchSection';
import { VideoHighlightsSection } from '@/components/home/VideoHighlightsSection';
import { Header } from '@/components/layout/Header';
import { fetchHomeSections } from '@/lib/api/home';
import { fetchBuyerProducts } from '@/lib/api/products';
import { BuyerApiClientError } from '@/lib/api/client';
import type { HomeSectionsData, ProductItem, ProductSearchItem } from '@/lib/api/types';
import { useLanguage } from '@/providers/AppProvider';

type HomeStatus = 'loading' | 'error' | 'success';
type CategoryProductsStatus = 'idle' | 'loading' | 'error' | 'success';

const CATEGORY_PRODUCTS_PAGE_SIZE = 100;

const emptyHomeSections: HomeSectionsData = {
  keywords: [],
  categories: [],
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
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryProductsStatus, setCategoryProductsStatus] = useState<CategoryProductsStatus>('idle');
  const [categoryProducts, setCategoryProducts] = useState<ProductItem[]>([]);

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

  useEffect(() => {
    if (sections.categories.length === 0) {
      setSelectedCategoryId(null);
      return;
    }

    const isSelectedCategoryExists = sections.categories.some((category) => category.id === selectedCategoryId);
    if (selectedCategoryId && !isSelectedCategoryExists) {
      setSelectedCategoryId(null);
    }
  }, [sections.categories, selectedCategoryId]);

  const selectedCategory = useMemo(
    () => sections.categories.find((category) => category.id === selectedCategoryId) ?? null,
    [sections.categories, selectedCategoryId]
  );

  useEffect(() => {
    if (!selectedCategoryId) {
      setCategoryProducts([]);
      setCategoryProductsStatus('idle');
      return;
    }

    let cancelled = false;
    setCategoryProducts([]);
    setCategoryProductsStatus('loading');

    void fetchAllCategoryProducts(selectedCategoryId)
      .then((products) => {
        if (!cancelled) {
          setCategoryProducts(products);
          setCategoryProductsStatus('success');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCategoryProducts([]);
          setCategoryProductsStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCategoryId]);

  const displayedRecommendationProducts = selectedCategory ? categoryProducts : sections.recommendationProducts;
  const recommendationEmptyMessage =
    selectedCategory && categoryProductsStatus === 'loading'
      ? text.home.loading
      : selectedCategory && categoryProductsStatus === 'error'
        ? text.home.loadError
        : text.home.noProductsInCategory;

  const recommendationTitle = useMemo(() => {
    if (!selectedCategory) {
      return text.home.recommendationTitle;
    }

    return text.home.categoryProductsTitle.replace('{category}', selectedCategory.label);
  }, [selectedCategory, text.home.categoryProductsTitle, text.home.recommendationTitle]);

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
            <CategorySection
              categories={sections.categories}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={setSelectedCategoryId}
            />
            <VideoHighlightsSection products={sections.recommendationProducts} />
            <FlashSaleSection items={sections.flashSaleItems} />
            <MallSection deals={sections.mallDeals} />
            <TopSearchSection items={sections.topSearchItems} />
            <RecommendationSection
              title={recommendationTitle}
              emptyMessage={recommendationEmptyMessage}
              products={displayedRecommendationProducts}
            />
          </>
        ) : null}
      </main>

    </div>
  );
}

async function fetchAllCategoryProducts(categoryId: string): Promise<ProductItem[]> {
  const firstPage = await fetchBuyerProducts({
    categoryId,
    page: 1,
    pageSize: CATEGORY_PRODUCTS_PAGE_SIZE,
    sortBy: 'createdAt',
    sortOrder: 'DESC'
  });
  const additionalPages =
    firstPage.pagination.totalPages > 1
      ? await Promise.all(
          Array.from({ length: firstPage.pagination.totalPages - 1 }, (_, index) =>
            fetchBuyerProducts({
              categoryId,
              page: index + 2,
              pageSize: CATEGORY_PRODUCTS_PAGE_SIZE,
              sortBy: 'createdAt',
              sortOrder: 'DESC'
            })
          )
        )
      : [];

  return [firstPage, ...additionalPages].flatMap((page) => page.items.map(toCategoryProductItem));
}

function toCategoryProductItem(product: ProductSearchItem): ProductItem {
  return {
    id: product.id,
    title: product.title,
    categoryId: product.categoryId,
    price: product.price,
    sold: '0',
    discountPercent: product.discountPercent,
    image: product.image
  };
}
