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
  archiveSellerVideo,
  confirmSellerVideoMedia,
  createSellerVideo,
  listSellerVideos,
  presignSellerVideoUpload,
  submitSellerVideoReview,
  unpublishSellerVideo,
  updateSellerVideo
} from '@/lib/api/videos';
import { resolveMediaUrl } from '@/lib/media-url';
import { useAuth } from '@/providers/AppProvider';

const checklist = [
  'Video MP4/WebM, tối đa 50MB, khuyến nghị 10s đến 60s',
  'Có gắn ít nhất 1 sản phẩm đang ACTIVE',
  'Tiêu đề rõ nội dung bán hàng',
  'Không dùng hình ảnh/âm thanh vi phạm bản quyền'
];

const statusLabels: Record<string, string> = {
  draft: 'Nháp',
  processing: 'Đang xử lý',
  processing_failed: 'Upload lỗi',
  review_pending: 'Đang duyệt',
  published: 'Đang hiển thị',
  hidden: 'Đã ẩn',
  rejected: 'Bị từ chối',
  archived: 'Đã lưu trữ'
};

const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_SIZE_MB = 50;

type VideoAction = 'hide' | 'submit' | 'none';

function getVideoAction(video: SellerVideo): { action: VideoAction; label: string; disabled: boolean } {
  if (video.status === 'published') {
    return { action: 'hide', label: 'Ẩn', disabled: false };
  }
  if (video.status === 'review_pending') {
    return { action: 'none', label: 'Đang duyệt', disabled: true };
  }
  if (video.status === 'processing_failed') {
    return { action: 'none', label: 'Upload lỗi', disabled: true };
  }
  if (video.status === 'archived') {
    return { action: 'none', label: 'Đã lưu trữ', disabled: true };
  }

  const hasReadyMedia = hasReadyVideoMedia(video);
  if (!hasReadyMedia) {
    return { action: 'none', label: video.status === 'processing' ? 'Đang upload' : 'Chưa upload', disabled: true };
  }
  return { action: 'submit', label: video.status === 'rejected' ? 'Gửi duyệt lại' : 'Gửi duyệt', disabled: false };
}

function getVideoStatusLabel(video: SellerVideo): string {
  if (!hasReadyVideoMedia(video)) {
    if (video.status === 'processing') return 'Đang tải video lên';
    if (video.status === 'processing_failed') return 'Tải video thất bại';
    if (video.status === 'draft') return 'Chưa tải video lên';
  }
  return statusLabels[video.status] ?? video.status;
}

function hasReadyVideoMedia(video: SellerVideo): boolean {
  return Boolean(video.mediaObjectKey && video.mediaUrl && video.mimeType);
}

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
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewVideo, setPreviewVideo] = useState<SellerVideo | null>(null);
  const [editingVideo, setEditingVideo] = useState<SellerVideo | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editProductId, setEditProductId] = useState('');
  const [editFile, setEditFile] = useState<File | null>(null);
  const [retryVideo, setRetryVideo] = useState<SellerVideo | null>(null);
  const [retryFile, setRetryFile] = useState<File | null>(null);

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
      setVideos((videoResult.items ?? []).filter((video) => video.status !== 'archived'));
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

      if (!title.trim() || !selectedProductId || !videoFile) {
        setError('Vui lòng nhập tiêu đề, chọn sản phẩm và chọn file video.');
        return;
      }

      if (!['video/mp4', 'video/webm'].includes(videoFile.type)) {
        setError('Chỉ hỗ trợ video/mp4 hoặc video/webm.');
        return;
      }
      if (videoFile.size > MAX_VIDEO_SIZE_BYTES) {
        setError(`Video tối đa ${MAX_VIDEO_SIZE_MB}MB. Vui lòng nén video hoặc chọn file nhẹ hơn.`);
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

        const presigned = await presignSellerVideoUpload(accessToken, {
          videoId: created.videoId,
          fileName: videoFile.name,
          contentType: videoFile.type,
          sizeBytes: videoFile.size
        });

        const uploadResponse = await fetch(presigned.uploadUrl, {
          method: presigned.method || 'PUT',
          headers: presigned.headers ?? { 'Content-Type': videoFile.type },
          body: videoFile
        });

        if (!uploadResponse.ok) {
          throw new Error('Object storage rejected uploaded video.');
        }

        const current = await confirmSellerVideoMedia(accessToken, created.videoId, {
          mediaObjectKey: presigned.objectKey,
          mimeType: videoFile.type,
          sizeBytes: videoFile.size,
          durationSec: 30
        });

        await submitSellerVideoReview(accessToken, current.videoId);

        setMessage('Đã upload video và gửi moderator duyệt.');
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

      const videoAction = getVideoAction(video);
      if (videoAction.disabled || videoAction.action === 'none') {
        return;
      }

      setActionLoadingId(video.videoId);
      setError(null);
      setMessage(null);
      try {
        if (videoAction.action === 'hide') {
          await unpublishSellerVideo(accessToken, video.videoId);
          setMessage('Đã ẩn video khỏi buyer feed.');
        } else {
          await submitSellerVideoReview(accessToken, video.videoId);
          setMessage('Đã gửi video cho moderator duyệt.');
        }
        await loadData();
      } catch (toggleError) {
        setError(getErrorMessage(toggleError, 'Không cập nhật được trạng thái video.'));
      } finally {
        setActionLoadingId(null);
      }
    },
    [accessToken, loadData]
  );

  const uploadVideoMedia = useCallback(async (video: SellerVideo, file: File) => {
    if (!accessToken) {
      return;
    }
    validateVideoFile(file);
    const presigned = await presignSellerVideoUpload(accessToken, {
      videoId: video.videoId,
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size
    });
    const response = await fetch(presigned.uploadUrl, {
      method: presigned.method || 'PUT',
      headers: presigned.headers ?? { 'Content-Type': file.type },
      body: file
    });
    if (!response.ok) {
      throw new Error('Kho lưu trữ từ chối file video. Vui lòng thử lại.');
    }
    await confirmSellerVideoMedia(accessToken, video.videoId, {
      mediaObjectKey: presigned.objectKey,
      mimeType: file.type,
      sizeBytes: file.size,
      durationSec: 30
    });
  }, [accessToken]);

  const openEditor = useCallback((video: SellerVideo) => {
    setEditingVideo(video);
    setEditTitle(video.title);
    setEditDescription(video.description ?? '');
    setEditProductId(video.products[0]?.productId ?? '');
    setEditFile(null);
  }, []);

  const handleSaveVideo = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !editingVideo) {
      return;
    }
    if (!editTitle.trim() || !editProductId) {
      setError('Vui lòng nhập tiêu đề và chọn sản phẩm.');
      return;
    }

    setActionLoadingId(editingVideo.videoId);
    setError(null);
    setMessage(null);
    try {
      await updateSellerVideo(accessToken, editingVideo.videoId, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        products: [{ productId: editProductId, sortOrder: 1 }]
      });
      if (editFile) {
        await uploadVideoMedia(editingVideo, editFile);
      }
      setEditingVideo(null);
      setMessage(editFile ? 'Đã cập nhật thông tin và thay file video.' : 'Đã cập nhật thông tin video.');
      await loadData();
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Không cập nhật được video.'));
    } finally {
      setActionLoadingId(null);
    }
  }, [accessToken, editDescription, editFile, editProductId, editTitle, editingVideo, loadData, uploadVideoMedia]);

  const handleRetryUpload = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!retryVideo || !retryFile) {
      setError('Vui lòng chọn file video để upload lại.');
      return;
    }
    setActionLoadingId(retryVideo.videoId);
    setError(null);
    setMessage(null);
    try {
      await uploadVideoMedia(retryVideo, retryFile);
      setRetryVideo(null);
      setRetryFile(null);
      setMessage('Upload lại thành công. Bạn có thể kiểm tra và gửi duyệt video.');
      await loadData();
    } catch (retryError) {
      setError(getErrorMessage(retryError, 'Upload lại video thất bại.'));
    } finally {
      setActionLoadingId(null);
    }
  }, [loadData, retryFile, retryVideo, uploadVideoMedia]);

  const handleDeleteVideo = useCallback(async (video: SellerVideo) => {
    if (!accessToken || !window.confirm(`Xóa video “${video.title}”? Thao tác này không thể hoàn tác trên Kênh Người Bán.`)) {
      return;
    }
    setActionLoadingId(video.videoId);
    setError(null);
    setMessage(null);
    try {
      await archiveSellerVideo(accessToken, video.videoId);
      setMessage('Đã xóa video khỏi danh sách của shop.');
      await loadData();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Không xóa được video.'));
    } finally {
      setActionLoadingId(null);
    }
  }, [accessToken, loadData]);

  const stats = useMemo(() => {
    const published = videos.filter((video) => video.status === 'published').length;
    const views = videos.reduce((total, video) => total + (video.metrics?.qualifiedViewCount ?? 0), 0);
    const clicks = videos.reduce((total, video) => total + (video.metrics?.productClickCount ?? 0), 0);
    const ctr = views > 0 ? `${((clicks / views) * 100).toFixed(1)}%` : '0%';
    return { published, views, ctr };
  }, [videos]);
  const rejectedVideos = useMemo(() => videos.filter((video) => video.status === 'rejected'), [videos]);

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
          <Link
            href="/login"
            className="mt-5 inline-flex rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
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
            <Link href="/" className="hover:text-[#ee4d2d]">
              Trang chủ
            </Link>
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
                <button
                  type="button"
                  onClick={() => void loadData()}
                  className="rounded-md border border-[#ee4d2d] px-4 py-2 text-sm font-semibold text-[#ee4d2d]"
                >
                  Làm mới
                </button>
              </div>
            </div>

            {(message || error) && (
              <div
                className={`rounded-md border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
              >
                {error ?? message}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <KpiCard label="Video published" value={String(stats.published)} />
              <KpiCard label="Qualified views" value={String(stats.views)} />
              <KpiCard label="CTR" value={stats.ctr} />
            </div>

            {rejectedVideos.length > 0 ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="status">
                <p className="font-semibold">Bạn có {rejectedVideos.length} video bị từ chối.</p>
                <p className="mt-1">Xem lý do trong danh sách, chỉnh sửa rồi gửi duyệt lại.</p>
              </div>
            ) : null}

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
                        <tr>
                          <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                            Đang tải...
                          </td>
                        </tr>
                      )}
                      {!isLoading && videos.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                            Chưa có video nào.
                          </td>
                        </tr>
                      )}
                      {videos.map((video) => {
                        const videoAction = getVideoAction(video);
                        const actionLoading = actionLoadingId === video.videoId;
                        return (
                          <tr key={video.videoId}>
                            <td className="px-3 py-2">
                              <p className="font-medium text-slate-800">{video.title}</p>
                              <p className="text-xs text-slate-500">{video.videoId}</p>
                            </td>
                            <td className="px-3 py-2 text-slate-700">{video.products.map((product) => product.name).join(', ')}</td>
                            <td className="px-3 py-2 text-slate-700">
                              <p className="font-medium text-slate-800">{getVideoStatusLabel(video)}</p>
                              {!hasReadyVideoMedia(video) && canRetryVideo(video) ? (
                                <p className="mt-1 max-w-xs text-xs text-slate-500">Video chưa sẵn sàng. Bạn có thể tải lại file hoặc xóa bản ghi này.</p>
                              ) : null}
                              {video.status === 'rejected' ? (
                                <p className="mt-1 max-w-xs text-xs font-medium text-rose-600">
                                  Lý do: {video.moderation?.rejectionReason || 'Moderator chưa cung cấp lý do.'}
                                </p>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-slate-700">{video.metrics?.qualifiedViewCount ?? 0}</td>
                            <td className="px-3 py-2">
                              <div className="grid min-w-[220px] grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => setPreviewVideo(video)}
                                  title="Xem chi tiết video"
                                  className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#ee4d2d] hover:border-[#ee4d2d] hover:bg-orange-50"
                                >
                                  Chi tiết
                                </button>
                                {videoAction.action !== 'none' ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleTogglePublish(video)}
                                    disabled={videoAction.disabled || actionLoading || isSubmitting}
                                    className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#ee4d2d] hover:text-[#ee4d2d] disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                                  >
                                    {actionLoading ? 'Đang xử lý...' : videoAction.label}
                                  </button>
                                ) : null}
                                {canEditVideo(video) ? (
                                  <button
                                    type="button"
                                    onClick={() => openEditor(video)}
                                    disabled={actionLoading || isSubmitting}
                                    className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#ee4d2d] hover:text-[#ee4d2d] disabled:opacity-50"
                                  >
                                    Sửa
                                  </button>
                                ) : null}
                                {canRetryVideo(video) ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRetryVideo(video);
                                      setRetryFile(null);
                                    }}
                                    disabled={actionLoading || isSubmitting}
                                    className="w-full rounded-md border border-[#ee4d2d] px-3 py-1.5 text-xs font-semibold text-[#ee4d2d] hover:bg-orange-50 disabled:opacity-50"
                                  >
                                    Upload lại
                                  </button>
                                ) : null}
                                {canDeleteVideo(video) ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteVideo(video)}
                                    disabled={actionLoading || isSubmitting}
                                    className="w-full rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                                  >
                                    Xóa
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
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
                      <input
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                        maxLength={120}
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Mô tả
                      <textarea
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        className="mt-1 min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                        maxLength={1000}
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Sản phẩm gắn vào video
                      <select
                        value={selectedProductId}
                        onChange={(event) => setSelectedProductId(event.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      >
                        <option value="">Chọn sản phẩm ACTIVE</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      File video MP4/WebM
                      <input
                        type="file"
                        required
                        accept="video/mp4,video/webm"
                        onChange={handleFileChange}
                        className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      />
                      <span className="mt-1 block text-xs text-slate-500">Dung lượng tối đa {MAX_VIDEO_SIZE_MB}MB.</span>
                    </label>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full rounded-md bg-[#ee4d2d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#db4729] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSubmitting ? 'Đang xử lý...' : 'Tạo + upload + gửi duyệt'}
                    </button>
                  </div>
                </form>

                <div className="rounded-md border border-slate-200 bg-white p-4">
                  <h2 className="text-base font-semibold text-slate-900">Checklist trước khi đăng</h2>
                  <ul className="mt-3 space-y-2 text-sm text-slate-700">
                    {checklist.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <span className="mt-1 text-[#ee4d2d]">●</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            </div>
          </section>
        </main>
      </div>

      {previewVideo ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6">
          <div className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ee4d2d]">Preview video</p>
                <h2 className="mt-1 text-base font-semibold text-slate-900">{previewVideo.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setPreviewVideo(null)}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-600 hover:border-[#ee4d2d] hover:text-[#ee4d2d]"
              >
                Đóng
              </button>
            </div>
            <div className="bg-slate-950">
              {previewVideo.mediaUrl ? (
                <video src={resolveMediaUrl(previewVideo.mediaUrl)} controls autoPlay className="max-h-[72vh] w-full bg-slate-950 object-contain" />
              ) : (
                <div className="flex h-72 items-center justify-center text-sm text-white">Video chưa có file để xem trước.</div>
              )}
            </div>
            <div className="space-y-2 px-4 py-3 text-sm text-slate-600">
              <p>
                Trạng thái: <span className="font-semibold text-slate-900">{getVideoStatusLabel(previewVideo)}</span>
              </p>
              {!hasReadyVideoMedia(previewVideo) && canRetryVideo(previewVideo) ? (
                <p className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                  File video chưa sẵn sàng. Đóng cửa sổ này rồi chọn “Upload lại” để tiếp tục, hoặc xóa bản ghi nếu không còn sử dụng.
                </p>
              ) : null}
              <p>Sản phẩm: {previewVideo.products.map((product) => product.name).join(', ') || 'Chưa gắn sản phẩm'}</p>
              <p>Mô tả: {previewVideo.description || 'Chưa có mô tả'}</p>
              {previewVideo.status === 'rejected' ? (
                <p className="font-medium text-rose-600">
                  Lý do từ chối: {previewVideo.moderation?.rejectionReason || 'Moderator chưa cung cấp lý do.'}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {editingVideo ? (
        <VideoEditorModal
          title="Chỉnh sửa video"
          submitLabel={actionLoadingId === editingVideo.videoId ? 'Đang lưu...' : 'Lưu thay đổi'}
          titleValue={editTitle}
          descriptionValue={editDescription}
          productId={editProductId}
          products={products}
          disabled={actionLoadingId === editingVideo.videoId}
          onTitleChange={setEditTitle}
          onDescriptionChange={setEditDescription}
          onProductChange={setEditProductId}
          onFileChange={setEditFile}
          onClose={() => setEditingVideo(null)}
          onSubmit={handleSaveVideo}
        />
      ) : null}

      {retryVideo ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6">
          <form onSubmit={(event) => void handleRetryUpload(event)} className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-900">Upload lại video</h2>
            <p className="mt-1 text-sm text-slate-600">{retryVideo.title}</p>
            <input
              type="file"
              required
              accept="video/mp4,video/webm"
              onChange={(event) => setRetryFile(event.target.files?.[0] ?? null)}
              className="mt-4 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setRetryVideo(null)} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
                Hủy
              </button>
              <button disabled={actionLoadingId === retryVideo.videoId} className="rounded-md bg-[#ee4d2d] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {actionLoadingId === retryVideo.videoId ? 'Đang upload...' : 'Upload lại'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
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

function canEditVideo(video: SellerVideo): boolean {
  return ['draft', 'processing', 'processing_failed', 'rejected', 'hidden'].includes(video.status);
}

function canRetryVideo(video: SellerVideo): boolean {
  return ['draft', 'processing', 'processing_failed', 'rejected'].includes(video.status) &&
    (video.status === 'processing_failed' || video.status === 'processing' || !video.mediaUrl);
}

function canDeleteVideo(video: SellerVideo): boolean {
  return ['draft', 'processing', 'processing_failed', 'rejected'].includes(video.status);
}

function validateVideoFile(file: File): void {
  if (!['video/mp4', 'video/webm'].includes(file.type)) {
    throw new Error('Chỉ hỗ trợ video MP4 hoặc WebM.');
  }
  if (file.size < 1 || file.size > MAX_VIDEO_SIZE_BYTES) {
    throw new Error(`Video tối đa ${MAX_VIDEO_SIZE_MB}MB.`);
  }
}

interface VideoEditorModalProps {
  title: string;
  submitLabel: string;
  titleValue: string;
  descriptionValue: string;
  productId: string;
  products: SellerProduct[];
  disabled: boolean;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onProductChange: (value: string) => void;
  onFileChange: (file: File | null) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function VideoEditorModal(props: VideoEditorModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6">
      <form onSubmit={props.onSubmit} className="w-full max-w-lg space-y-4 rounded-xl bg-white p-5 shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-900">{props.title}</h2>
        <label className="block text-sm font-medium text-slate-700">
          Tiêu đề
          <input value={props.titleValue} onChange={(event) => props.onTitleChange(event.target.value)} required maxLength={120} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2" />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Mô tả
          <textarea value={props.descriptionValue} onChange={(event) => props.onDescriptionChange(event.target.value)} maxLength={1000} className="mt-1 min-h-24 w-full rounded-md border border-slate-200 px-3 py-2" />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Sản phẩm
          <select value={props.productId} onChange={(event) => props.onProductChange(event.target.value)} required className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2">
            <option value="">Chọn sản phẩm ACTIVE</option>
            {props.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Thay file video (không bắt buộc)
          <input type="file" accept="video/mp4,video/webm" onChange={(event) => props.onFileChange(event.target.files?.[0] ?? null)} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={props.onClose} disabled={props.disabled} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Hủy</button>
          <button disabled={props.disabled} className="rounded-md bg-[#ee4d2d] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{props.submitLabel}</button>
        </div>
      </form>
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
