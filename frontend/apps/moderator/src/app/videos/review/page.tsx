'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ModeratorTopbar } from '@/components/layout/moderator-topbar';
import { ModeratorApiClientError } from '@/lib/api/client';
import { approveModerationVideo, listModerationVideos, rejectModerationVideo } from '@/lib/api/moderation';
import type { ModerationVideo } from '@/lib/api/types';
import { useAuth } from '@/providers/AppProvider';

export default function VideoReviewPage() {
  const router = useRouter();
  const { ready, user, accessToken, logout } = useAuth();
  const [items, setItems] = useState<ModerationVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadVideos = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const response = await listModerationVideos({ accessToken, page: 1, pageSize: 50, status: 'review_pending' });
      setItems(response.items ?? []);
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

  const handleApprove = useCallback(async (videoId: string) => {
    if (!accessToken) return;
    setError('');
    setNotice('');
    try {
      await approveModerationVideo(accessToken, videoId);
      setNotice('Đã approve video.');
      await loadVideos();
    } catch (approveError) {
      setError(approveError instanceof ModeratorApiClientError ? approveError.message : 'Approve video thất bại.');
    }
  }, [accessToken, loadVideos]);

  const handleReject = useCallback(async (videoId: string) => {
    if (!accessToken) return;
    const reason = window.prompt('Nhập lý do reject video:') ?? '';
    if (!reason.trim()) return;
    setError('');
    setNotice('');
    try {
      await rejectModerationVideo(accessToken, videoId, reason.trim());
      setNotice('Đã reject video.');
      await loadVideos();
    } catch (rejectError) {
      setError(rejectError instanceof ModeratorApiClientError ? rejectError.message : 'Reject video thất bại.');
    }
  }, [accessToken, loadVideos]);

  if (!ready) return <main className="flex min-h-screen items-center justify-center text-sm text-slate-600">Đang kiểm tra phiên đăng nhập...</main>;
  if (!user || !accessToken) return null;

  return (
    <div className="min-h-screen text-slate-900">
      <ModeratorTopbar email={user.email} role={user.role} onLogout={handleLogout} />
      <main className="mx-auto w-full max-w-[1280px] space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">Video Moderation</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-900">Shoppable Video Review Queue</h1>
            <p className="text-sm text-slate-500">Duyệt video seller trước khi hiển thị cho buyer.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/" className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">Sản phẩm</Link>
            <button type="button" onClick={() => void loadVideos()} className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white">Làm mới</button>
          </div>
        </div>

        {(notice || error) && <div className={`rounded-md px-4 py-3 text-sm ${error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{error || notice}</div>}

        <section className="grid gap-4 lg:grid-cols-2">
          {loading ? <p className="text-sm text-slate-500">Đang tải...</p> : null}
          {!loading && items.length === 0 ? <p className="rounded-md border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">Không có video đang chờ duyệt.</p> : null}
          {items.map((video) => (
            <article key={video.videoId} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {video.mediaUrl ? <video src={video.mediaUrl} controls className="aspect-video w-full bg-slate-950 object-contain" /> : <div className="flex aspect-video items-center justify-center bg-slate-900 text-sm text-white">No media</div>}
              <div className="space-y-3 p-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{video.title}</h2>
                  <p className="text-sm text-slate-500">Seller: {video.sellerId} · Status: {video.status}</p>
                </div>
                <p className="line-clamp-3 text-sm text-slate-600">{video.description || 'Không có mô tả.'}</p>
                <div className="flex flex-wrap gap-2">
                  {video.products.map((product) => <span key={product.productId} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{product.name}</span>)}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void handleApprove(video.videoId)} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Approve</button>
                  <button type="button" onClick={() => void handleReject(video.videoId)} className="rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white">Reject</button>
                </div>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
