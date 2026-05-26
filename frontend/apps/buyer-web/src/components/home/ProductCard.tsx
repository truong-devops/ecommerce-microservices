'use client';

import Link from 'next/link';
import type { ProductItem } from '@/lib/api/types';
import { formatPrice } from '@/lib/price';
import { useLanguage } from '@/providers/AppProvider';

interface ProductCardProps {
  product: ProductItem;
}

export function ProductCard({ product }: ProductCardProps) {
  const { text } = useLanguage();

  return (
    <Link href={`/products/${encodeURIComponent(product.id)}`} className="block">
      <article className="group overflow-hidden rounded-md border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:shadow-card">
        <div className="relative">
          <img src={product.image} alt={product.title} className="h-36 w-full object-cover sm:h-40" />
          <span className="absolute right-2 top-2 rounded bg-brand-500 px-1.5 py-0.5 text-xs font-semibold text-white">
            -{product.discountPercent}%
          </span>
        </div>

        <div className="space-y-2 p-2.5">
          <h3 className="line-clamp-2 min-h-[2.6rem] text-sm font-medium text-slate-700">{product.title}</h3>
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="text-base font-bold text-brand-600 sm:text-lg">{formatPrice(product.price)}</span>
            <span className="text-xs text-slate-500">
              {text.home.soldLabel} {product.sold}
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
