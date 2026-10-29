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
import { resolveMediaUrl } from '@/lib/media-url';
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
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [videoError, setVideoError] = useState(false);
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
  const keywords = useMemo(() => [
    'Shopee Video',
    'Deal Hot',
    'Xu Hướng',
    'Review Sản Phẩm',
    'Đồ Công Nghệ',
    'Thời Trang'
  ], []);
  const currentVideoId = currentVideo?.videoId ?? '';
  const currentVideoLiked = Boolean(accessToken && currentVideoId && likedVideoIds.has(currentVideoId));
  const chatEmojis = ['🔥', '❤️', '👍', '😍'];
  const commentSafety = useMemo(() => validateChatText(commentInput), [commentInput]);

  const resolvedMediaUrl = useMemo(() => resolveMediaUrl(currentVideo?.mediaUrl), [currentVideo?.mediaUrl]);
  const resolvedThumbnailUrl = useMemo(() => resolveMediaUrl(currentVideo?.thumbnailUrl), [currentVideo?.thumbnailUrl]);

  // Reset video player state when changing videos
  useEffect(() => {
    setVideoError(false);
    setIsPlaying(true);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {
        // Autoplay may require muted state in browser
        setIsPlaying(false);
      });
    }
  }, [currentVideoId]);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  }, []);

  const handlePlay = useCallback((video: BuyerVideo) => {
    setIsPlaying(true);
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
    <div className="min-h-screen bg-[#f5f5f5] text-[#222]">
      <Header keywords={keywords} />

      <main className="mx-auto w-full max-w-[1240px] px-3 py-4 md:px-4 md:py-6">
        {status === 'loading' ? (
          <div className="py-24 text-center">
            <span className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-[#ee4d2d] border-t-transparent" />
            <p className="mt-3 text-sm text-[#666]">{text.home.loading}</p>
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="mx-auto flex min-h-[460px] max-w-md flex-col items-center justify-center rounded-sm bg-white p-6 text-center shadow-sm">
            <p className="text-sm font-medium text-[#ee4d2d]">{error || text.home.loadError}</p>
            <button
              type="button"
              onClick={() => void loadData()}
              className="mt-4 rounded-sm bg-[#ee4d2d] px-5 py-2 text-sm font-bold text-white hover:bg-[#d73211]"
            >
              {text.home.retry}
            </button>
          </div>
        ) : null}

        {status === 'success' && videos.length === 0 ? (
          <div className="mx-auto flex min-h-[460px] max-w-md flex-col items-center justify-center rounded-sm bg-white p-6 text-center shadow-sm">
            <p className="text-base font-bold text-[#222]">Chưa có video nào được đăng tải.</p>
            <p className="mt-2 text-xs text-[#757575]">Hãy đăng tải video từ Kênh Người Bán để xem feed video tại đây.</p>
            <Link
              href="/"
              className="mt-5 rounded-sm border border-[#ee4d2d] bg-white px-5 py-2 text-xs font-bold text-[#ee4d2d] hover:bg-[#fef6f5]"
            >
              Về trang chủ
            </Link>
          </div>
        ) : null}

        {status === 'success' && currentVideo ? (
          <section aria-label="Shoppable video viewer">
            <div className="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)_340px]">
              {/* Left Column: Shop & Products */}
              <aside className="rounded-sm border border-[#e8e8e8] bg-white p-4 shadow-sm space-y-4">
                <Link
                  href={`/shops/${encodeURIComponent(currentVideo.seller.sellerId)}`}
                  className="flex items-center gap-3 border-b border-[#f1f1f1] pb-3 transition"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fef6f5] text-sm font-bold text-[#ee4d2d] border border-[#fcdcd7]">
                    {currentVideo.seller.shopName.trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[#222] hover:text-[#ee4d2d]">
                      {currentVideo.seller.shopName}
                    </span>
                    <span className="block text-[11px] text-[#757575] font-mono">{currentVideo.seller.sellerCode}</span>
                  </div>
                  <span className="shrink-0 rounded-sm border border-[#ee4d2d] px-2 py-0.5 text-[11px] font-semibold text-[#ee4d2d]">
                    Xem Shop
                  </span>
                </Link>

                {/* Description */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#757575]">Mô tả video</h3>
                  <p className="mt-1.5 text-xs text-[#555] leading-relaxed line-clamp-4">
                    {currentVideo.description || 'Người bán chưa thêm mô tả.'}
                  </p>
                </div>

                {/* Products in Video */}
                {currentVideo.products.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#757575] mb-2">
                      Sản phẩm trong video ({currentVideo.products.length})
                    </h3>
                    <div className="space-y-2">
                      {currentVideo.products.map((product) => (
                        <Link
                          key={product.productId}
                          href={`/products/${encodeURIComponent(product.productId)}`}
                          onClick={() => handleProductClick(currentVideo, product.productId)}
                          className="flex items-center gap-2.5 rounded-sm border border-[#e8e8e8] p-2 transition hover:border-[#ee4d2d]"
                        >
                          <Image
                            src={product.image ?? '/icon.svg'}
                            alt={product.name}
                            width={44}
                            height={44}
                            unoptimized
                            className="h-11 w-11 rounded-sm object-cover shrink-0 border border-[#f1f1f1]"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-xs font-semibold text-[#222]">{product.name}</p>
                            <p className="text-xs font-bold text-[#ee4d2d] mt-0.5">{formatPrice(product.price)}</p>
                          </div>
                          <span className="rounded-sm bg-[#ee4d2d] px-2.5 py-1 text-[11px] font-bold text-white shrink-0 hover:bg-[#d73211]">
                            Mua
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommended Products */}
                {recommendedProducts.length > 0 && (
                  <div className="border-t border-[#f1f1f1] pt-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#757575] mb-2">Gợi ý mua kèm</h3>
                    <div className="space-y-2">
                      {recommendedProducts.map((product) => (
                        <Link
                          key={product.id}
                          href={`/products/${encodeURIComponent(product.id)}`}
                          className="flex items-center gap-2 rounded-sm border border-[#f1f1f1] p-1.5 transition hover:border-[#ee4d2d]"
                        >
                          <Image
                            src={product.image || '/icon.svg'}
                            alt={product.title}
                            width={36}
                            height={36}
                            unoptimized
                            className="h-9 w-9 rounded-sm object-cover shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-xs text-[#222]">{product.title}</p>
                            <p className="text-xs font-bold text-[#ee4d2d]">{formatPrice(product.price)}</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </aside>

              {/* Center Column: Video Player */}
              <article className="rounded-sm border border-[#e8e8e8] bg-white p-3 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3 px-1 border-b border-[#f1f1f1] pb-2.5">
                  <h1 className="min-w-0 truncate text-base font-bold text-[#222]">{currentVideo.title}</h1>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToggleLike(currentVideo.videoId)}
                      aria-pressed={currentVideoLiked}
                      className={`inline-flex items-center gap-1 rounded-sm border px-2.5 py-1 text-xs font-bold transition ${
                        currentVideoLiked
                          ? 'border-[#ee4d2d] bg-[#fef6f5] text-[#ee4d2d]'
                          : 'border-[#e8e8e8] text-[#555] hover:border-[#ee4d2d] hover:text-[#ee4d2d]'
                      }`}
                    >
                      <span>{currentVideoLiked ? '♥' : '♡'}</span>
                      <span>Thích</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleShareVideo(currentVideo)}
                      className="rounded-sm border border-[#e8e8e8] px-2.5 py-1 text-xs font-semibold text-[#555] hover:border-[#ee4d2d] hover:text-[#ee4d2d]"
                    >
                      {shareStatus === 'copied' ? 'Đã copy link' : 'Chia sẻ'}
                    </button>
                  </div>
                </div>

                {likeStatus === 'login-required' && (
                  <p className="mb-2 text-xs font-medium text-[#ee4d2d]">Vui lòng đăng nhập để thích video.</p>
                )}

                {/* Main Video Box */}
                <div className="relative mx-auto aspect-[9/16] max-h-[min(640px,72vh)] overflow-hidden rounded-sm bg-black group select-none">
                  {resolvedMediaUrl && !videoError ? (
                    <>
                      <video
                        key={currentVideo.videoId}
                        ref={videoRef}
                        src={resolvedMediaUrl}
                        poster={resolvedThumbnailUrl || undefined}
                        autoPlay
                        muted={isMuted}
                        playsInline
                        loop
                        preload="auto"
                        onClick={togglePlay}
                        onError={() => setVideoError(true)}
                        className="h-full w-full object-contain cursor-pointer"
                        onPlay={() => handlePlay(currentVideo)}
                        onTimeUpdate={(e) => handleTimeUpdate(currentVideo, e.currentTarget.currentTime)}
                      />

                      {/* Play/Pause Overlay Icon when paused */}
                      {!isPlaying && (
                        <div
                          onClick={togglePlay}
                          className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
                        >
                          <div className="grid h-16 w-16 place-items-center rounded-full bg-black/60 text-white text-2xl shadow-lg border border-white/20 transition hover:scale-110">
                            ▶
                          </div>
                        </div>
                      )}

                      {/* Top Badges */}
                      <div className="absolute left-3 top-3 flex items-center gap-1.5 pointer-events-none">
                        <span className="rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-xs">
                          {currentVideo.metrics.qualifiedViewCount} views
                        </span>
                        <span className="rounded-full bg-[#ee4d2d] px-2.5 py-0.5 text-[10px] font-bold uppercase text-white">
                          Shopee Video
                        </span>
                      </div>

                      {/* Sound Toggle Button */}
                      <button
                        type="button"
                        onClick={toggleMute}
                        className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white text-xs hover:bg-black/80 transition shadow"
                        title={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
                      >
                        {isMuted ? '🔇' : '🔊'}
                      </button>
                    </>
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center bg-black p-6 text-center text-white">
                      <span className="text-3xl mb-2">📹</span>
                      <p className="text-xs font-semibold text-white/90">
                        {videoError ? 'Không thể tải được video này.' : 'Video chưa có tệp đa phương tiện.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setVideoError(false);
                          if (videoRef.current) videoRef.current.load();
                        }}
                        className="mt-3 rounded-sm bg-[#ee4d2d] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#d73211]"
                      >
                        Thử tải lại
                      </button>
                    </div>
                  )}
                </div>

                {/* Bottom Navigation controls */}
                <div className="mt-3 flex items-center justify-between border-t border-[#f1f1f1] pt-2.5 text-xs">
                  <button
                    type="button"
                    onClick={goPrevious}
                    disabled={currentIndex <= 0}
                    className="inline-flex items-center gap-1 rounded-sm border border-[#e8e8e8] px-3 py-1 font-semibold text-[#555] hover:border-[#ee4d2d] hover:text-[#ee4d2d] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>▲</span>
                    <span>Video trước</span>
                  </button>
                  <span className="text-[#757575] text-[11px]">
                    {currentIndex + 1} / {videos.length} video
                  </span>
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={currentIndex >= videos.length - 1}
                    className="inline-flex items-center gap-1 rounded-sm border border-[#e8e8e8] px-3 py-1 font-semibold text-[#555] hover:border-[#ee4d2d] hover:text-[#ee4d2d] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>Video tiếp</span>
                    <span>▼</span>
                  </button>
                </div>
              </article>

              {/* Right Column: Comments */}
              <aside className="rounded-sm border border-[#e8e8e8] bg-white shadow-sm flex flex-col h-[min(720px,82vh)]">
                <div className="flex items-center justify-between border-b border-[#f1f1f1] px-4 py-3 bg-[#fafafa]">
                  <div>
                    <h2 className="text-sm font-bold text-[#222]">Bình luận ({currentVideo.metrics.commentCount ?? comments.length})</h2>
                    <p className="text-[11px] text-[#757575]">
                      {accessToken ? 'Trao đổi cùng người bán và người mua.' : 'Đăng nhập để tham gia bình luận.'}
                    </p>
                  </div>
                </div>

                {/* Comments List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                  {commentsStatus === 'loading' && (
                    <p className="text-center text-xs text-[#757575] py-4">Đang tải bình luận...</p>
                  )}
                  {commentsStatus === 'error' && (
                    <p className="text-center text-xs text-[#ee4d2d] py-4">{commentError || 'Lỗi tải bình luận.'}</p>
                  )}
                  {commentsStatus === 'success' && comments.length === 0 && (
                    <p className="text-center text-xs text-[#757575] py-8">Chưa có bình luận nào. Hãy là người đầu tiên bình luận!</p>
                  )}
                  {comments.map((comment) => (
                    <div key={comment.commentId} className="flex gap-2.5 rounded-sm bg-[#fafafa] p-2.5 border border-[#f1f1f1]">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fef6f5] text-[11px] font-bold text-[#ee4d2d] border border-[#fcdcd7]">
                        {getCommentInitial(comment, user, commentNameMap)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-[#222]">{formatCommentAuthor(comment, user, commentNameMap)}</p>
                        <p className="mt-0.5 text-xs text-[#555] break-words">{comment.text}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Comment Input */}
                <div className="border-t border-[#f1f1f1] p-3 bg-white">
                  <div className="mb-2 flex gap-1">
                    {chatEmojis.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setCommentInput((c) => `${c}${emoji}`)}
                        disabled={!accessToken || commentSubmitting}
                        className="grid h-7 w-7 place-items-center rounded-sm border border-[#e8e8e8] bg-[#fafafa] text-xs hover:border-[#ee4d2d] disabled:opacity-40"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleSubmitComment();
                      }}
                      placeholder={accessToken ? 'Viết bình luận sản phẩm...' : 'Đăng nhập để gửi bình luận'}
                      className="min-w-0 flex-1 rounded-sm border border-[#e8e8e8] px-3 py-1.5 text-xs outline-none focus:border-[#ee4d2d]"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSubmitComment()}
                      disabled={!commentInput.trim() || !commentSafety.allowed || commentSubmitting}
                      className="rounded-sm bg-[#ee4d2d] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#d73211] disabled:opacity-50"
                    >
                      Gửi
                    </button>
                  </div>
                  {!commentSafety.allowed && commentInput.trim() && (
                    <p className="mt-1 text-[11px] text-[#ee4d2d]">{commentSafety.message}</p>
                  )}
                  {commentError && commentsStatus !== 'error' && (
                    <p className="mt-1 text-[11px] text-[#ee4d2d]">{commentError}</p>
                  )}
                </div>
              </aside>
            </div>
          </section>
        ) : null}
      </main>
    </div>
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
    // Ignore storage failures
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
