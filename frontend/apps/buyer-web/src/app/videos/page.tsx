'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { BuyerApiClientError } from '@/lib/api/client';
import { loadRecommendedProductItems } from '@/lib/api/recommendation-products';
import { createBuyerVideoComment, listBuyerVideoComments, listBuyerVideos, trackBuyerVideoEvent } from '@/lib/api/videos';
import type { BuyerVideo, BuyerVideoComment, ProductItem } from '@/lib/api/types';
import { validateChatText } from '@/lib/chat-safety';
import { formatPrice } from '@/lib/price';
import { useAuth, useLanguage } from '@/providers/AppProvider';

type VideosStatus = 'loading' | 'error' | 'success';
const BUYER_PROFILES_STORAGE_KEY = 'buyer_profiles';

export default function VideosPage() {
  const { text } = useLanguage();
  const { accessToken, user } = useAuth();
  const [status, setStatus] = useState<VideosStatus>('loading');
  const [error, setError] = useState('');
  const [videos, setVideos] = useState<BuyerVideo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [comments, setComments] = useState<BuyerVideoComment[]>([]);
  const [commentsStatus, setCommentsStatus] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [commentsCollapsed, setCommentsCollapsed] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [commentError, setCommentError] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [likedVideoIds, setLikedVideoIds] = useState<Set<string>>(() => new Set());
  const [likeStatus, setLikeStatus] = useState<'idle' | 'login-required'>('idle');
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [recommendedProducts, setRecommendedProducts] = useState<ProductItem[]>([]);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [commentNameMap, setCommentNameMap] = useState<Record<string, string>>({});
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackedQualifiedViews = useRef<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    setStatus('loading');
    setError('');

    try {
      const data = await listBuyerVideos({ page: 1, pageSize: 12, productId: getProductIdFilter() });
      const items = data.items ?? [];
      const requestedVideoId = getVideoIdFilter();
      const requestedIndex = requestedVideoId ? items.findIndex((video) => video.videoId === requestedVideoId) : -1;
      setVideos(items);
      setCurrentIndex(requestedIndex >= 0 ? requestedIndex : 0);
      setStatus('success');
    } catch (loadError) {
      setError(loadError instanceof BuyerApiClientError ? loadError.message : text.home.loadError);
      setStatus('error');
    }
  }, [text.home.loadError]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setLikedVideoIds(readLikedVideoIds());
  }, []);

  useEffect(() => {
    setCommentNameMap(() => {
      const names = readBuyerProfileNames();
      if (user?.id && user.name.trim()) {
        names[user.id] = user.name.trim();
      }
      return names;
    });
  }, [user?.id, user?.name]);

  const currentVideo = videos[currentIndex] ?? null;
  const keywords = useMemo(() => videos.flatMap((video) => video.products.map((product) => product.name)).slice(0, 8), [videos]);
  const currentVideoId = currentVideo?.videoId ?? '';
  const currentVideoLiked = Boolean(accessToken && currentVideoId && likedVideoIds.has(currentVideoId));
  const chatEmojis = ['🔥', '❤️', '👍', '😍'];
  const commentSafety = useMemo(() => validateChatText(commentInput), [commentInput]);

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

  const loadComments = useCallback(async (videoId: string) => {
    setCommentsStatus('loading');
    setCommentError('');
    try {
      const result = await listBuyerVideoComments(videoId, { page: 1, pageSize: 30 });
      setComments(result.items ?? []);
      setCommentsStatus('success');
    } catch (loadError) {
      setComments([]);
      setCommentsStatus('error');
      setCommentError(loadError instanceof BuyerApiClientError ? loadError.message : 'Không thể tải bình luận.');
    }
  }, []);

  const handleSubmitComment = useCallback(async () => {
    const textValue = commentInput.trim();
    if (!currentVideo || !textValue || commentSubmitting) {
      return;
    }
    if (!accessToken) {
      setCommentError('Bạn cần đăng nhập để bình luận.');
      return;
    }
    if (!commentSafety.allowed) {
      setCommentError(commentSafety.message ?? 'Bình luận không phù hợp.');
      return;
    }

    setCommentSubmitting(true);
    setCommentError('');
    try {
      const created = await createBuyerVideoComment(
        currentVideo.videoId,
        {
          text: textValue,
          clientCommentId: createClientCommentId()
        },
        accessToken
      );
      setComments((current) => {
        if (current.some((comment) => comment.commentId === created.commentId)) {
          return current;
        }
        return [created, ...current].slice(0, 100);
      });
      setCommentInput('');
      setVideos((current) =>
        current.map((video) =>
          video.videoId === currentVideo.videoId
            ? { ...video, metrics: { ...video.metrics, commentCount: (video.metrics.commentCount ?? 0) + 1 } }
            : video
        )
      );
    } catch (submitError) {
      setCommentError(submitError instanceof BuyerApiClientError ? submitError.message : 'Không thể gửi bình luận.');
    } finally {
      setCommentSubmitting(false);
    }
  }, [accessToken, commentInput, commentSafety.allowed, commentSafety.message, commentSubmitting, currentVideo]);

  const handleToggleLike = useCallback((videoId: string) => {
    if (!accessToken) {
      setLikeStatus('login-required');
      return;
    }

    setLikeStatus('idle');
    setLikedVideoIds((current) => {
      const next = new Set(current);
      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        next.add(videoId);
      }
      writeLikedVideoIds(next);
      return next;
    });
  }, [accessToken]);

  const handleShareVideo = useCallback(async (video: BuyerVideo) => {
    const shareUrl = buildVideoShareUrl(video.videoId);
    if (!shareUrl) {
      setShareStatus('error');
      return;
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        setShareStatus('copied');
        return;
      }

      setShareStatus('error');
    } catch {
      setShareStatus('error');
    }
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

  useEffect(() => {
    if (!currentVideoId) {
      setComments([]);
      setCommentsStatus('idle');
      return;
    }
    void loadComments(currentVideoId);
  }, [currentVideoId, loadComments]);

  useEffect(() => {
    setShareStatus('idle');
    setLikeStatus('idle');
  }, [currentVideoId]);

  useEffect(() => {
    const productIds = currentVideo?.products.map((product) => product.productId) ?? [];
    if (productIds.length === 0) {
      setRecommendedProducts([]);
      return;
    }

    let cancelled = false;
    async function loadRecommendations() {
      setRecommendationLoading(true);
      try {
        const items = await loadRecommendedProductItems(productIds, 4);
        if (!cancelled) {
          setRecommendedProducts(items);
        }
      } catch {
        if (!cancelled) {
          setRecommendedProducts([]);
        }
      } finally {
        if (!cancelled) {
          setRecommendationLoading(false);
        }
      }
    }

    void loadRecommendations();
    return () => {
      cancelled = true;
    };
  }, [currentVideo]);

  useEffect(() => {
    if (shareStatus !== 'copied') {
      return;
    }

    const timer = window.setTimeout(() => setShareStatus('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [shareStatus]);

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
          <section aria-label="Shoppable video viewer" className="mx-auto min-h-[calc(100vh-184px)] max-w-[1180px] px-4 py-6">
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
              <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-24">
                <Link
                  href={`/shops/${encodeURIComponent(currentVideo.seller.sellerId)}`}
                  className="flex items-center gap-3 border-b border-slate-100 pb-4 transition hover:border-brand-100"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                    {currentVideo.seller.shopName.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Shop</span>
                    <span className="block truncate text-sm font-semibold text-slate-900">{currentVideo.seller.shopName}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{currentVideo.seller.sellerCode}</span>
                  </span>
                  <span className="ml-auto shrink-0 rounded-md border border-brand-100 px-2 py-1 text-xs font-semibold text-brand-600">Xem shop</span>
                </Link>

                <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50 px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Mua sắm trong video</p>
                  <ul className="mt-2 space-y-1.5 text-sm leading-5 text-slate-700">
                    <li>Chọn sản phẩm bên dưới để xem chi tiết.</li>
                    <li>Vào shop để xem thêm sản phẩm cùng người bán.</li>
                    <li>Hỏi shop ngay nếu bạn cần thêm thông tin sản phẩm.</li>
                  </ul>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mô tả video</p>
                  <p className="mt-2 line-clamp-5 text-sm leading-6 text-slate-600">
                    {currentVideo.description || 'Seller chưa thêm mô tả cho video này.'}
                  </p>
                </div>

                {currentVideo.products.length > 0 ? (
                  <div className="mt-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sản phẩm trong video</p>
                    <div className="mt-2 space-y-2">
                      {currentVideo.products.slice(0, 3).map((product) => (
                        <Link
                          key={product.productId}
                          href={`/products/${encodeURIComponent(product.productId)}`}
                          onClick={() => handleProductClick(currentVideo, product.productId)}
                          className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2 transition hover:border-brand-200 hover:bg-brand-50"
                        >
                          <Image
                            src={product.image ?? '/icon.svg'}
                            alt={product.name}
                            width={44}
                            height={44}
                            unoptimized
                            className="h-11 w-11 rounded-md object-cover"
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

                {recommendationLoading || recommendedProducts.length > 0 ? (
                  <div className="mt-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mua kèm phổ biến</p>
                    <div className="mt-2 space-y-2">
                      {recommendedProducts.map((product) => (
                        <Link
                          key={product.id}
                          href={`/products/${encodeURIComponent(product.id)}`}
                          className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white p-2 transition hover:border-brand-200 hover:bg-brand-50"
                        >
                          <Image
                            src={product.image || '/icon.svg'}
                            alt={product.title}
                            width={44}
                            height={44}
                            unoptimized
                            className="h-11 w-11 rounded-md object-cover"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-1 text-sm font-semibold text-slate-900">{product.title}</span>
                            <span className="block text-sm font-bold text-brand-600">{formatPrice(product.price)}</span>
                          </span>
                        </Link>
                      ))}
                      {recommendationLoading && recommendedProducts.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-2 text-xs text-slate-500">
                          Đang tải gợi ý...
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </aside>

              <div className="relative min-w-0">
                <div className="grid items-start gap-4 xl:grid-cols-[minmax(300px,430px)_minmax(280px,340px)]">
                  <article className="mx-auto w-full max-w-[430px] rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="mb-3 flex items-start justify-between gap-3 px-1">
                      {/* <p className="truncate text-xs font-semibold uppercase tracking-wide text-brand-600">{currentVideo.seller.shopName}</p> */}
                      <h1 className="mt-1 min-w-0 truncate text-lg font-semibold text-slate-950">{currentVideo.title}</h1>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleLike(currentVideo.videoId)}
                          aria-pressed={currentVideoLiked}
                          aria-label={currentVideoLiked ? 'Bỏ tym video' : 'Tym video'}
                          className={`flex h-9 w-9 items-center justify-center rounded-full border text-lg font-bold transition ${
                            currentVideoLiked
                              ? 'border-brand-200 bg-brand-50 text-brand-600'
                              : 'border-slate-200 bg-white text-slate-500 hover:border-brand-200 hover:text-brand-600'
                          }`}
                        >
                          {currentVideoLiked ? '♥' : '♡'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleShareVideo(currentVideo)}
                          aria-label="Chia sẻ video"
                          className="flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-brand-200 hover:text-brand-600"
                        >
                          Chia sẻ
                        </button>
                      </div>
                    </div>
                    {likeStatus === 'login-required' ? <p className="mb-2 px-1 text-xs font-medium text-red-600">Đăng nhập để tiếp tục.</p> : null}
                    {shareStatus === 'copied' ? <p className="mb-2 px-1 text-xs font-medium text-brand-600">Đã copy link video.</p> : null}
                    {shareStatus === 'error' ? <p className="mb-2 px-1 text-xs font-medium text-red-600">Không thể chia sẻ video lúc này.</p> : null}

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
                        <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm">
                          {currentVideo.metrics.commentCount ?? 0} bình luận
                        </span>
                        <span className="rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white shadow-sm">Published</span>
                      </div>
                    </div>
                  </article>

                  <aside className="rounded-2xl border border-[#ead8ca] bg-white shadow-[0_18px_60px_rgba(38,31,26,0.08)] xl:sticky xl:top-24">
                    <section className="overflow-hidden rounded-2xl">
                      <div className="flex items-center justify-between border-b border-[#ebe3d8] bg-[#fffdfa] px-4 py-3">
                        <div>
                          <h2 className="text-lg font-bold text-slate-900">Bình luận</h2>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {accessToken ? 'Trao đổi với shop và người mua khác.' : 'Đăng nhập để tham gia bình luận.'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-500">{currentVideo.metrics.commentCount ?? comments.length}</span>
                          <button
                            type="button"
                            onClick={() => setCommentsCollapsed((current) => !current)}
                            aria-expanded={!commentsCollapsed}
                            aria-label={commentsCollapsed ? 'Hiện bình luận' : 'Ẩn bình luận'}
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-[#ead8ca] bg-white text-xs font-bold text-slate-500 transition hover:border-brand-200 hover:text-brand-600"
                          >
                            {commentsCollapsed ? '↓' : '↑'}
                          </button>
                        </div>
                      </div>
                      {!commentsCollapsed ? (
                        <div className="flex max-h-[640px] min-h-[360px] flex-col xl:h-[640px]">
                          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#fffdfa] p-3">
                            {commentsStatus === 'loading' ? <p className="text-sm text-slate-500">Đang tải bình luận...</p> : null}
                            {commentsStatus === 'error' ? <p className="text-sm text-red-600">{commentError || 'Không thể tải bình luận.'}</p> : null}
                            {commentsStatus === 'success' && comments.length === 0 ? <p className="text-sm text-slate-500">Chưa có bình luận.</p> : null}
                            {comments.map((comment) => (
                              <div key={comment.commentId} className="flex gap-2.5 rounded-2xl bg-[#f8f6f1] p-3">
                                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${getCommentAvatarColor(comment.userRole)}`}>
                                  {getCommentInitial(comment, user, commentNameMap)}
                                </span>
                                <span className="min-w-0">
                                  <p className={`text-xs font-bold ${getCommentNameColor(comment.userRole)}`}>{formatCommentAuthor(comment, user, commentNameMap)}</p>
                                  <p className="mt-1 break-words text-sm leading-5 text-slate-900">{comment.text}</p>
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="border-t border-[#ebe3d8] bg-white p-3">
                            <div className="mb-2 flex gap-1.5">
                              {chatEmojis.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => setCommentInput((current) => `${current}${emoji}`)}
                                  disabled={!accessToken || commentSubmitting}
                                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[#ead8ca] bg-[#fff8f3] text-sm transition hover:border-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <input
                                value={commentInput}
                                onChange={(event) => setCommentInput(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    void handleSubmitComment();
                                  }
                                }}
                                placeholder={accessToken ? 'Chỉ trao đổi về sản phẩm trên eMall...' : 'Đăng nhập để bình luận'}
                                className="min-w-0 flex-1 rounded-xl border border-[#d7d0c5] bg-[#fbfaf7] px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:bg-white"
                              />
                              <button
                                type="button"
                                onClick={() => void handleSubmitComment()}
                                disabled={!commentInput.trim() || !commentSafety.allowed || commentSubmitting}
                                className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Gửi
                              </button>
                            </div>
                            {!commentSafety.allowed && commentInput.trim() ? (
                              <p className="mt-2 text-xs font-semibold text-[#c2410c]">{commentSafety.message}</p>
                            ) : null}
                            {commentError && commentsStatus !== 'error' ? <p className="mt-2 text-xs font-medium text-red-600">{commentError}</p> : null}
                          </div>
                        </div>
                      ) : null}
                    </section>
                  </aside>
                </div>

                <div className="mt-4 flex justify-center gap-3 xl:absolute xl:-right-16 xl:top-1/2 xl:mt-0 xl:-translate-y-1/2 xl:flex-col">
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

function formatCommentAuthor(
  comment: BuyerVideoComment,
  currentUser: { id: string; name: string } | null,
  knownNames: Record<string, string>
): string {
  if (currentUser?.id === comment.userId && currentUser.name.trim()) {
    return currentUser.name.trim();
  }

  const knownName = knownNames[comment.userId]?.trim();
  if (knownName) {
    return knownName;
  }

  const role = comment.userRole.trim().toUpperCase();
  if (role === 'BUYER' || role === 'CUSTOMER') {
    return 'Khách hàng';
  }
  if (role === 'SELLER') {
    return 'Shop';
  }

  return 'Quản trị viên';
}

function getCommentInitial(
  comment: BuyerVideoComment,
  currentUser: { id: string; name: string } | null,
  knownNames: Record<string, string>
): string {
  const author = formatCommentAuthor(comment, currentUser, knownNames);
  return (author.trim().charAt(0) || 'U').toUpperCase();
}

function getCommentAvatarColor(userRole: string): string {
  const normalizedRole = userRole.toLowerCase();
  if (normalizedRole.includes('seller')) {
    return 'bg-brand-500';
  }
  if (normalizedRole.includes('admin') || normalizedRole.includes('moderator')) {
    return 'bg-slate-700';
  }
  return 'bg-[#f59e0b]';
}

function getCommentNameColor(userRole: string): string {
  const normalizedRole = userRole.toLowerCase();
  if (normalizedRole.includes('seller')) {
    return 'text-brand-600';
  }
  if (normalizedRole.includes('admin') || normalizedRole.includes('moderator')) {
    return 'text-slate-700';
  }
  return 'text-[#b45309]';
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

function createClientCommentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `comment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readLikedVideoIds(): Set<string> {
  if (typeof window === 'undefined') {
    return new Set();
  }

  try {
    const raw = window.localStorage.getItem('buyer_video_liked_ids');
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeLikedVideoIds(videoIds: Set<string>) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem('buyer_video_liked_ids', JSON.stringify(Array.from(videoIds)));
  } catch {
    // Ignore storage failures; the visual state still updates for this session.
  }
}

function readBuyerProfileNames(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(BUYER_PROFILES_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, string>>((accumulator, [userId, profile]) => {
      if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
        return accumulator;
      }

      const name = (profile as { name?: unknown }).name;
      if (typeof name === 'string' && name.trim()) {
        accumulator[userId] = name.trim();
      }

      return accumulator;
    }, {});
  } catch {
    return {};
  }
}

function buildVideoShareUrl(videoId: string): string {
  if (typeof window === 'undefined') {
    return '';
  }

  const url = new URL(window.location.href);
  url.pathname = '/videos';
  url.searchParams.set('videoId', videoId);
  return url.toString();
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

function getVideoIdFilter(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return new URLSearchParams(window.location.search).get('videoId') ?? undefined;
}
