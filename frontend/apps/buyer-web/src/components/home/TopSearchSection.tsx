'use client';

import Link from 'next/link';
import type { TopSearchItem } from '@/lib/api/types';
import { useLanguage } from '@/providers/AppProvider';

interface TopSearchSectionProps {
  items: TopSearchItem[];
}

export function TopSearchSection({ items }: TopSearchSectionProps) {
  const { text } = useLanguage();

  return (
    <section aria-labelledby="top-search-heading" className="rounded-xl bg-white p-3 shadow-card md:rounded-md md:p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="top-search-heading" className="text-xl font-bold uppercase tracking-wide text-brand-600">
          {text.home.topSearchTitle}
        </h2>
        <a href="#" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          {text.home.viewAll}
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/products/${encodeURIComponent(item.productId)}`}
            className="rounded-md border border-slate-200 p-2 transition hover:shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <div className="relative overflow-hidden rounded-md">
              <img src={item.image} alt={item.name} className="h-28 w-full object-cover sm:h-32" />
              <span className="absolute left-2 top-2 rounded bg-brand-500 px-1.5 py-0.5 text-xs font-semibold text-white">TOP</span>
            </div>
            <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-slate-700 sm:text-base">{item.name}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {text.home.soldLabel} {item.soldPerMonth}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
