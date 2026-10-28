'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listBuyerVideos } from '@/lib/api/videos';
import type { BuyerVideo, ProductItem } from '@/lib/api/types';
import { resolveMediaUrl } from '@/lib/media-url';
import { useLanguage } from '@/providers/AppProvider';

interface VideoHighlightsSectionProps {
  products: ProductItem[];
}

interface VideoCardItem {
  id: string;
  productId: string;
  title: string;
  thumbnail: string | null;
  mediaUrl?: string | null;
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
  const [videos, setVideos] = useState<BuyerVideo[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listBuyerVideos({ page: 1, pageSize: 4 })
      .then((result) => {
        if (!cancelled) {
          setVideos(result.items ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVideos([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const videoCards = videos.length > 0 ? mapBackendVideos(videos) : mapProductsToVideos(products);
  const displayCards = videoCards.length > 0 ? videoCards : fallbackVideos;

  return (
    <section aria-labelledby="video-highlights-heading" className="rounded-sm bg-white p-4 shadow-sm">
      <div className="mb-3.5 flex items-center justify-between border-b border-[#f1f1f1] pb-3">
        <div className="flex items-center gap-2">
          <span className="h-4 w-1 bg-[#ee4d2d]" />
          <h2 id="video-highlights-heading" className="text-base font-bold uppercase tracking-wide text-[#222]">
            {text.home.videoHighlightsTitle || 'Video nổi bật'}
          </h2>
        </div>
        <Link href="/videos" className="text-xs font-semibold text-[#ee4d2d] hover:text-[#d73211] flex items-center gap-1">
          <span>{text.home.seeVideoFeed || 'Xem tất cả video'}</span>
          <span>&rsaquo;</span>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {displayCards.map((item) => {
          const resolvedMedia = resolveMediaUrl(item.mediaUrl);
          const resolvedThumb = resolveMediaUrl(item.thumbnail);

          return (
            <Link
              key={item.id}
              href={item.productId ? `/videos?productId=${encodeURIComponent(item.productId)}` : '/videos'}
              className="group relative overflow-hidden rounded-sm border border-[#e8e8e8] bg-black block"
            >
              <div className="relative h-48 w-full overflow-hidden bg-black sm:h-64">
                {resolvedMedia ? (
                  <video
                    src={resolvedMedia}
                    poster={resolvedThumb || undefined}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                ) : resolvedThumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolvedThumb}
                    alt={item.title}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-white/70">
                    Video preview
                  </div>
                )}
              </div>

              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

              {/* Top View badge */}
              <div className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-[#ee4d2d]" />
                <span>{item.views}</span>
              </div>

              <div className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/90">
                {item.duration}
              </div>

              {/* Title & Play Button */}
              <div className="absolute bottom-0 left-0 right-0 p-2.5">
                <p className="line-clamp-2 text-xs font-semibold text-white leading-snug">
                  {item.title}
                </p>
                <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-[#ee4d2d]">
                  <span>▶</span>
                  <span>Xem ngay</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function mapBackendVideos(videos: BuyerVideo[]): VideoCardItem[] {
  return videos.slice(0, 4).map((video) => ({
    id: video.videoId,
    productId: video.products[0]?.productId ?? '',
    title: video.title,
    thumbnail: video.thumbnailUrl,
    mediaUrl: video.mediaUrl,
    views: `${video.metrics.qualifiedViewCount}`,
    duration: formatDuration(video.durationSec)
  }));
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

function formatDuration(durationSec: number | null): string {
  const seconds = Math.max(0, Math.floor(durationSec ?? 0));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}
