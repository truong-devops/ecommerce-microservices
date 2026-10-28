'use client';

import { useState } from 'react';
import type { ModerationProduct, ModerationProductStatus } from '@/lib/api/types';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  CheckIcon,
  EyeOffIcon,
  Edit3Icon,
  ArchiveIcon,
  CopyIcon,
  CheckCircle2Icon,
  StoreIcon,
  TagIcon,
  PackageIcon,
  EyeIcon
} from '@/components/ui/icons';

interface ProductModerationBoardProps {
  items: ModerationProduct[];
  loading: boolean;
  onUpdateStatus: (productId: string, status: ModerationProductStatus, reason?: string) => void;
}

const MEDIA_PUBLIC_BASE_URL = (
  process.env.NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL ?? 'http://127.0.0.1:12030/ecommerce-media'
).replace(/\/$/, '');

export function ProductModerationBoard({ items, loading, onUpdateStatus }: ProductModerationBoardProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
  const [modalAction, setModalAction] = useState<{
    product: ModerationProduct;
    targetStatus: ModerationProductStatus;
  } | null>(null);
  const [reasonInput, setReasonInput] = useState('');

  const copyToClipboard = (text: string, id: string) => {
    void navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenActionModal = (product: ModerationProduct, targetStatus: ModerationProductStatus) => {
    setModalAction({ product, targetStatus });
    setReasonInput('');
  };

  const handleConfirmAction = () => {
    if (!modalAction) return;
    onUpdateStatus(modalAction.product.id, modalAction.targetStatus, reasonInput.trim() || undefined);
    setModalAction(null);
    setReasonInput('');
  };

  if (loading) {
    return (
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="h-5 w-48 bg-slate-100 animate-pulse rounded" />
          <div className="h-5 w-24 bg-slate-100 animate-pulse rounded" />
        </div>
        <div className="divide-y divide-slate-100 p-4 space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 py-3">
              <div className="h-16 w-16 bg-slate-100 animate-pulse rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 bg-slate-100 animate-pulse rounded" />
                <div className="h-3 w-1/4 bg-slate-100 animate-pulse rounded" />
              </div>
              <div className="h-8 w-24 bg-slate-100 animate-pulse rounded-lg" />
              <div className="h-8 w-32 bg-slate-100 animate-pulse rounded-lg" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-card">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
          <PackageIcon size={28} />
        </div>
        <h3 className="mt-4 text-base font-bold text-slate-900">Không tìm thấy sản phẩm nào</h3>
        <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
          Không có sản phẩm nào phù hợp với bộ lọc hiện tại. Thử thay đổi từ khóa tìm kiếm hoặc trạng thái.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1060px] border-collapse text-left text-sm">
            <thead className="border-b border-slate-200/90 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3.5">Sản phẩm</th>
                <th className="px-4 py-3.5">Người bán</th>
                <th className="px-4 py-3.5">Danh mục</th>
                <th className="px-4 py-3.5">Giá niêm yết</th>
                <th className="px-4 py-3.5">Trạng thái</th>
                <th className="px-4 py-3.5 text-right">Kiểm duyệt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {items.map((item) => {
                const imageUrl = resolveImageUrl(item.images[0]);
                const defaultSku = item.variants.find((variant) => variant.isDefault)?.sku ?? '--';
                const currency = item.variants[0]?.currency ?? 'VND';
                const productCode = item.productCode || toDisplayCode(item.id, 'PRD');
                const sellerCode = item.sellerCode || toDisplayCode(item.sellerId, 'SEL');

                return (
                  <tr
                    key={item.id}
                    className="group transition-colors duration-150 hover:bg-slate-50/70"
                  >
                    {/* Column 1: Product Thumbnail & Info */}
                    <td className="px-4 py-3.5 max-w-[420px]">
                      <div className="flex items-start gap-3.5">
                        {/* Image */}
                        <div
                          onClick={() => imageUrl && setPreviewImage({ url: imageUrl, title: item.name })}
                          className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100 transition duration-150 ${
                            imageUrl ? 'cursor-pointer hover:ring-2 hover:ring-brand-500 hover:shadow-subtle' : ''
                          }`}
                        >
                          {imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imageUrl}
                              alt={item.name}
                              className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                            />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-slate-400">
                              <PackageIcon size={22} />
                            </div>
                          )}
                          {imageUrl && (
                            <span className="absolute bottom-0 right-0 rounded-tl bg-slate-900/60 p-0.5 text-white opacity-0 transition group-hover:opacity-100">
                              <EyeIcon size={10} />
                            </span>
                          )}
                        </div>

                        {/* Details */}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-950 leading-snug line-clamp-2 hover:text-brand-600 transition">
                            {item.name}
                          </p>

                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                            {/* SKU badge */}
                            <button
                              type="button"
                              onClick={() => copyToClipboard(defaultSku, `sku-${item.id}`)}
                              className="group/btn inline-flex items-center gap-1 rounded-md bg-slate-100/90 px-2 py-0.5 font-mono text-[11px] text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
                              title="Sao chép SKU"
                            >
                              <span>SKU: {defaultSku}</span>
                              {copiedId === `sku-${item.id}` ? (
                                <CheckCircle2Icon size={12} className="text-emerald-600" />
                              ) : (
                                <CopyIcon size={11} className="text-slate-400 group-hover/btn:text-slate-600" />
                              )}
                            </button>

                            {/* Product Code */}
                            <button
                              type="button"
                              onClick={() => copyToClipboard(productCode, `code-${item.id}`)}
                              className="group/btn inline-flex items-center gap-1 rounded-md bg-slate-100/90 px-2 py-0.5 font-mono text-[11px] text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
                              title="Sao chép mã sản phẩm"
                            >
                              <span>ID: {productCode}</span>
                              {copiedId === `code-${item.id}` ? (
                                <CheckCircle2Icon size={12} className="text-emerald-600" />
                              ) : (
                                <CopyIcon size={11} className="text-slate-400 group-hover/btn:text-slate-600" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Column 2: Seller */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="grid h-7 w-7 place-items-center rounded-lg bg-orange-50 text-brand-700">
                          <StoreIcon size={14} />
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(sellerCode, `sel-${item.id}`)}
                            className="group/btn inline-flex items-center gap-1 font-mono text-xs font-semibold text-slate-800 hover:text-brand-600"
                            title="Sao chép mã người bán"
                          >
                            <span>{sellerCode}</span>
                            {copiedId === `sel-${item.id}` ? (
                              <CheckCircle2Icon size={12} className="text-emerald-600" />
                            ) : (
                              <CopyIcon size={11} className="text-slate-400 group-hover/btn:text-slate-600" />
                            )}
                          </button>
                          <span className="block text-[11px] text-slate-400">Seller Store</span>
                        </div>
                      </div>
                    </td>

                    {/* Column 3: Category */}
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs">
                        <TagIcon size={12} className="text-slate-400" />
                        <span className="truncate max-w-[150px]">{item.categoryId}</span>
                      </span>
                    </td>

                    {/* Column 4: Min Price */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="font-bold text-slate-950">
                        {item.minPrice.toLocaleString('vi-VN')} {currency}
                      </span>
                      {item.variants.length > 1 && (
                        <span className="block text-[11px] text-slate-400 font-medium">
                          {item.variants.length} phân loại
                        </span>
                      )}
                    </td>

                    {/* Column 5: Status Badge */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <StatusBadge status={item.status} />
                    </td>

                    {/* Column 6: Action Controls */}
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {/* Primary Context Action */}
                        {item.status !== 'ACTIVE' ? (
                          <button
                            type="button"
                            onClick={() => handleOpenActionModal(item, 'ACTIVE')}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-subtle transition hover:bg-emerald-700 active:scale-95"
                            title="Duyệt và xuất bản sản phẩm"
                          >
                            <CheckIcon size={13} />
                            <span>Duyệt</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenActionModal(item, 'HIDDEN')}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 shadow-2xs transition hover:bg-amber-100 active:scale-95"
                            title="Tạm ẩn sản phẩm khỏi sàn"
                          >
                            <EyeOffIcon size={13} />
                            <span>Ẩn</span>
                          </button>
                        )}

                        {/* Secondary Actions */}
                        {item.status !== 'DRAFT' && (
                          <button
                            type="button"
                            onClick={() => handleOpenActionModal(item, 'DRAFT')}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-slate-300 hover:bg-slate-50"
                            title="Chuyển về trạng thái nháp"
                          >
                            <Edit3Icon size={12} className="text-slate-400" />
                            <span>Nháp</span>
                          </button>
                        )}

                        {item.status !== 'ARCHIVED' && (
                          <button
                            type="button"
                            onClick={() => handleOpenActionModal(item, 'ARCHIVED')}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                            title="Lưu trữ sản phẩm"
                          >
                            <ArchiveIcon size={12} className="text-slate-400 hover:text-rose-600" />
                            <span>Lưu trữ</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Image Zoom Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-2xl overflow-hidden rounded-2xl bg-white p-2 shadow-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage.url}
              alt={previewImage.title}
              className="max-h-[80vh] w-full rounded-xl object-contain bg-slate-900"
            />
            <div className="p-3 text-center">
              <p className="text-sm font-semibold text-slate-800 line-clamp-1">{previewImage.title}</p>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="mt-2 rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-slate-800"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modern Status Confirmation Modal */}
      {modalAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-dialog">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-950">Xác nhận chuyển trạng thái</span>
              </div>
              <StatusBadge status={modalAction.targetStatus} size="sm" />
            </div>

            <div className="mt-4">
              <p className="text-sm text-slate-600">
                Bạn đang chuyển sản phẩm{' '}
                <strong className="text-slate-900">{modalAction.product.name}</strong> sang trạng thái{' '}
                <strong className="text-brand-600">{modalAction.targetStatus}</strong>.
              </p>

              <div className="mt-4">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Lý do kiểm duyệt (Tùy chọn)
                </label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[
                    'Đạt tiêu chuẩn đăng bán',
                    'Hình ảnh chất lượng kém',
                    'Nội dung vi phạm chính sách',
                    'Sai thông tin ngành hàng'
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setReasonInput(preset)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <textarea
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  placeholder="Ghi chú thêm lý do kiểm duyệt để lưu audit log..."
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/10"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setModalAction(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-subtle transition hover:bg-brand-700 active:scale-95"
              >
                Xác nhận thay đổi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function resolveImageUrl(value: string | undefined): string {
  if (!value) {
    return '';
  }

  if (/^https?:\/\//i.test(value)) {
    return normalizeProductImageUrl(value);
  }

  const normalized = value.startsWith('/') ? value.slice(1) : value;
  return `${MEDIA_PUBLIC_BASE_URL}/${normalized}`;
}

function normalizeProductImageUrl(raw: string): string {
  const value = raw.trim();

  const legacyPrefixes = [
    'http://localhost:3003/',
    'http://127.0.0.1:3003/',
    'http://localhost:12030/',
    'http://127.0.0.1:12030/'
  ];
  const legacyPrefix = legacyPrefixes.find((prefix) => value.startsWith(prefix));
  if (legacyPrefix) {
    const relativePath = value.slice(legacyPrefix.length).replace(/^ecommerce-media\//, '');
    return `${MEDIA_PUBLIC_BASE_URL}/${relativePath}`;
  }

  return value;
}

function toDisplayCode(raw: string, prefix: string): string {
  const source = raw.trim();
  if (!source) {
    return `${prefix}0000000`;
  }

  const normalized = source.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const exactPattern = new RegExp(`^${prefix}(\\d{7})$`);
  const exactMatch = normalized.match(exactPattern);
  if (exactMatch) {
    return `${prefix}${exactMatch[1]}`;
  }

  const digits = normalized.replace(/\D/g, '');
  if (digits.length >= 7) {
    return `${prefix}${digits.slice(-7)}`;
  }

  return `${prefix}${String(stableHash(source)).padStart(7, '0')}`;
}

function stableHash(value: string): number {
  const modulo = 10_000_000;
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % modulo;
  }

  return hash;
}
