'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { BuyerApiClientError } from '@/lib/api/client';
import { listBuyerVideos, trackBuyerVideoEvent } from '@/lib/api/videos';
import type { BuyerVideo } from '@/lib/api/types';
import { formatPrice } from '@/lib/price';
import { useLanguage } from '@/providers/AppProvider';

type VideosStatus = 'loading' | 'error' | 'success';

export default function VideosPage() {
  const { text } = useLanguage();
  const [status, setStatus] = useState<VideosStatus>('loading');
  const [error, setError] = useState('');
  const [videos, setVideos] = useState<BuyerVideo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackedQualifiedViews = useRef<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    setStatus('loading');
    setError('');

    try {
      const data = await listBuyerVideos({ page: 1, pageSize: 12, productId: getProductIdFilter() });
      setVideos(data.items ?? []);
      setCurrentIndex(0);
      setStatus('success');
    } catch (loadError) {
      setError(loadError instanceof BuyerApiClientError ? loadError.message : text.home.loadError);
      setStatus('error');
    }
  }, [text.home.loadError]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const currentVideo = videos[currentIndex] ?? null;
  const keywords = useMemo(() => videos.flatMap((video) => video.products.map((product) => product.name)).slice(0, 8), [videos]);
  const topicTags = useMemo(
    () => Array.from(new Set(videos.flatMap((video) => video.products.map((product) => product.name.trim())).filter((name) => name.length > 0))).slice(0, 6),
    [videos]
  );
  const featuredShops = useMemo(() => Array.from(new Set(videos.map((video) => video.seller.shopName))).slice(0, 4), [videos]);

  const handlePlay = useCallback((video: BuyerVideo) => {
    void trackBuyerVideoEvent(video.videoId, 'view-started', buildEventPayload(video));
  }, []);

  const handleTimeUpdate = useCallback((video: BuyerVideo, currentTime: number) => {
    if (currentTime < 3 || trackedQualifiedViews.current.has(video.videoId)) {
      return;
    }
    trackedQualifiedViews.current.add(video.videoId);
    void trackBuyerVideoEvent(video.videoId, 'view-qualified', buildEventPayload(video, { watchTimeSec: Math.floor(currentTime) }));
  }, []);

  const handleProductClick = useCallback((video: BuyerVideo, productId: string) => {
    void trackBuyerVideoEvent(video.videoId, 'product-clicked', buildEventPayload(video, { productId }));
  }, []);

  const goToVideo = useCallback((nextIndex: number) => {
    setCurrentIndex((current) => {
      const bounded = Math.min(Math.max(nextIndex, 0), videos.length - 1);
      return bounded === current ? current : bounded;
    });
  }, [videos.length]);

  const goPrevious = useCallback(() => {
    goToVideo(currentIndex - 1);
  }, [currentIndex, goToVideo]);

  const goNext = useCallback(() => {
    goToVideo(currentIndex + 1);
  }, [currentIndex, goToVideo]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        goPrevious();
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        goNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrevious]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header keywords={keywords} />

      <main className="bg-slate-50">
        {status === 'loading' ? <p className="py-16 text-center text-sm text-slate-600">{text.home.loading}</p> : null}

        {status === 'error' ? (
          <div className="mx-auto flex min-h-[520px] max-w-xl flex-col items-center justify-center px-4 text-center">
            <p className="text-sm text-red-600">{error || text.home.loadError}</p>
            <button type="button" onClick={() => void loadData()} className="mt-4 rounded-md bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600">
              {text.home.retry}
            </button>
          </div>
        ) : null}

        {status === 'success' && videos.length === 0 ? (
          <div className="mx-auto flex min-h-[520px] max-w-xl flex-col items-center justify-center px-4 text-center">
            <p className="text-base font-semibold text-slate-900">Chưa có video nào được publish.</p>
            <p className="mt-2 text-sm text-slate-500">Hãy publish video từ Seller Center để thấy feed thật ở đây.</p>
            <Link href="/" className="mt-5 rounded-md border border-brand-300 bg-white px-5 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50">
              Về trang chủ
            </Link>
          </div>
        ) : null}

        {status === 'success' && currentVideo ? (
          <section aria-label="Shoppable video viewer" className="mx-auto min-h-[calc(100vh-184px)] max-w-[1240px] px-4 py-6">
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-orange-50/40 p-4 shadow-sm md:p-6">
              <div className="pointer-events-none absolute -left-20 top-24 h-56 w-56 rounded-full bg-brand-100/40 blur-3xl" />
              <div className="pointer-events-none absolute -right-16 bottom-12 h-44 w-44 rounded-full bg-orange-200/30 blur-3xl" />

              <div className="relative grid items-start gap-4 lg:grid-cols-[minmax(250px,320px)_minmax(300px,460px)_78px]">
                <aside className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
                  <div className="rounded-xl border border-slate-100 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Video Space</p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-900">Khám phá video mua sắm</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Feed được cập nhật liên tục từ nhiều shop, tập trung vào nội dung ngắn và sản phẩm có thể mua ngay.
                    </p>
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chủ đề nổi bật</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(topicTags.length > 0 ? topicTags : ['Thời trang', 'Công nghệ', 'Gia dụng']).map((tag) => (
                        <span key={tag} className="rounded-full border border-brand-100 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-100 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shop đang hoạt động</p>
                    <div className="mt-2 space-y-2">
                      {featuredShops.map((shop) => (
                        <div key={shop} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 text-sm font-medium text-slate-700">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                            {shop.trim().charAt(0).toUpperCase()}
                          </span>
                          <span className="line-clamp-1">{shop}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-100 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mô tả video</p>
                    <p className="mt-2 line-clamp-4 text-sm leading-6 text-slate-600">
                      {currentVideo.description || 'Seller chưa thêm mô tả cho video này.'}
                    </p>
                  </div>

                  {currentVideo.products.length > 0 ? (
                    <div className="mt-4 rounded-xl border border-slate-100 bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sản phẩm trong video</p>
                      <div className="mt-2 space-y-2">
                        {currentVideo.products.slice(0, 2).map((product) => (
                          <Link
                            key={product.productId}
                            href={`/products/${encodeURIComponent(product.productId)}`}
                            onClick={() => handleProductClick(currentVideo, product.productId)}
                            className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2 transition hover:border-brand-200 hover:bg-brand-50"
                          >
                            <Image
                              src={product.image ?? '/icon.svg'}
                              alt={product.name}
                              width={40}
                              height={40}
                              unoptimized
                              className="h-10 w-10 rounded-md object-cover"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-1 text-sm font-semibold text-slate-900">{product.name}</span>
                              <span className="block text-sm font-bold text-brand-600">{formatPrice(product.price)}</span>
                            </span>
                            <span className="rounded-md bg-brand-500 px-2.5 py-1 text-xs font-semibold text-white">Mua</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </aside>

                <article className="mx-auto w-full max-w-[460px] rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="mb-3 px-1">
                    {/* <p className="truncate text-xs font-semibold uppercase tracking-wide text-brand-600">{currentVideo.seller.shopName}</p> */}
                    <h1 className="mt-1 truncate text-lg font-semibold text-slate-950">{currentVideo.title}</h1>
                  </div>

                  <div className="relative mx-auto aspect-[9/16] max-h-[640px] overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {currentVideo.mediaUrl ? (
                      <video
                        key={currentVideo.videoId}
                        ref={videoRef}
                        src={currentVideo.mediaUrl}
                        poster={currentVideo.thumbnailUrl ?? undefined}
                        controls
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-contain"
                        onPlay={() => handlePlay(currentVideo)}
                        onTimeUpdate={(event) => handleTimeUpdate(currentVideo, event.currentTarget.currentTime)}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-slate-100 px-6 text-center text-sm text-slate-600">Video chưa có media</div>
                    )}

                    <div className="pointer-events-none absolute left-3 top-3 flex gap-2">
                      <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm">{currentVideo.metrics.qualifiedViewCount} views</span>
                      <span className="rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white shadow-sm">Published</span>
                    </div>
                  </div>

                </article>

                <div className="flex self-center min-h-[360px] flex-col items-center justify-center gap-3 lg:min-h-[640px]">
                  <NavigationButton direction="up" disabled={currentIndex <= 0} onClick={goPrevious} label="Video trước" />
                  <NavigationButton direction="down" disabled={currentIndex >= videos.length - 1} onClick={goNext} label="Video sau" />
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function NavigationButton({ direction, disabled, onClick, label }: { direction: 'up' | 'down'; disabled: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-slate-200/80 bg-white/70 text-2xl font-semibold text-brand-500/90 shadow-sm shadow-slate-200/40 backdrop-blur-sm transition hover:border-brand-200 hover:bg-white hover:text-brand-600 disabled:cursor-not-allowed disabled:text-slate-300 disabled:opacity-45 md:h-14 md:w-14"
    >
      {direction === 'up' ? '↑' : '↓'}
    </button>
  );
}

function buildEventPayload(video: BuyerVideo, extra: Record<string, unknown> = {}) {
  return {
    source: 'buyer_video_feed',
    anonymousSessionId: getAnonymousSessionId(),
    clientEventId: crypto.randomUUID(),
    ...extra,
    productId: typeof extra.productId === 'string' ? extra.productId : video.products[0]?.productId
  };
}

function getAnonymousSessionId(): string {
  const key = 'buyer_video_session_id';
  const existing = localStorage.getItem(key);
  if (existing) {
    return existing;
  }
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

function getProductIdFilter(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return new URLSearchParams(window.location.search).get('productId') ?? undefined;
}
