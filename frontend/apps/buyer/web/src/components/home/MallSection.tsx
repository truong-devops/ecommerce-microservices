'use client';

import type { MallDealItem } from '@/lib/mock-data';
import { useLanguage } from '@/providers/AppProvider';

interface MallSectionProps {
  deals: MallDealItem[];
}

export function MallSection({ deals }: MallSectionProps) {
  const { text } = useLanguage();

  return (
    <section aria-labelledby="mall-heading" className="rounded-md bg-white p-3 shadow-card md:p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="mall-heading" className="text-xl font-bold uppercase tracking-wide text-brand-600">
          {text.home.mallTitle}
        </h2>
        <a href="#" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          {text.home.seeAllOffers}
        </a>
      </div>

      <div className="grid gap-3 lg:grid-cols-[340px_1fr]">
        <div className="relative overflow-hidden rounded-md bg-brand-gradient p-4 text-white">
          <p className="text-sm font-semibold uppercase tracking-wider text-white/90">Featured campaign</p>
          <h3 className="mt-2 text-4xl font-black leading-tight">{text.home.campaignTitle}</h3>
          <p className="mt-3 max-w-[25ch] text-sm text-white/90">
            {text.home.campaignDescription}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {deals.map((deal) => (
            <article key={deal.id} className="rounded-md border border-slate-200 p-2 transition hover:shadow-card">
              <img src={deal.image} alt={deal.brand} className="h-24 w-full rounded object-cover" />
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{deal.brand}</p>
              <h3 className="text-sm font-semibold text-brand-600">{deal.title}</h3>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
