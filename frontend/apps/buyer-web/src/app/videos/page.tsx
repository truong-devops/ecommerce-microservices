'use client';

import Link from 'next/link';
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
  const trackedQualifiedViews = useRef<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    setStatus('loading');
    setError('');

    try {
      const data = await listBuyerVideos({ page: 1, pageSize: 12 });
      setVideos(data.items ?? []);
      setStatus('success');
    } catch (loadError) {
      setError(loadError instanceof BuyerApiClientError ? loadError.message : text.home.loadError);
      setStatus('error');
    }
  }, [text.home.loadError]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const keywords = useMemo(() => videos.flatMap((video) => video.products.map((product) => product.name)).slice(0, 8), [videos]);

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

  return (
    <div className="min-h-screen bg-app-bg text-slate-900">
      <Header keywords={keywords} />

      <main className="mx-auto w-full max-w-[1220px] px-3 py-4 md:px-4 md:py-6">
        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">{text.home.videoHighlightsTitle}</h1>
              <p className="mt-1 text-sm text-slate-600">Xem video thật từ seller, click sản phẩm trong video để mua nhanh.</p>
            </div>
            <Link href="/" className="rounded-md border border-brand-500 px-3 py-2 text-sm font-semibold text-brand-600 transition hover:bg-brand-50">
              Về trang chủ
            </Link>
          </div>

          {status === 'loading' ? <p className="py-8 text-center text-sm text-slate-600">{text.home.loading}</p> : null}

          {status === 'error' ? (
            <div className="py-8 text-center">
              <p className="text-sm text-red-600">{error || text.home.loadError}</p>
              <button type="button" onClick={() => void loadData()} className="mt-3 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
                {text.home.retry}
              </button>
            </div>
          ) : null}

          {status === 'success' && videos.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <p className="text-sm font-medium text-slate-700">Chưa có video nào được publish.</p>
              <p className="mt-1 text-sm text-slate-500">Hãy publish video từ Seller Center để thấy feed thật ở đây.</p>
            </div>
          ) : null}

          {status === 'success' && videos.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {videos.map((video) => (
                <article key={video.videoId} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="grid gap-0 md:grid-cols-[minmax(0,0.95fr)_minmax(260px,0.8fr)]">
                    <div className="relative bg-slate-950">
                      {video.mediaUrl ? (
                        <video
                          src={video.mediaUrl}
                          poster={video.thumbnailUrl ?? undefined}
                          controls
                          playsInline
                          className="aspect-[9/14] h-full min-h-[420px] w-full object-cover"
                          onPlay={() => handlePlay(video)}
                          onTimeUpdate={(event) => handleTimeUpdate(video, event.currentTarget.currentTime)}
                        />
                      ) : (
                        <div className="flex aspect-[9/14] min-h-[420px] items-center justify-center bg-slate-900 text-sm text-white">Video chưa có media</div>
                      )}
                      <span className="absolute left-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
                        {video.metrics.qualifiedViewCount} views
                      </span>
                    </div>

                    <div className="flex flex-col p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{video.seller.shopName}</p>
                      <h2 className="mt-1 text-lg font-semibold text-slate-900">{video.title}</h2>
                      <p className="mt-2 line-clamp-3 text-sm text-slate-600">{video.description || 'Seller chưa thêm mô tả cho video này.'}</p>

                      <div className="mt-4 space-y-3">
                        {video.products.map((product) => (
                          <Link
                            key={product.productId}
                            href={`/products/${encodeURIComponent(product.productId)}`}
                            onClick={() => handleProductClick(video, product.productId)}
                            className="flex gap-3 rounded-lg border border-slate-200 p-3 transition hover:border-brand-500 hover:bg-brand-50"
                          >
                            <img src={product.image ?? '/icon.svg'} alt={product.name} className="h-16 w-16 rounded-md object-cover" />
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-2 text-sm font-semibold text-slate-900">{product.name}</span>
                              <span className="mt-1 block text-base font-bold text-brand-600">{formatPrice(product.price)}</span>
                              <span className="mt-1 block text-xs text-slate-500">Click để xem chi tiết</span>
                            </span>
                          </Link>
                        ))}
                      </div>

                      <div className="mt-auto pt-4 text-xs text-slate-500">
                        CTR {(video.metrics.ctr * 100).toFixed(1)}% · {video.metrics.productClickCount} product clicks
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </main>
    </div>
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
