'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { SellerApiClientError } from '@/lib/api/client';
import { listSellerProducts } from '@/lib/api/products';
import type { SellerProduct, SellerVideo } from '@/lib/api/types';
import {
  confirmSellerVideoMedia,
  createSellerVideo,
  listSellerVideos,
  presignSellerVideoUpload,
  publishSellerVideo,
  unpublishSellerVideo
} from '@/lib/api/videos';
import { useAuth } from '@/providers/AppProvider';

const checklist = [
  'Video MP4/WebM, khuyến nghị 10s đến 60s',
  'Có gắn ít nhất 1 sản phẩm đang ACTIVE',
  'Tiêu đề rõ nội dung bán hàng',
  'Không dùng hình ảnh/âm thanh vi phạm bản quyền'
];

const statusLabels: Record<string, string> = {
  draft: 'Nháp',
  processing: 'Đã upload',
  processing_failed: 'Upload lỗi',
  review_pending: 'Đang duyệt',
  published: 'Đang hiển thị',
  hidden: 'Đã ẩn',
  rejected: 'Bị từ chối',
  archived: 'Đã lưu trữ'
};

export default function SellerVideosPage() {
  const router = useRouter();
  const { ready, user, accessToken, logout } = useAuth();
  const [videos, setVideos] = useState<SellerVideo[]>([]);
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [videoResult, productResult] = await Promise.all([
        listSellerVideos({ accessToken, page: 1, pageSize: 20 }),
        listSellerProducts({ accessToken, page: 1, pageSize: 50 })
      ]);
      setVideos(videoResult.items ?? []);
      setProducts((productResult.items ?? []).filter((product) => product.status === 'ACTIVE'));
      if (!selectedProductId && productResult.items?.[0]) {
        const firstActive = productResult.items.find((product) => product.status === 'ACTIVE');
        setSelectedProductId(firstActive?.id ?? '');
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Không tải được dữ liệu video/sản phẩm.'));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, selectedProductId]);

  useEffect(() => {
    if (ready && user && accessToken) {
      void loadData();
    }
  }, [ready, user, accessToken, loadData]);

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setVideoFile(event.target.files?.[0] ?? null);
  }, []);

  const handleCreateVideo = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!accessToken) {
        return;
      }

      if (!title.trim() || !selectedProductId) {
        setError('Vui lòng nhập tiêu đề và chọn sản phẩm.');
        return;
      }

      if (videoFile && !['video/mp4', 'video/webm'].includes(videoFile.type)) {
        setError('Chỉ hỗ trợ video/mp4 hoặc video/webm.');
        return;
      }

      setIsSubmitting(true);
      setError(null);
      setMessage(null);

      try {
        const created = await createSellerVideo(accessToken, {
          title: title.trim(),
          description: description.trim() || undefined,
          products: [{ productId: selectedProductId, sortOrder: 1 }]
        });

        let current = created;
        if (videoFile) {
          const presigned = await presignSellerVideoUpload(accessToken, {
            videoId: created.videoId,
            fileName: videoFile.name,
            contentType: videoFile.type
          });

          const uploadResponse = await fetch(presigned.uploadUrl, {
            method: presigned.method || 'PUT',
            headers: presigned.headers ?? { 'Content-Type': videoFile.type },
            body: videoFile
          });

          if (!uploadResponse.ok) {
            throw new Error('Object storage rejected uploaded video.');
          }

          current = await confirmSellerVideoMedia(accessToken, created.videoId, {
            mediaObjectKey: presigned.objectKey,
            mimeType: videoFile.type,
            sizeBytes: videoFile.size,
            durationSec: 30
          });

          current = await publishSellerVideo(accessToken, current.videoId);
        }

        setMessage(videoFile ? 'Đã upload và publish video.' : 'Đã tạo draft video. Upload file để publish.');
        setTitle('');
        setDescription('');
        setVideoFile(null);
        await loadData();
      } catch (submitError) {
        setError(getErrorMessage(submitError, 'Không tạo được video.'));
      } finally {
        setIsSubmitting(false);
      }
    },
    [accessToken, description, loadData, selectedProductId, title, videoFile]
  );

  const handleTogglePublish = useCallback(
    async (video: SellerVideo) => {
      if (!accessToken) {
        return;
      }

      setError(null);
      setMessage(null);
      try {
        if (video.status === 'published') {
          await unpublishSellerVideo(accessToken, video.videoId);
          setMessage('Đã ẩn video khỏi buyer feed.');
        } else {
          await publishSellerVideo(accessToken, video.videoId);
          setMessage('Đã publish video.');
        }
        await loadData();
      } catch (toggleError) {
        setError(getErrorMessage(toggleError, 'Không cập nhật được trạng thái video.'));
      }
    },
    [accessToken, loadData]
  );

  const stats = useMemo(() => {
    const published = videos.filter((video) => video.status === 'published').length;
    const views = videos.reduce((total, video) => total + (video.metrics?.qualifiedViewCount ?? 0), 0);
    const clicks = videos.reduce((total, video) => total + (video.metrics?.productClickCount ?? 0), 0);
    const ctr = views > 0 ? `${((clicks / views) * 100).toFixed(1)}%` : '0%';
    return { published, views, ctr };
  }, [videos]);

  if (!ready) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-slate-600">Đang kiểm tra phiên đăng nhập...</main>;
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-orange-500">eMall Seller</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Bạn chưa đăng nhập</h1>
          <p className="mt-2 text-sm text-slate-600">Đăng nhập để truy cập Video Shop.</p>
          <Link href="/login" className="mt-5 inline-flex rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600">
            Đi đến trang đăng nhập
          </Link>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen text-slate-900">
      <SellerTopbar email={user.email} role={user.role} onLogout={handleLogout} />

      <div className="flex">
        <SellerSidebar />

        <main className="min-w-0 flex-1 px-3 py-3 lg:px-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <Link href="/" className="hover:text-[#ee4d2d]">Trang chủ</Link>
            <span>›</span>
            <span>Kênh Marketing</span>
            <span>›</span>
            <span className="font-medium text-slate-700">Video Shop</span>
          </div>

          <section className="space-y-4">
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-semibold text-slate-900">Video Shop</h1>
                  <p className="mt-1 text-sm text-slate-600">Đăng video sản phẩm để buyer xem trực tiếp trên feed video.</p>
                </div>
                <button type="button" onClick={() => void loadData()} className="rounded-md border border-[#ee4d2d] px-4 py-2 text-sm font-semibold text-[#ee4d2d]">
                  Làm mới
                </button>
              </div>
            </div>

            {(message || error) && (
              <div className={`rounded-md border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                {error ?? message}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <KpiCard label="Video published" value={String(stats.published)} />
              <KpiCard label="Qualified views" value={String(stats.views)} />
              <KpiCard label="CTR" value={stats.ctr} />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <h2 className="text-base font-semibold text-slate-900">Danh sách video</h2>
                <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Video</th>
                        <th className="px-3 py-2">Sản phẩm</th>
                        <th className="px-3 py-2">Trạng thái</th>
                        <th className="px-3 py-2">Views</th>
                        <th className="px-3 py-2">Hành động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {isLoading && (
                        <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Đang tải...</td></tr>
                      )}
                      {!isLoading && videos.length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Chưa có video nào.</td></tr>
                      )}
                      {videos.map((video) => (
                        <tr key={video.videoId}>
                          <td className="px-3 py-2">
                            <p className="font-medium text-slate-800">{video.title}</p>
                            <p className="text-xs text-slate-500">{video.videoId}</p>
                          </td>
                          <td className="px-3 py-2 text-slate-700">{video.products.map((product) => product.name).join(', ')}</td>
                          <td className="px-3 py-2 text-slate-700">{statusLabels[video.status] ?? video.status}</td>
                          <td className="px-3 py-2 text-slate-700">{video.metrics?.qualifiedViewCount ?? 0}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => void handleTogglePublish(video)}
                              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#ee4d2d] hover:text-[#ee4d2d]"
                            >
                              {video.status === 'published' ? 'Ẩn' : 'Publish'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <aside className="space-y-4">
                <form onSubmit={(event) => void handleCreateVideo(event)} className="rounded-md border border-slate-200 bg-white p-4">
                  <h2 className="text-base font-semibold text-slate-900">Tạo video bán hàng</h2>
                  <div className="mt-3 space-y-3">
                    <label className="block text-sm font-medium text-slate-700">
                      Tiêu đề
                      <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" maxLength={120} />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Mô tả
                      <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" maxLength={1000} />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Sản phẩm gắn vào video
                      <select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm">
                        <option value="">Chọn sản phẩm ACTIVE</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>{product.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      File video MP4/WebM
                      <input type="file" accept="video/mp4,video/webm" onChange={handleFileChange} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                    </label>
                    <button type="submit" disabled={isSubmitting} className="w-full rounded-md bg-[#ee4d2d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#db4729] disabled:cursor-not-allowed disabled:opacity-60">
                      {isSubmitting ? 'Đang xử lý...' : 'Tạo + upload + publish'}
                    </button>
                  </div>
                </form>

                <div className="rounded-md border border-slate-200 bg-white p-4">
                  <h2 className="text-base font-semibold text-slate-900">Checklist trước khi đăng</h2>
                  <ul className="mt-3 space-y-2 text-sm text-slate-700">
                    {checklist.map((item) => (
                      <li key={item} className="flex items-start gap-2"><span className="mt-1 text-[#ee4d2d]">●</span><span>{item}</span></li>
                    ))}
                  </ul>
                </div>
              </aside>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof SellerApiClientError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
