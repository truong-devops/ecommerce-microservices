'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModeratorTopbar } from '@/components/layout/moderator-topbar';
import { ModeratorSidebar } from '@/components/layout/moderator-sidebar';
import { StatCard } from '@/components/ui/stat-card';
import {
  VideoIcon,
  PackageIcon,
  RefreshCwIcon,
  CheckCircle2Icon,
  XCircleIcon,
  CheckIcon,
  TagIcon,
  EyeIcon
} from '@/components/ui/icons';
import { ModeratorApiClientError } from '@/lib/api/client';
import { approveModerationVideo, listModerationVideos, rejectModerationVideo } from '@/lib/api/moderation';
import type { ModerationVideo } from '@/lib/api/types';
import { useAuth } from '@/providers/AppProvider';

export default function VideoReviewPage() {
  const router = useRouter();
  const { ready, user, accessToken, logout } = useAuth();
  const [items, setItems] = useState<ModerationVideo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [rejectingVideoId, setRejectingVideoId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadVideos = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const response = await listModerationVideos({ accessToken, page: 1, pageSize: 50, status: 'review_pending' });
      const nextItems = response.items ?? [];
      setItems(nextItems);
      setSelectedVideoId((current) => (current && nextItems.some((item) => item.videoId === current) ? current : (nextItems[0]?.videoId ?? null)));
    } catch (loadError) {
      setError(loadError instanceof ModeratorApiClientError ? loadError.message : 'Không tải được review queue video.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (ready && accessToken) void loadVideos();
  }, [ready, accessToken, loadVideos]);

  useEffect(() => {
    if (ready && (!user || !accessToken)) router.replace('/login');
  }, [accessToken, ready, router, user]);

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  const selectedVideo = useMemo(
    () => items.find((item) => item.videoId === selectedVideoId) ?? items[0] ?? null,
    [items, selectedVideoId]
  );

  const queueStats = useMemo(() => {
    const productCount = items.reduce((sum, item) => sum + item.products.length, 0);
    const missingMediaCount = items.filter((item) => !item.mediaUrl).length;
    return { open: items.length, productCount, missingMediaCount };
  }, [items]);

  const handleApprove = useCallback(
    async (videoId: string) => {
      if (!accessToken) return;
      setError('');
      setNotice('');
      setActionLoadingId(videoId);
      try {
        await approveModerationVideo(accessToken, videoId);
        setNotice('Đã duyệt video thành công. Video sẽ được xuất bản đến người mua.');
        await loadVideos();
      } catch (approveError) {
        setError(approveError instanceof ModeratorApiClientError ? approveError.message : 'Approve video thất bại.');
      } finally {
        setActionLoadingId(null);
      }
    },
    [accessToken, loadVideos]
  );

  const handleReject = useCallback(async () => {
    if (!accessToken || !rejectingVideoId) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setError('Cần nhập lý do từ chối để người bán biết điểm cần sửa.');
      return;
    }

    setError('');
    setNotice('');
    setActionLoadingId(rejectingVideoId);
    try {
      await rejectModerationVideo(accessToken, rejectingVideoId, reason);
      setNotice('Đã từ chối video và lưu lý do kiểm duyệt.');
      setRejectingVideoId(null);
      setRejectReason('');
      await loadVideos();
    } catch (rejectError) {
      setError(rejectError instanceof ModeratorApiClientError ? rejectError.message : 'Reject video thất bại.');
    } finally {
      setActionLoadingId(null);
    }
  }, [accessToken, loadVideos, rejectingVideoId, rejectReason]);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-medium text-slate-500">
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <span>Đang kiểm tra phiên đăng nhập...</span>
        </div>
      </main>
    );
  }

  if (!user || !accessToken) return null;

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900">
      <ModeratorTopbar email={user.email} role={user.role} onLogout={handleLogout} />

      <div className="mx-auto w-full max-w-[1760px] px-3 py-5 sm:px-5 lg:px-6">
        <div className="grid gap-5 lg:grid-cols-[256px_minmax(0,1fr)]">
          {/* Sidebar */}
          <div className="hidden lg:block">
            <ModeratorSidebar role={user.role} pendingVideoCount={queueStats.open} />
          </div>

          <main className="min-w-0 space-y-4">
            {/* Header */}
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-brand-700">
                      Shoppable Media
                    </span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs font-semibold text-slate-500">
                      {queueStats.open} video đang chờ duyệt
                    </span>
                  </div>
                  <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                    Kiểm duyệt Video (Shoppable Video)
                  </h1>
                  <p className="mt-1 text-sm text-slate-500 max-w-2xl leading-relaxed">
                    Kiểm tra nội dung video, sản phẩm gắn kèm và bản quyền âm thanh trước khi xuất bản lên luồng khám phá cho người mua.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50"
                  >
                    <PackageIcon size={14} className="text-brand-600" />
                    <span>Product Queue</span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => void loadVideos()}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-subtle transition hover:bg-slate-800 active:scale-95 disabled:opacity-60"
                  >
                    <RefreshCwIcon size={13} className={loading ? 'animate-spin' : ''} />
                    <span>{loading ? 'Đang tải...' : 'Làm mới'}</span>
                  </button>
                </div>
              </div>

              {/* Stat Cards */}
              <div className="mt-5 grid gap-3.5 sm:grid-cols-3">
                <StatCard
                  label="Chờ duyệt"
                  value={queueStats.open}
                  hint="Video đang chờ kiểm duyệt"
                  icon={<VideoIcon size={18} />}
                  tone="amber"
                />
                <StatCard
                  label="Sản phẩm gắn kèm"
                  value={queueStats.productCount}
                  hint="Tổng sản phẩm liên kết"
                  icon={<PackageIcon size={18} />}
                  tone="indigo"
                />
                <StatCard
                  label="Lỗi tải media"
                  value={queueStats.missingMediaCount}
                  hint={queueStats.missingMediaCount === 0 ? 'Tất cả video hợp lệ' : 'Cần kiểm tra URL'}
                  icon={<XCircleIcon size={18} />}
                  tone={queueStats.missingMediaCount > 0 ? 'rose' : 'emerald'}
                />
              </div>
            </section>

            {/* Alert */}
            {(notice || error) && (
              <div
                className={`flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-xs font-semibold shadow-2xs ${
                  error
                    ? 'border-rose-200 bg-rose-50/80 text-rose-800'
                    : 'border-emerald-200 bg-emerald-50/80 text-emerald-800'
                }`}
              >
                {error ? <XCircleIcon size={16} /> : <CheckCircle2Icon size={16} />}
                <span>{error || notice}</span>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="rounded-2xl border border-slate-200/80 bg-white p-12 text-center text-xs text-slate-500 shadow-card">
                <div className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                  <span>Đang tải danh sách video chờ duyệt...</span>
                </div>
              </div>
            )}

            {/* Empty State */}
            {!loading && items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-card">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2Icon size={28} />
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-900">Hàng đợi video đã trống!</h3>
                <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
                  Hiện tại không có video nào ở trạng thái chờ duyệt. Video mới do Seller đăng tải sẽ tự động xuất hiện tại đây.
                </p>
              </div>
            ) : null}

            {/* Video Review Studio */}
            {!loading && items.length > 0 && selectedVideo ? (
              <div className="grid gap-5 xl:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
                {/* Queue list */}
                <aside className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-3">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Danh sách chờ ({items.length})
                    </h2>
                  </div>
                  <div className="max-h-[740px] divide-y divide-slate-100 overflow-y-auto">
                    {items.map((video) => {
                      const isSelected = selectedVideoId === video.videoId;
                      return (
                        <button
                          key={video.videoId}
                          type="button"
                          onClick={() => setSelectedVideoId(video.videoId)}
                          className={`flex w-full gap-3 p-3.5 text-left transition ${
                            isSelected ? 'bg-orange-50/60' : 'hover:bg-slate-50/70'
                          }`}
                        >
                          <VideoThumb video={video} className="h-20 w-14 shrink-0 rounded-xl" />
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-xs font-bold text-slate-900 leading-snug">
                              {video.title}
                            </p>
                            <p className="mt-1 text-[11px] font-semibold text-slate-600 truncate">
                              {getVideoSellerName(video)}
                            </p>
                            <div className="mt-2 flex items-center justify-between text-[10px]">
                              <span className="font-mono text-slate-400">
                                {video.seller?.sellerCode ?? shortId(video.sellerId)}
                              </span>
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 font-bold uppercase text-amber-700 border border-amber-200/60">
                                Chờ duyệt
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </aside>

                {/* Review Detail Panel */}
                <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
                  <div className="border-b border-slate-100 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-brand-700">
                          {getVideoSellerName(selectedVideo)}
                        </span>
                        <h2 className="mt-1 text-lg font-black text-slate-950 line-clamp-2">
                          {selectedVideo.title}
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-400 font-mono">
                          Seller ID: {selectedVideo.seller?.sellerCode ?? selectedVideo.sellerId} · Video ID: {selectedVideo.videoId}
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold uppercase text-amber-700 border border-amber-200/60">
                        {selectedVideo.status}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-0 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
                    {/* Video Player */}
                    <div className="border-r border-slate-100 bg-slate-950 p-4">
                      <div className="mx-auto aspect-[9/16] max-h-[620px] overflow-hidden rounded-2xl bg-black shadow-inner">
                        {selectedVideo.mediaUrl ? (
                          <video
                            src={selectedVideo.mediaUrl}
                            poster={selectedVideo.thumbnailUrl ?? undefined}
                            controls
                            playsInline
                            preload="metadata"
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center p-6 text-center text-xs text-white/70">
                            Video chưa tải được media. Không đủ điều kiện duyệt.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Details & Checklist */}
                    <div className="flex flex-col p-5 space-y-5">
                      {/* Checklist */}
                      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                          Tiêu chí đánh giá chất lượng
                        </h3>
                        <ul className="grid gap-2 text-xs sm:grid-cols-2">
                          <CheckItem ok={Boolean(selectedVideo.mediaUrl)} text="Tệp video phát ổn định" />
                          <CheckItem ok={selectedVideo.products.length > 0} text="Có liên kết sản phẩm" />
                          <CheckItem ok={selectedVideo.status === 'review_pending'} text="Trạng thái chờ duyệt" />
                          <CheckItem ok={Boolean(selectedVideo.title.trim())} text="Tiêu đề video rõ nghĩa" />
                        </ul>
                      </div>

                      {/* Description */}
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                          Mô tả video
                        </h3>
                        <p className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs leading-relaxed text-slate-700">
                          {selectedVideo.description || 'Người bán chưa điền mô tả cho video này.'}
                        </p>
                      </div>

                      {/* Linked Products */}
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                          Sản phẩm gắn kèm ({selectedVideo.products.length})
                        </h3>
                        <div className="grid gap-2.5 sm:grid-cols-2">
                          {selectedVideo.products.length > 0 ? (
                            selectedVideo.products.map((prod) => (
                              <div
                                key={prod.productId}
                                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={prod.image ?? '/icon.svg'}
                                  alt={prod.name}
                                  className="h-12 w-12 rounded-lg object-cover shrink-0 border border-slate-100"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="line-clamp-1 text-xs font-bold text-slate-900">{prod.name}</p>
                                  <p className="text-[10px] font-mono text-slate-400">{prod.productId}</p>
                                  <p className="text-xs font-extrabold text-brand-700 mt-0.5">
                                    {formatMoney(prod.price, prod.currency)}
                                  </p>
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="col-span-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
                              Video này chưa gắn sản phẩm nào.
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="mt-auto flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => {
                            setError('');
                            setRejectingVideoId(selectedVideo.videoId);
                            setRejectReason('');
                          }}
                          className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 shadow-2xs"
                          disabled={actionLoadingId === selectedVideo.videoId}
                        >
                          Từ chối (Reject)
                        </button>

                        <button
                          type="button"
                          onClick={() => handleApprove(selectedVideo.videoId)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-subtle hover:bg-emerald-700 disabled:opacity-50"
                          disabled={
                            actionLoadingId === selectedVideo.videoId ||
                            !selectedVideo.mediaUrl ||
                            selectedVideo.products.length === 0
                          }
                        >
                          <CheckIcon size={14} />
                          <span>{actionLoadingId === selectedVideo.videoId ? 'Đang xử lý...' : 'Duyệt & Xuất bản'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            ) : null}
          </main>
        </div>
      </div>

      {/* Reject Modal */}
      {rejectingVideoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-dialog">
            <h2 className="text-base font-bold text-slate-950">Từ chối video kiểm duyệt</h2>
            <p className="mt-1 text-xs text-slate-500">
              Nhập lý do cụ thể để thông báo đến người bán chỉnh sửa nội dung hoặc hình ảnh đạt chuẩn.
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {[
                'Video bị mờ, không thấy rõ sản phẩm',
                'Nội dung không khớp với sản phẩm gắn kèm',
                'Video vi phạm bản quyền hình ảnh hoặc âm nhạc',
                'Nội dung chứa thông tin liên hệ ngoài sàn'
              ].map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setRejectReason(reason)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                >
                  {reason}
                </button>
              ))}
            </div>

            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              placeholder="Nhập ghi chú chi tiết..."
              className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectingVideoId(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => void handleReject()}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-subtle hover:bg-rose-700 disabled:opacity-50"
                disabled={actionLoadingId === rejectingVideoId}
              >
                {actionLoadingId === rejectingVideoId ? 'Đang lưu...' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VideoThumb({ video, className }: { video: ModerationVideo; className: string }) {
  return (
    <div className={`relative overflow-hidden bg-slate-900 border border-slate-200/80 ${className}`}>
      {video.mediaUrl ? (
        <video
          src={video.mediaUrl}
          poster={video.thumbnailUrl ?? undefined}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      ) : video.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={video.thumbnailUrl} alt={video.title} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-white/50">
          No media
        </span>
      )}
    </div>
  );
}

function CheckItem({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`grid h-4 w-4 place-items-center rounded-full ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
        {ok ? <CheckIcon size={10} /> : <span className="text-[10px] font-bold">×</span>}
      </span>
      <span className={ok ? 'text-slate-800' : 'text-slate-500 line-through'}>{text}</span>
    </li>
  );
}

function formatMoney(value: number, currency: string): string {
  return `${new Intl.NumberFormat('vi-VN').format(value)} ${currency}`;
}

function getVideoSellerName(video: ModerationVideo): string {
  return video.seller?.shopName?.trim() || video.seller?.sellerCode?.trim() || `Seller ${shortId(video.sellerId)}`;
}

function shortId(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 16 ? `${trimmed.slice(0, 8)}...${trimmed.slice(-6)}` : trimmed;
}
