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
type SidebarTab = 'products' | 'comments' | 'playlist';
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
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('products');
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const trackedQualifiedViews = useRef<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    setStatus('loading');
    setError('');

    try {
      const data = await listBuyerVideos({ page: 1, pageSize: 24, productId: getProductIdFilter() });
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
  const chatEmojis = ['🔥', '❤️', '👍', '😍', '💯', '✨'];
  const commentSafety = useMemo(() => validateChatText(commentInput), [commentInput]);

  const resolvedMediaUrl = useMemo(() => resolveMediaUrl(currentVideo?.mediaUrl), [currentVideo?.mediaUrl]);
  const resolvedThumbnailUrl = useMemo(() => resolveMediaUrl(currentVideo?.thumbnailUrl), [currentVideo?.thumbnailUrl]);

  // Reset video player state when changing videos
  useEffect(() => {
    setVideoError(false);
    setIsPlaying(true);
    setDescriptionExpanded(false);
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

  const toggleFullscreen = useCallback(() => {
    if (!videoContainerRef.current) return;
    if (!document.fullscreenElement) {
      videoContainerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
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

  const handleOpenChatWithShop = useCallback(() => {
    if (!accessToken) {
      setLikeStatus('login-required');
      return;
    }
    if (typeof window === 'undefined' || !currentVideo?.seller?.sellerId) return;
    window.dispatchEvent(
      new CustomEvent('buyer-chat:open', {
        detail: {
          sellerId: currentVideo.seller.sellerId,
          sellerName: currentVideo.seller.shopName
        }
      })
    );
  }, [accessToken, currentVideo?.seller?.sellerId, currentVideo?.seller?.shopName]);

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
      if (['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName)) {
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrevious();
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
      }
      if (event.key === ' ' || event.key === 'k') {
        event.preventDefault();
        togglePlay();
      }
      if (event.key === 'm') {
        event.preventDefault();
        toggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrevious, toggleMute, togglePlay]);

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

  const pinnedProduct = currentVideo?.products?.[0] ?? null;

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#222222]">
      <Header keywords={keywords} />

      <main className="mx-auto w-full max-w-[1320px] px-2 py-2 sm:px-4 sm:py-3">
        {status === 'loading' ? (
          <div className="py-24 text-center">
            <span className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-[#ee4d2d] border-t-transparent" />
            <p className="mt-3 text-xs text-[#757575]">{text.home.loading}</p>
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="mx-auto flex min-h-[420px] max-w-md flex-col items-center justify-center rounded-xs bg-white p-6 text-center shadow-xs border border-[#e8e8e8]">
            <p className="text-sm font-semibold text-[#ee4d2d]">{error || text.home.loadError}</p>
            <button
              type="button"
              onClick={() => void loadData()}
              className="mt-4 rounded-xs bg-[#ee4d2d] px-5 py-2 text-xs font-bold text-white hover:bg-[#d73211] transition"
            >
              {text.home.retry}
            </button>
          </div>
        ) : null}

        {status === 'success' && videos.length === 0 ? (
          <div className="mx-auto flex min-h-[420px] max-w-md flex-col items-center justify-center rounded-xs bg-white p-8 text-center shadow-xs border border-[#e8e8e8]">
            <span className="text-4xl mb-3">🎬</span>
            <p className="text-base font-bold text-[#222222]">Chưa có video nào được đăng tải.</p>
            <p className="mt-2 text-xs text-[#757575] leading-relaxed">
              Các video review và deal độc quyền từ các Shop sẽ xuất hiện tại đây khi người bán đăng tải.
            </p>
            <Link
              href="/"
              className="mt-5 rounded-xs border border-[#ee4d2d] bg-white px-5 py-2 text-xs font-bold text-[#ee4d2d] hover:bg-[#fef6f5] transition"
            >
              Khám phá trang chủ
            </Link>
          </div>
        ) : null}

        {status === 'success' && currentVideo ? (
          <section
            aria-label="Shopee Video theater"
            className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_380px] h-[calc(100vh-125px)] min-h-[500px] max-h-[760px]"
          >
            {/* Left Column: Full-Screen Fit Video Player Theater */}
            <div className="relative h-full flex flex-col min-w-0">
              <div
                ref={videoContainerRef}
                className="relative flex-1 overflow-hidden rounded-xs bg-[#0b0b0c] border border-[#e5e5e5] flex items-center justify-center select-none group shadow-xs"
              >
                {/* Ambient Backdrop Glow: Prevents stark black letterbox */}
                {resolvedThumbnailUrl && (
                  <div
                    style={{ backgroundImage: `url(${resolvedThumbnailUrl})` }}
                    className="absolute inset-0 bg-cover bg-center filter blur-3xl opacity-25 scale-125 pointer-events-none"
                  />
                )}

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
                      className="relative z-10 max-h-full max-w-full w-auto h-auto object-contain mx-auto cursor-pointer"
                      onPlay={() => handlePlay(currentVideo)}
                      onTimeUpdate={(e) => handleTimeUpdate(currentVideo, e.currentTarget.currentTime)}
                    />

                    {/* Centered Play Overlay Icon when paused */}
                    {!isPlaying && (
                      <div
                        onClick={togglePlay}
                        className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 cursor-pointer transition-opacity"
                      >
                        <div className="grid h-16 w-16 place-items-center rounded-full bg-black/60 text-white text-2xl shadow-xl border border-white/25 transition hover:scale-110">
                          ▶
                        </div>
                      </div>
                    )}

                    {/* Top Badges Overlay */}
                    <div className="absolute left-3 top-3 z-20 flex items-center gap-2 pointer-events-none">
                      <span className="rounded-full bg-[#ee4d2d] px-2.5 py-0.5 text-[11px] font-bold text-white shadow-xs">
                        Shopee Video
                      </span>
                      <span className="rounded-full bg-black/65 backdrop-blur-xs px-2.5 py-0.5 text-[11px] font-medium text-white/95">
                        {currentVideo.metrics.qualifiedViewCount} lượt xem
                      </span>
                    </div>

                    {/* Top Right Controls Overlay: Mute & Fullscreen */}
                    <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={toggleMute}
                        className="grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white text-xs hover:bg-black/80 transition shadow-sm backdrop-blur-xs"
                        title={isMuted ? 'Bật âm thanh (M)' : 'Tắt âm thanh (M)'}
                      >
                        {isMuted ? '🔇' : '🔊'}
                      </button>
                      <button
                        type="button"
                        onClick={toggleFullscreen}
                        className="grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white text-xs hover:bg-black/80 transition shadow-sm backdrop-blur-xs"
                        title="Toàn màn hình"
                      >
                        ⛶
                      </button>
                    </div>

                    {/* Side Navigation Arrow Buttons */}
                    <button
                      type="button"
                      onClick={goPrevious}
                      disabled={currentIndex <= 0}
                      className="absolute left-3 top-1/2 -translate-y-1/2 z-20 grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white text-xl hover:bg-black/80 transition shadow-md disabled:opacity-0 disabled:pointer-events-none"
                      title="Video trước (Phím ← hoặc ↑)"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={goNext}
                      disabled={currentIndex >= videos.length - 1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 z-20 grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white text-xl hover:bg-black/80 transition shadow-md disabled:opacity-0 disabled:pointer-events-none"
                      title="Video tiếp (Phím → hoặc ↓)"
                    >
                      ›
                    </button>

                    {/* Floating Bottom-Left Pinned Product Card (Signature Shopee Video feature) */}
                    {pinnedProduct && (
                      <div className="absolute left-3 bottom-3 z-20 max-w-[calc(100%-24px)] sm:max-w-xs">
                        <Link
                          href={`/products/${encodeURIComponent(pinnedProduct.productId)}`}
                          onClick={() => handleProductClick(currentVideo, pinnedProduct.productId)}
                          className="flex items-center gap-2.5 rounded-xs bg-white/95 backdrop-blur-sm p-2 shadow-lg border border-white/80 transition hover:bg-white"
                        >
                          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xs border border-[#f1f1f1] bg-slate-100">
                            <Image
                              src={pinnedProduct.image ?? '/icon.svg'}
                              alt={pinnedProduct.name}
                              width={40}
                              height={40}
                              unoptimized
                              className="h-full w-full object-cover"
                            />
                            <span className="absolute left-0.5 top-0.5 rounded-full bg-[#ee4d2d] px-1 py-0.2 text-[8px] font-bold text-white">
                              Ghim
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-[11px] font-semibold text-[#222222]">{pinnedProduct.name}</p>
                            <p className="text-xs font-bold text-[#ee4d2d] mt-0.5">{formatPrice(pinnedProduct.price)}</p>
                          </div>
                          <span className="shrink-0 rounded-xs bg-[#ee4d2d] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#d73211] transition shadow-xs">
                            Mua ngay
                          </span>
                        </Link>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="relative z-10 flex h-full w-full flex-col items-center justify-center p-6 text-center text-white">
                    <span className="text-4xl mb-2">📹</span>
                    <p className="text-xs font-semibold text-white/90">
                      {videoError ? 'Không thể tải được nội dung video này.' : 'Video chưa có tệp đa phương tiện.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setVideoError(false);
                        if (videoRef.current) videoRef.current.load();
                      }}
                      className="mt-3 rounded-xs bg-[#ee4d2d] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#d73211] transition"
                    >
                      Thử tải lại
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Tabbed Sidebar fitted to player height */}
            <aside className="h-full flex flex-col rounded-xs border border-[#e8e8e8] bg-white shadow-xs overflow-hidden">
              {/* Sidebar Header: Shop Info, Title & Interactions */}
              <div className="p-3 border-b border-[#f1f1f1] bg-white space-y-2.5 shrink-0">
                {/* Shop Row */}
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/shops/${encodeURIComponent(currentVideo.seller.sellerId)}`}
                    className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-90 transition"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#fef6f5] text-xs font-bold text-[#ee4d2d] border border-[#fcdcd7]">
                      {currentVideo.seller.shopName.trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="truncate text-xs font-bold text-[#222222] hover:text-[#ee4d2d]">
                          {currentVideo.seller.shopName}
                        </span>
                        <span className="rounded-full bg-[#fef6f5] px-1 py-0.2 text-[8px] font-bold text-[#ee4d2d] border border-[#fcdcd7]">
                          SHOP
                        </span>
                      </div>
                      <span className="block text-[10px] font-mono text-[#757575] truncate">
                        {currentVideo.seller.sellerCode}
                      </span>
                    </div>
                  </Link>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleOpenChatWithShop}
                      className="rounded-xs border border-[#e8e8e8] px-2 py-1 text-[11px] font-semibold text-[#555555] hover:border-[#ee4d2d] hover:text-[#ee4d2d] transition"
                    >
                      Chat
                    </button>
                    <Link
                      href={`/shops/${encodeURIComponent(currentVideo.seller.sellerId)}`}
                      className="rounded-xs border border-[#ee4d2d] bg-[#fef6f5] px-2 py-1 text-[11px] font-bold text-[#ee4d2d] hover:bg-[#ee4d2d] hover:text-white transition"
                    >
                      Xem Shop
                    </Link>
                  </div>
                </div>

                {/* Video Title & Actions */}
                <div className="flex items-start justify-between gap-2 pt-1">
                  <h1 className="line-clamp-2 text-xs font-bold text-[#222222] min-w-0 flex-1">
                    {currentVideo.title}
                  </h1>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleLike(currentVideo.videoId)}
                      aria-pressed={currentVideoLiked}
                      className={`inline-flex items-center gap-1 rounded-xs border px-2 py-1 text-[11px] font-bold transition shadow-2xs ${
                        currentVideoLiked
                          ? 'border-[#ee4d2d] bg-[#fef6f5] text-[#ee4d2d]'
                          : 'border-[#e8e8e8] text-[#555555] hover:border-[#ee4d2d] hover:text-[#ee4d2d]'
                      }`}
                    >
                      <span>{currentVideoLiked ? '♥' : '♡'}</span>
                      <span>Thích</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleShareVideo(currentVideo)}
                      className="inline-flex items-center rounded-xs border border-[#e8e8e8] px-2 py-1 text-[11px] font-semibold text-[#555555] hover:border-[#ee4d2d] hover:text-[#ee4d2d] transition shadow-2xs"
                      title="Chia sẻ link video"
                    >
                      {shareStatus === 'copied' ? 'Đã copy' : 'Chia sẻ'}
                    </button>
                  </div>
                </div>

                {likeStatus === 'login-required' && (
                  <p className="text-[11px] font-medium text-[#ee4d2d]">Vui lòng đăng nhập để thích video này.</p>
                )}

                {/* Description toggle */}
                {currentVideo.description && (
                  <div className="text-[11px] text-[#555555] leading-relaxed pt-0.5">
                    <p className={descriptionExpanded ? '' : 'line-clamp-1'}>
                      {currentVideo.description}
                    </p>
                    {currentVideo.description.length > 60 && (
                      <button
                        type="button"
                        onClick={() => setDescriptionExpanded((v) => !v)}
                        className="text-[10px] font-semibold text-[#ee4d2d] hover:underline"
                      >
                        {descriptionExpanded ? 'Thu gọn ▲' : 'Xem thêm ▼'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Sidebar Tabs Switcher (3 Tabs: Sản phẩm, Bình luận, Video khác) */}
              <div className="flex border-b border-[#f1f1f1] bg-[#fafafa] shrink-0">
                <button
                  type="button"
                  onClick={() => setSidebarTab('products')}
                  className={`flex-1 py-2 text-[11px] font-bold transition border-b-2 text-center ${
                    sidebarTab === 'products'
                      ? 'border-[#ee4d2d] text-[#ee4d2d] bg-white'
                      : 'border-transparent text-[#666666] hover:text-[#222222]'
                  }`}
                >
                  Sản phẩm ({currentVideo.products.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarTab('comments')}
                  className={`flex-1 py-2 text-[11px] font-bold transition border-b-2 text-center ${
                    sidebarTab === 'comments'
                      ? 'border-[#ee4d2d] text-[#ee4d2d] bg-white'
                      : 'border-transparent text-[#666666] hover:text-[#222222]'
                  }`}
                >
                  Bình luận ({currentVideo.metrics.commentCount ?? comments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarTab('playlist')}
                  className={`flex-1 py-2 text-[11px] font-bold transition border-b-2 text-center ${
                    sidebarTab === 'playlist'
                      ? 'border-[#ee4d2d] text-[#ee4d2d] bg-white'
                      : 'border-transparent text-[#666666] hover:text-[#222222]'
                  }`}
                >
                  Video khác
                </button>
              </div>

              {/* Tab 1: Products */}
              {sidebarTab === 'products' && (
                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                  {currentVideo.products.length === 0 ? (
                    <div className="py-12 text-center text-xs text-[#757575]">
                      <span className="text-3xl block mb-2">🛍️</span>
                      <p>Video này chưa gắn sản phẩm nào.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {currentVideo.products.map((product, pIdx) => (
                        <div
                          key={product.productId}
                          className="flex items-center gap-2 rounded-xs border border-[#e8e8e8] p-2 transition hover:border-[#ee4d2d] hover:bg-[#fffcfb]"
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#fef6f5] text-[9px] font-bold text-[#ee4d2d] border border-[#fcdcd7]">
                            {pIdx + 1}
                          </span>
                          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xs border border-[#f1f1f1]">
                            <Image
                              src={product.image ?? '/icon.svg'}
                              alt={product.name}
                              width={44}
                              height={44}
                              unoptimized
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/products/${encodeURIComponent(product.productId)}`}
                              onClick={() => handleProductClick(currentVideo, product.productId)}
                              className="line-clamp-1 text-xs font-semibold text-[#222222] hover:text-[#ee4d2d]"
                            >
                              {product.name}
                            </Link>
                            <p className="text-xs font-bold text-[#ee4d2d] mt-0.5">{formatPrice(product.price)}</p>
                          </div>
                          <Link
                            href={`/products/${encodeURIComponent(product.productId)}`}
                            onClick={() => handleProductClick(currentVideo, product.productId)}
                            className="rounded-xs bg-[#ee4d2d] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#d73211] transition shadow-2xs shrink-0"
                          >
                            Mua ngay
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Recommended Products */}
                  {recommendedProducts.length > 0 && (
                    <div className="border-t border-[#f1f1f1] pt-2.5 space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#757575]">Gợi ý mua kèm</p>
                      <div className="grid grid-cols-2 gap-2">
                        {recommendedProducts.map((product) => (
                          <Link
                            key={product.id}
                            href={`/products/${encodeURIComponent(product.id)}`}
                            className="group rounded-xs border border-[#f1f1f1] p-1.5 transition hover:border-[#ee4d2d]"
                          >
                            <div className="relative aspect-square w-full rounded-xs bg-[#f8f8f8] overflow-hidden mb-1">
                              <Image
                                src={product.image || '/icon.svg'}
                                alt={product.title}
                                fill
                                unoptimized
                                className="object-cover group-hover:scale-105 transition"
                              />
                            </div>
                            <p className="line-clamp-1 text-[10px] text-[#222222] group-hover:text-[#ee4d2d]">{product.title}</p>
                            <p className="text-[11px] font-bold text-[#ee4d2d] mt-0.5">{formatPrice(product.price)}</p>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Comments */}
              {sidebarTab === 'comments' && (
                <div className="flex flex-col flex-1 min-h-0">
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {commentsStatus === 'loading' && (
                      <p className="text-center text-xs text-[#757575] py-6">Đang tải bình luận...</p>
                    )}
                    {commentsStatus === 'error' && (
                      <p className="text-center text-xs text-[#ee4d2d] py-6">{commentError || 'Lỗi tải bình luận.'}</p>
                    )}
                    {commentsStatus === 'success' && comments.length === 0 && (
                      <div className="text-center text-xs text-[#757575] py-10">
                        <span className="text-2xl block mb-1">💬</span>
                        <p>Chưa có bình luận nào.</p>
                        <p className="text-[10px] text-[#999999] mt-0.5">Hãy là người đầu tiên bình luận về video này!</p>
                      </div>
                    )}
                    {comments.map((comment) => (
                      <div key={comment.commentId} className="flex gap-2 rounded-xs bg-[#fafafa] p-2 border border-[#f1f1f1]">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#fef6f5] text-[10px] font-bold text-[#ee4d2d] border border-[#fcdcd7]">
                          {getCommentInitial(comment, user, commentNameMap)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] font-bold text-[#222222]">{formatCommentAuthor(comment, user, commentNameMap)}</span>
                            {comment.userRole.trim().toUpperCase() === 'SELLER' && (
                              <span className="rounded-full bg-[#fef6f5] px-1 py-0.2 text-[8px] font-bold text-[#ee4d2d] border border-[#fcdcd7]">
                                SHOP
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-[#444444] break-words">{comment.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Comment Input */}
                  <div className="border-t border-[#f1f1f1] p-2.5 bg-white shrink-0">
                    <div className="mb-1.5 flex gap-1">
                      {chatEmojis.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setCommentInput((c) => `${c}${emoji}`)}
                          disabled={!accessToken || commentSubmitting}
                          className="grid h-6 w-6 place-items-center rounded-xs border border-[#e8e8e8] bg-[#fafafa] text-xs hover:border-[#ee4d2d] disabled:opacity-40 transition"
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
                        placeholder={accessToken ? 'Viết bình luận...' : 'Đăng nhập để gửi bình luận'}
                        className="min-w-0 flex-1 rounded-xs border border-[#e8e8e8] px-2.5 py-1 text-xs outline-none focus:border-[#ee4d2d] transition"
                      />
                      <button
                        type="button"
                        onClick={() => void handleSubmitComment()}
                        disabled={!commentInput.trim() || !commentSafety.allowed || commentSubmitting}
                        className="rounded-xs bg-[#ee4d2d] px-3 py-1 text-xs font-bold text-white hover:bg-[#d73211] disabled:opacity-50 transition shrink-0"
                      >
                        Gửi
                      </button>
                    </div>
                    {!commentSafety.allowed && commentInput.trim() && (
                      <p className="mt-1 text-[10px] text-[#ee4d2d]">{commentSafety.message}</p>
                    )}
                    {commentError && commentsStatus !== 'error' && (
                      <p className="mt-1 text-[10px] text-[#ee4d2d]">{commentError}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Playlist (Danh sách video khác - Không đếm số) */}
              {sidebarTab === 'playlist' && (
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {videos.map((vid, idx) => {
                      const isActive = idx === currentIndex;
                      const thumb = resolveMediaUrl(vid.thumbnailUrl);
                      return (
                        <button
                          key={vid.videoId}
                          type="button"
                          onClick={() => goToVideo(idx)}
                          className={`group relative rounded-xs border text-left transition overflow-hidden p-1.5 ${
                            isActive
                              ? 'border-[#ee4d2d] ring-1 ring-[#ee4d2d]/30 bg-[#fef6f5]'
                              : 'border-[#e8e8e8] bg-white hover:border-[#ee4d2d]'
                          }`}
                        >
                          <div className="relative aspect-[9/13] w-full rounded-xs bg-[#1c1c1e] overflow-hidden mb-1.5">
                            {thumb ? (
                              <Image
                                src={thumb}
                                alt={vid.title}
                                fill
                                unoptimized
                                className="object-cover transition group-hover:scale-105"
                              />
                            ) : (
                              <div className="grid h-full w-full place-items-center text-xs text-white/50">
                                Video
                              </div>
                            )}

                            {isActive && (
                              <span className="absolute top-1 left-1 rounded-full bg-[#ee4d2d] px-1.5 py-0.2 text-[8px] font-bold text-white shadow-xs">
                                Đang phát
                              </span>
                            )}
                            <span className="absolute bottom-1 right-1 rounded-xs bg-black/70 px-1 py-0.2 text-[8px] text-white font-mono">
                              {vid.metrics.qualifiedViewCount} view
                            </span>
                          </div>
                          <p className="line-clamp-1 text-[11px] font-bold text-[#222222] group-hover:text-[#ee4d2d]">
                            {vid.title}
                          </p>
                          <p className="line-clamp-1 text-[10px] text-[#757575] mt-0.5">
                            {vid.seller.shopName}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </aside>
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
