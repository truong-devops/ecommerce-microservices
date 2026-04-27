'use client';

import type { HomeCategoryItem } from '@/lib/api/types';
import { useLanguage } from '@/providers/AppProvider';

interface CategorySectionProps {
  categories: HomeCategoryItem[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
}

export function CategorySection({ categories, selectedCategoryId, onSelectCategory }: CategorySectionProps) {
  const { text } = useLanguage();

  return (
    <section aria-labelledby="category-heading" className="rounded-2xl bg-white/90 p-4 shadow-card md:p-5">
      <div className="mb-4 border-b border-slate-100 pb-3">
        <h2 id="category-heading" className="text-xl font-bold uppercase tracking-wide text-slate-700">
          {text.home.categoryTitle}
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {categories.map((category) => {
          const isActive = selectedCategoryId === category.id;
          const fallbackText = category.label
            .split(/\s+/)
            .map((part) => part[0] ?? '')
            .join('')
            .slice(0, 2)
            .toUpperCase();

          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onSelectCategory(isActive ? null : category.id)}
              className={`group rounded-2xl border p-3 text-center transition duration-200 ${
                isActive
                  ? 'border-brand-300 bg-gradient-to-b from-brand-50 to-white shadow-md'
                  : 'border-slate-100 bg-white hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md'
              }`}
            >
              <div
                className={`mx-auto h-16 w-16 overflow-hidden rounded-full ${
                  isActive ? 'ring-2 ring-brand-200 ring-offset-2 ring-offset-white' : 'ring-1 ring-slate-100'
                } bg-slate-100`}
              >
                {category.icon ? (
                  <img src={category.icon} alt={category.label} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-base font-semibold text-slate-700">{fallbackText || 'DM'}</div>
                )}
              </div>
              <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm font-medium text-slate-700">{category.label}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
