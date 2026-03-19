import { Header } from '@/components/layout/Header';
import { FlashSaleSection } from '@/components/home/FlashSaleSection';
import { MallSection } from '@/components/home/MallSection';
import { TopSearchSection } from '@/components/home/TopSearchSection';
import { RecommendationSection } from '@/components/home/RecommendationSection';
import {
  flashSaleItems,
  keywords,
  mallDeals,
  recommendationProducts,
  topSearchItems
} from '@/lib/mock-data';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-app-bg text-slate-900">
      <Header keywords={keywords} />
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-3 py-4 md:px-4 md:py-6">
        <FlashSaleSection items={flashSaleItems} />
        <MallSection deals={mallDeals} />
        <TopSearchSection items={topSearchItems} />
        <RecommendationSection products={recommendationProducts} />
      </main>
    </div>
  );
}
