'use client';

import Link from 'next/link';
import type { ProductItem } from '@/lib/api/types';
import { useLanguage } from '@/providers/AppProvider';

interface VideoHighlightsSectionProps {
  products: ProductItem[];
}

interface VideoCardItem {
  id: string;
  productId: string;
  title: string;
  thumbnail: string;
  views: string;
  duration: string;
}

const fallbackVideos: VideoCardItem[] = [
  {
    id: 'fallback-video-1',
    productId: '',
    title: 'Lookbook thời trang mùa hè',
    thumbnail: 'https://picsum.photos/seed/video-fallback-1/900/1200',
    views: '12.4k',
    duration: '00:42'
  },
  {
    id: 'fallback-video-2',
    productId: '',
    title: 'Unbox công nghệ mới nhất',
    thumbnail: 'https://picsum.photos/seed/video-fallback-2/900/1200',
    views: '9.1k',
    duration: '01:05'
  },
  {
    id: 'fallback-video-3',
    productId: '',
    title: 'Mẹo phối đồ công sở',
    thumbnail: 'https://picsum.photos/seed/video-fallback-3/900/1200',
    views: '7.8k',
    duration: '00:37'
  },
  {
    id: 'fallback-video-4',
    productId: '',
    title: 'Top deal hôm nay',
    thumbnail: 'https://picsum.photos/seed/video-fallback-4/900/1200',
    views: '6.9k',
    duration: '00:54'
  }
];

export function VideoHighlightsSection({ products }: VideoHighlightsSectionProps) {
  const { text } = useLanguage();

  const videoCards = mapProductsToVideos(products);
  const displayCards = videoCards.length > 0 ? videoCards : fallbackVideos;

  return (
    <section aria-labelledby="video-highlights-heading" className="rounded-md bg-white p-3 shadow-card md:p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="video-highlights-heading" className="text-xl font-bold text-slate-900">
          {text.home.videoHighlightsTitle}
        </h2>
        <Link href="/videos" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
          {text.home.seeVideoFeed}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {displayCards.map((item) => (
          <Link
            key={item.id}
            href={item.productId ? `/videos?productId=${encodeURIComponent(item.productId)}` : '/videos'}
            className="group relative overflow-hidden rounded-md border border-slate-200 bg-slate-900"
          >
            <img src={item.thumbnail} alt={item.title} className="h-56 w-full object-cover opacity-95 transition group-hover:scale-[1.02]" />

            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

            <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[11px] font-semibold text-white">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {item.views}
            </div>

            <div className="absolute right-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-[11px] font-semibold text-white">{item.duration}</div>

            <div className="absolute bottom-0 left-0 right-0 p-2.5">
              <p className="line-clamp-2 text-sm font-semibold text-white">{item.title}</p>
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 text-[11px] font-semibold text-white">
                <span>▶</span>
                <span>{text.home.watchNow}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function mapProductsToVideos(products: ProductItem[]): VideoCardItem[] {
  return products.slice(0, 4).map((product, index) => ({
    id: `video-${product.id}`,
    productId: product.id,
    title: product.title,
    thumbnail: product.image,
    views: `${Math.max(5, 14 - index * 2)}.${index + 2}k`,
    duration: `00:${String(34 + index * 9).padStart(2, '0')}`
  }));
}
