'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { BuyerApiClientError } from '@/lib/api/client';
import { fetchBuyerProducts } from '@/lib/api/products';
import type { ListProductsInput, ProductSearchOutput } from '@/lib/api/types';
import { formatPrice } from '@/lib/price';
import { useLanguage } from '@/providers/AppProvider';

type SearchStatus = 'loading' | 'error' | 'success';

type SortBy = NonNullable<ListProductsInput['sortBy']>;
type SortOrder = NonNullable<ListProductsInput['sortOrder']>;

const defaultOutput: ProductSearchOutput = {
  items: [],
  pagination: {
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 1
  }
};

const validSortBy: Set<SortBy> = new Set(['createdAt', 'updatedAt', 'name', 'minPrice']);
const validSortOrder: Set<SortOrder> = new Set(['ASC', 'DESC']);

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { text } = useLanguage();

  const [status, setStatus] = useState<SearchStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<ProductSearchOutput>(defaultOutput);

  const query = useMemo(() => {
    const q = searchParams.get('q')?.trim() ?? '';
    const page = parsePositiveInt(searchParams.get('page')) ?? 1;

    const rawSortBy = searchParams.get('sortBy');
    const sortBy: SortBy = rawSortBy && validSortBy.has(rawSortBy as SortBy) ? (rawSortBy as SortBy) : 'createdAt';

    const rawSortOrder = searchParams.get('sortOrder');
    const sortOrder: SortOrder =
      rawSortOrder && validSortOrder.has(rawSortOrder as SortOrder) ? (rawSortOrder as SortOrder) : 'DESC';

    return {
      q,
      page,
      sortBy,
      sortOrder
    };
  }, [searchParams]);

  const loadProducts = useCallback(async () => {
    setStatus('loading');
    setErrorMessage('');

    try {
      const data = await fetchBuyerProducts({
        page: query.page,
        pageSize: 20,
        search: query.q,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder
      });

      setResult(data);
      setStatus('success');
    } catch (error) {
      if (error instanceof BuyerApiClientError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(text.search.loadError);
      }
      setStatus('error');
    }
  }, [query.page, query.q, query.sortBy, query.sortOrder, text.search.loadError]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const sortValue = `${query.sortBy}:${query.sortOrder}`;

  const handleSortChange = (value: string) => {
    const [sortBy, sortOrder] = value.split(':') as [SortBy, SortOrder];
    const params = new URLSearchParams(searchParams.toString());

    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);
    params.set('page', '1');

    router.push(`/search?${params.toString()}`);
  };

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());

    if (page <= 1) {
      params.delete('page');
    } else {
      params.set('page', String(page));
    }

    router.push(`/search?${params.toString()}`);
  };

  const canGoPrev = result.pagination.page > 1;
  const canGoNext = result.pagination.page < result.pagination.totalPages;

  return (
    <div className="min-h-screen bg-app-bg text-slate-900">
      <Header keywords={[]} />

      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-3 py-4 md:px-4 md:py-6">
        <section className="rounded-md bg-white p-4 shadow-card md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{text.search.title}</h1>
              <p className="mt-1 text-sm text-slate-600">
                {query.q ? text.search.resultFor.replace('{query}', query.q) : text.search.subtitle}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {text.search.totalResults.replace('{count}', String(result.pagination.totalItems))}
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span>{text.search.sortLabel}</span>
              <select
                value={sortValue}
                onChange={(event) => handleSortChange(event.target.value)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
              >
                <option value="createdAt:DESC">{text.search.sortNewest}</option>
                <option value="updatedAt:DESC">{text.search.sortRecentlyUpdated}</option>
                <option value="minPrice:ASC">{text.search.sortPriceLowToHigh}</option>
                <option value="minPrice:DESC">{text.search.sortPriceHighToLow}</option>
                <option value="name:ASC">{text.search.sortNameAsc}</option>
                <option value="name:DESC">{text.search.sortNameDesc}</option>
              </select>
            </label>
          </div>
        </section>

        {status === 'loading' ? (
          <section className="rounded-md bg-white p-6 text-center shadow-card">
            <p className="text-sm text-slate-600">{text.search.loading}</p>
          </section>
        ) : null}

        {status === 'error' ? (
          <section className="rounded-md bg-white p-6 text-center shadow-card">
            <p className="text-sm text-red-600">{errorMessage || text.search.loadError}</p>
            <button
              type="button"
              className="mt-3 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
              onClick={() => {
                void loadProducts();
              }}
            >
              {text.search.retry}
            </button>
          </section>
        ) : null}

        {status === 'success' && result.items.length === 0 ? (
          <section className="rounded-md bg-white p-6 text-center shadow-card">
            <p className="text-sm text-slate-600">{text.search.empty}</p>
          </section>
        ) : null}

        {status === 'success' && result.items.length > 0 ? (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {result.items.map((item) => (
                <Link
                  key={item.id}
                  href={`/products/${encodeURIComponent(item.id)}`}
                  className="group overflow-hidden rounded-md border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:shadow-card"
                >
                  <div className="relative">
                    <img src={item.image} alt={item.title} className="h-40 w-full object-cover" />
                    {item.discountPercent > 0 ? (
                      <span className="absolute right-2 top-2 rounded bg-brand-500 px-1.5 py-0.5 text-xs font-semibold text-white">
                        -{item.discountPercent}%
                      </span>
                    ) : null}
                  </div>

                  <div className="space-y-2 p-2.5">
                    <h2 className="line-clamp-2 min-h-[2.6rem] text-sm font-medium text-slate-700">{item.title}</h2>

                    <div className="space-y-1">
                      <p className="text-base font-bold text-brand-600">{formatPrice(item.price, item.currency)}</p>
                      {item.compareAtPrice ? (
                        <p className="text-xs text-slate-500 line-through">{formatPrice(item.compareAtPrice, item.currency)}</p>
                      ) : null}
                      {item.brand ? <p className="text-xs text-slate-500">{item.brand}</p> : null}
                    </div>
                  </div>
                </Link>
              ))}
            </section>

            <section className="flex items-center justify-center gap-2 rounded-md bg-white p-3 shadow-card">
              <button
                type="button"
                onClick={() => goToPage(result.pagination.page - 1)}
                disabled={!canGoPrev}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {text.search.prevPage}
              </button>

              <span className="text-sm text-slate-700">
                {text.search.pageLabel
                  .replace('{page}', String(result.pagination.page))
                  .replace('{totalPages}', String(result.pagination.totalPages))}
              </span>

              <button
                type="button"
                onClick={() => goToPage(result.pagination.page + 1)}
                disabled={!canGoNext}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {text.search.nextPage}
              </button>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

function parsePositiveInt(raw: string | null): number | null {
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.floor(value);
}
