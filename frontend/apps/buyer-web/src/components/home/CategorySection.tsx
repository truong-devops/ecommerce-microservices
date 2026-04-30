'use client';

import { useEffect, useMemo, useState } from 'react';
import type { HomeCategoryItem } from '@/lib/api/types';
import { useLanguage } from '@/providers/AppProvider';

interface CategorySectionProps {
  categories: HomeCategoryItem[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
}

type CategoryTypeKey =
  | 'all'
  | 'fashion'
  | 'electronics'
  | 'beautyHealth'
  | 'homeLiving'
  | 'momBaby'
  | 'sportsOutdoor'
  | 'books'
  | 'vehicles'
  | 'other';

interface CategoryTypeOption {
  id: CategoryTypeKey;
  label: string;
}

function inferCategoryType(category: HomeCategoryItem): Exclude<CategoryTypeKey, 'all'> {
  const normalized = `${category.id} ${category.label}`.trim().toLowerCase();

  if (
    /thoi-trang|giay-dep|tui-vi|dong-ho|phu-kien-trang-suc|fashion|shoe|watch|bag|jewelry/.test(normalized)
  ) {
    return 'fashion';
  }

  if (/dien-thoai|thiet-bi-dien-tu|may-tinh|laptop|may-anh|camera|electronic|phone/.test(normalized)) {
    return 'electronics';
  }

  if (/sac-dep|suc-khoe|beauty|health|my-pham/.test(normalized)) {
    return 'beautyHealth';
  }

  if (/nha-cua|thiet-bi-dien-gia-dung|bach-hoa|home|kitchen|appliance|living/.test(normalized)) {
    return 'homeLiving';
  }

  if (/me-va-be|mom|baby|kid/.test(normalized)) {
    return 'momBaby';
  }

  if (/the-thao|du-lich|sport|outdoor|travel/.test(normalized)) {
    return 'sportsOutdoor';
  }

  if (/nha-sach|book|stationery/.test(normalized)) {
    return 'books';
  }

  if (/o-to|xe-may|xe-dap|vehicle|car|bike|motor/.test(normalized)) {
    return 'vehicles';
  }

  return 'other';
}

export function CategorySection({ categories, selectedCategoryId, onSelectCategory }: CategorySectionProps) {
  const { locale, text } = useLanguage();
  const [selectedType, setSelectedType] = useState<CategoryTypeKey>('all');

  const typeLabelMap = useMemo<Record<CategoryTypeKey, string>>(
    () =>
      locale === 'vi'
        ? {
            all: text.home.allCategories,
            fashion: 'Thoi trang',
            electronics: 'Dien tu',
            beautyHealth: 'Sac dep & Suc khoe',
            homeLiving: 'Nha cua & Doi song',
            momBaby: 'Me & Be',
            sportsOutdoor: 'The thao & Du lich',
            books: 'Nha sach',
            vehicles: 'O to & Xe may',
            other: 'Khac'
          }
        : {
            all: text.home.allCategories,
            fashion: 'Fashion',
            electronics: 'Electronics',
            beautyHealth: 'Beauty & Health',
            homeLiving: 'Home & Living',
            momBaby: 'Mom & Baby',
            sportsOutdoor: 'Sports & Outdoor',
            books: 'Books',
            vehicles: 'Vehicles',
            other: 'Other'
          },
    [locale, text.home.allCategories]
  );

  const categoriesByType = useMemo(() => {
    return categories.reduce<Record<Exclude<CategoryTypeKey, 'all'>, HomeCategoryItem[]>>(
      (accumulator, category) => {
        const type = inferCategoryType(category);
        accumulator[type].push(category);
        return accumulator;
      },
      {
        fashion: [],
        electronics: [],
        beautyHealth: [],
        homeLiving: [],
        momBaby: [],
        sportsOutdoor: [],
        books: [],
        vehicles: [],
        other: []
      }
    );
  }, [categories]);

  const typeOptions = useMemo<CategoryTypeOption[]>(() => {
    const availableTypes = (Object.keys(categoriesByType) as Exclude<CategoryTypeKey, 'all'>[]).filter(
      (type) => categoriesByType[type].length > 0
    );

    return [
      { id: 'all', label: typeLabelMap.all },
      ...availableTypes.map((type) => ({
        id: type,
        label: typeLabelMap[type]
      }))
    ];
  }, [categoriesByType, typeLabelMap]);

  useEffect(() => {
    const hasSelectedType = typeOptions.some((option) => option.id === selectedType);
    if (!hasSelectedType) {
      setSelectedType('all');
    }
  }, [selectedType, typeOptions]);

  const visibleCategories = useMemo(() => {
    if (selectedType === 'all') {
      return categories;
    }

    return categoriesByType[selectedType];
  }, [categories, categoriesByType, selectedType]);

  useEffect(() => {
    if (!selectedCategoryId) {
      return;
    }

    const isSelectedVisible = visibleCategories.some((category) => category.id === selectedCategoryId);
    if (!isSelectedVisible) {
      onSelectCategory(null);
    }
  }, [onSelectCategory, selectedCategoryId, visibleCategories]);

  return (
    <section aria-labelledby="category-heading" className="rounded-2xl bg-white/90 p-4 shadow-card md:p-5">
      <div className="mb-4 border-b border-slate-100 pb-3">
        <h2 id="category-heading" className="text-xl font-bold uppercase tracking-wide text-slate-700">
          {text.home.categoryTitle}
        </h2>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {typeOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setSelectedType(option.id)}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
              selectedType === option.id
                ? 'border-brand-500 bg-brand-500 text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:text-brand-600'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {visibleCategories.map((category) => {
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

      {visibleCategories.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
          {locale === 'vi' ? 'Chua co danh muc trong loai nay.' : 'No categories in this type yet.'}
        </p>
      ) : null}
    </section>
  );
}
