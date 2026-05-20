'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModeratorTopbar } from '@/components/layout/moderator-topbar';
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
      setSelectedVideoId((current) => (current && nextItems.some((item) => item.videoId === current) ? current : nextItems[0]?.videoId ?? null));
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

  const selectedVideo = useMemo(() => items.find((item) => item.videoId === selectedVideoId) ?? items[0] ?? null, [items, selectedVideoId]);
  const queueStats = useMemo(() => {
    const productCount = items.reduce((sum, item) => sum + item.products.length, 0);
    const missingMediaCount = items.filter((item) => !item.mediaUrl).length;
    return { open: items.length, productCount, missingMediaCount };
  }, [items]);

  const handleApprove = useCallback(async (videoId: string) => {
    if (!accessToken) return;
    setError('');
    setNotice('');
    setActionLoadingId(videoId);
    try {
      await approveModerationVideo(accessToken, videoId);
      setNotice('Đã approve video. Video sẽ được publish cho buyer nếu backend xử lý thành công.');
      await loadVideos();
    } catch (approveError) {
      setError(approveError instanceof ModeratorApiClientError ? approveError.message : 'Approve video thất bại.');
    } finally {
      setActionLoadingId(null);
    }
  }, [accessToken, loadVideos]);

  const handleReject = useCallback(async () => {
    if (!accessToken || !rejectingVideoId) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setError('Cần nhập lý do reject để seller biết cần sửa gì.');
      return;
    }

    setError('');
    setNotice('');
    setActionLoadingId(rejectingVideoId);
    try {
      await rejectModerationVideo(accessToken, rejectingVideoId, reason);
      setNotice('Đã reject video và lưu lý do kiểm duyệt.');
      setRejectingVideoId(null);
      setRejectReason('');
      await loadVideos();
    } catch (rejectError) {
      setError(rejectError instanceof ModeratorApiClientError ? rejectError.message : 'Reject video thất bại.');
    } finally {
      setActionLoadingId(null);
    }
  }, [accessToken, loadVideos, rejectingVideoId, rejectReason]);

  if (!ready) return <main className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">Đang kiểm tra phiên đăng nhập...</main>;
  if (!user || !accessToken) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <ModeratorTopbar email={user.email} role={user.role} onLogout={handleLogout} />

      <main className="mx-auto grid w-full max-w-[1680px] gap-4 px-4 py-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Workspace</p>
          <nav className="space-y-1">
            <Link href="/" className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Product Queue
            </Link>
            <Link href="/videos/review" className="block rounded-md border-l-2 border-brand-600 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700">
              Video Review Queue
            </Link>
            <Link href="/chat/violations" className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Chat Violations
            </Link>
          </nav>

          <div className="mt-4 rounded-lg border border-brand-100 bg-brand-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">Pending videos</p>
            <p className="mt-1 text-3xl font-semibold text-slate-950">{queueStats.open}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">Video cần duyệt trước khi xuất hiện ở buyer feed.</p>
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">Video Moderation</p>
                <h1 className="mt-1 text-2xl font-semibold text-slate-950">Shoppable Video Review</h1>
                <p className="mt-1 text-sm text-slate-500">Review media, linked products, and policy readiness before publishing to buyer feed.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Product queue
                </Link>
                <button type="button" onClick={() => void loadVideos()} className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60" disabled={loading}>
                  {loading ? 'Đang tải...' : 'Refresh'}
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <MetricCard label="Pending videos" value={queueStats.open} tone="brand" />
              <MetricCard label="Linked products" value={queueStats.productCount} tone="slate" />
              <MetricCard label="Missing media" value={queueStats.missingMediaCount} tone={queueStats.missingMediaCount > 0 ? 'rose' : 'emerald'} />
            </div>
          </div>

          {(notice || error) && <div className={`rounded-md border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || notice}</div>}

          {loading ? <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">Đang tải video review queue...</div> : null}

          {!loading && items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
              <p className="text-base font-semibold text-slate-800">Không có video đang chờ duyệt.</p>
              <p className="mt-1 text-sm text-slate-500">Khi seller submit video, video sẽ xuất hiện ở đây với trạng thái review_pending.</p>
            </div>
          ) : null}

          {!loading && items.length > 0 && selectedVideo ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
              <VideoQueueList items={items} selectedVideoId={selectedVideo.videoId} onSelect={setSelectedVideoId} />
              <VideoReviewDetail
                video={selectedVideo}
                actionLoadingId={actionLoadingId}
                onApprove={handleApprove}
                onRejectStart={(videoId) => {
                  setError('');
                  setRejectingVideoId(videoId);
                  setRejectReason('');
                }}
              />
            </div>
          ) : null}
        </section>
      </main>

      {rejectingVideoId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-950">Reject video</h2>
            <p className="mt-1 text-sm text-slate-500">Nhập lý do rõ ràng để seller biết cần chỉnh nội dung, sản phẩm gắn kèm, hoặc chất lượng media.</p>
            <textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              rows={5}
              placeholder="Ví dụ: Video bị mờ, không thấy sản phẩm; nội dung không liên quan đến sản phẩm; thiếu quyền sử dụng nhạc..."
              className="mt-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setRejectingVideoId(null)} className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" onClick={() => void handleReject()} className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60" disabled={actionLoadingId === rejectingVideoId}>
                {actionLoadingId === rejectingVideoId ? 'Rejecting...' : 'Confirm reject'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function VideoQueueList({ items, selectedVideoId, onSelect }: { items: ModerationVideo[]; selectedVideoId: string; onSelect: (videoId: string) => void }) {
  return (
    <aside className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-950">Review queue</h2>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">{items.length} pending</span>
      </div>
      <div className="max-h-[720px] divide-y divide-slate-100 overflow-y-auto">
        {items.map((video) => (
          <button
            key={video.videoId}
            type="button"
            onClick={() => onSelect(video.videoId)}
            className={[
              'flex w-full gap-3 px-4 py-3 text-left transition',
              selectedVideoId === video.videoId ? 'bg-brand-50' : 'bg-white hover:bg-slate-50'
            ].join(' ')}
          >
            <VideoThumb video={video} className="h-20 w-14 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-sm font-semibold text-slate-950">{video.title}</span>
              <span className="mt-1 block text-xs text-slate-500">Seller {video.sellerId}</span>
              <span className="mt-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase text-amber-700">{video.status}</span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function VideoReviewDetail({ video, actionLoadingId, onApprove, onRejectStart }: { video: ModerationVideo; actionLoadingId: string | null; onApprove: (videoId: string) => void; onRejectStart: (videoId: string) => void }) {
  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Seller {video.sellerId}</p>
            <h2 className="mt-1 line-clamp-2 text-xl font-semibold text-slate-950">{video.title}</h2>
            <p className="mt-1 text-xs text-slate-500">Video ID: {video.videoId}</p>
          </div>
          <StatusPill status={video.status} />
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(300px,400px)_minmax(0,1fr)]">
        <div className="border-r border-slate-200 bg-slate-950 p-4">
          <div className="mx-auto aspect-[9/16] max-h-[680px] overflow-hidden rounded-lg bg-black">
            {video.mediaUrl ? (
              <video src={video.mediaUrl} poster={video.thumbnailUrl ?? undefined} controls playsInline preload="metadata" className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white">Video chưa có media, nên không đủ điều kiện approve.</div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col p-5">
          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-950">Review checklist</h3>
            <ul className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
              <ChecklistItem ok={Boolean(video.mediaUrl)} text="Video media playable" />
              <ChecklistItem ok={video.products.length > 0} text="Linked product exists" />
              <ChecklistItem ok={video.status === 'review_pending'} text="Status is review_pending" />
              <ChecklistItem ok={Boolean(video.title.trim())} text="Title is readable" />
            </ul>
          </section>

          <section className="mt-5">
            <h3 className="text-sm font-semibold text-slate-950">Description</h3>
            <p className="mt-2 rounded-md border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-600">{video.description || 'Seller chưa thêm mô tả.'}</p>
          </section>

          <section className="mt-5">
            <h3 className="text-sm font-semibold text-slate-950">Linked products</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {video.products.length > 0 ? video.products.map((product) => (
                <div key={product.productId} className="flex gap-3 rounded-md border border-slate-200 bg-white p-3">
                  <img src={product.image ?? '/icon.svg'} alt={product.name} className="h-14 w-14 rounded-md object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold text-slate-950">{product.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{product.productId}</p>
                    <p className="mt-1 text-sm font-semibold text-brand-700">{formatMoney(product.price, product.currency)}</p>
                  </div>
                </div>
              )) : <p className="rounded-md border border-dashed border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">Video chưa gắn sản phẩm.</p>}
            </div>
          </section>

          <div className="mt-auto flex flex-wrap justify-end gap-2 pt-6">
            <button type="button" onClick={() => onRejectStart(video.videoId)} className="rounded-md border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50" disabled={actionLoadingId === video.videoId}>
              Reject
            </button>
            <button type="button" onClick={() => onApprove(video.videoId)} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50" disabled={actionLoadingId === video.videoId || !video.mediaUrl || video.products.length === 0}>
              {actionLoadingId === video.videoId ? 'Processing...' : 'Approve & Publish'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function VideoThumb({ video, className }: { video: ModerationVideo; className: string }) {
  return (
    <span className={`relative overflow-hidden rounded-md bg-slate-900 ${className}`}>
      {video.mediaUrl ? (
        <video src={video.mediaUrl} poster={video.thumbnailUrl ?? undefined} muted playsInline preload="metadata" className="h-full w-full object-cover" />
      ) : video.thumbnailUrl ? (
        <img src={video.thumbnailUrl} alt={video.title} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-white/70">No media</span>
      )}
    </span>
  );
}

function ChecklistItem({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
      <span>{text}</span>
    </li>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: 'brand' | 'slate' | 'rose' | 'emerald' }) {
  const toneClass = {
    brand: 'border-brand-200 bg-brand-50 text-brand-700',
    slate: 'border-slate-200 bg-white text-slate-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }[tone];

  return (
    <article className={`rounded-lg border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </article>
  );
}

function StatusPill({ status }: { status: string }) {
  return <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase text-amber-700">{status}</span>;
}

function formatMoney(value: number, currency: string): string {
  return `${new Intl.NumberFormat('vi-VN').format(value)} ${currency}`;
}
