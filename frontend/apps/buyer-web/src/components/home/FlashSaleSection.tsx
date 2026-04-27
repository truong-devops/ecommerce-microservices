'use client';

import type { FlashSaleItem } from '@/lib/api/types';
import { formatPrice } from '@/lib/price';
import { useLanguage } from '@/providers/AppProvider';

interface FlashSaleSectionProps {
  items: FlashSaleItem[];
}

export function FlashSaleSection({ items }: FlashSaleSectionProps) {
  const { text } = useLanguage();

  return (
    <section aria-labelledby="flash-sale-heading" className="rounded-md bg-white p-3 shadow-card md:p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="flash-sale-heading" className="text-xl font-bold uppercase tracking-wide text-brand-600">
          {text.home.flashSaleTitle}
        </h2>
        <a href="#" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          {text.home.viewAll}
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((item) => (
          <article key={item.id} className="group rounded-md border border-slate-200 bg-white p-2 transition hover:-translate-y-0.5 hover:shadow-card">
            <div className="relative overflow-hidden rounded-md">
              <img src={item.image} alt={item.name} className="h-36 w-full object-cover" />
              <span className="absolute right-2 top-2 rounded bg-brand-500 px-1.5 py-0.5 text-xs font-semibold text-white">
                -{item.discountPercent}%
              </span>
            </div>
            <h3 className="mt-2 line-clamp-2 text-sm font-medium text-slate-700">{item.name}</h3>
            <p className="mt-1 text-lg font-bold text-brand-600">{formatPrice(item.price)}</p>
            <p className="mt-1 rounded-full bg-brand-100 px-2 py-1 text-center text-xs font-semibold uppercase tracking-wide text-brand-700">
              {item.soldLabel}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
