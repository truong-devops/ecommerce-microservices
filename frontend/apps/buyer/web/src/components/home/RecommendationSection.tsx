import type { ProductItem } from '@/lib/mock-data';
import { ProductCard } from './ProductCard';

interface RecommendationSectionProps {
  products: ProductItem[];
}

export function RecommendationSection({ products }: RecommendationSectionProps) {
  return (
    <section aria-labelledby="recommend-heading" className="rounded-md bg-white p-3 shadow-card md:p-4">
      <div className="mb-3 border-b-2 border-brand-500 pb-3 text-center">
        <h2 id="recommend-heading" className="text-xl font-bold uppercase tracking-wide text-brand-600">
          Recommendations For You
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
