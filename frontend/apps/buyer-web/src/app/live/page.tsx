'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { BuyerApiClientError } from '@/lib/api/client';
import { listLiveSessions } from '@/lib/api/live';
import type { LiveSession } from '@/lib/api/types';
import { useLanguage } from '@/providers/AppProvider';

type LiveListStatus = 'loading' | 'error' | 'success';

const CATEGORIES = [
  'Tất cả',
  'Thời trang & Phụ kiện',
  'Điện tử & Công nghệ',
  'Mỹ phẩm & Làm đẹp',
  'Đời sống & Gia dụng'
] as const;

export default function LiveSessionsPage() {
  const { text } = useLanguage();
  const [status, setStatus] = useState<LiveListStatus>('loading');
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Tất cả');

  const loadSessions = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const data = await listLiveSessions({ page: 1, pageSize: 24, status: 'LIVE' });
      setSessions(data);
      setStatus('success');
    } catch (loadError) {
      setError(loadError instanceof BuyerApiClientError ? loadError.message : text.home.loadError);
      setStatus('error');
    }
  }, [text.home.loadError]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#222222]">
      <Header keywords={['Shopee Live', 'livestream', 'sale live', 'deal hot', 'Shopee Video']} />

      <main className="mx-auto w-full max-w-[1240px] px-3 py-4 md:px-4 md:py-6 space-y-4">
        {/* Shopee Live Hero Banner */}
        <section className="relative overflow-hidden rounded-xs bg-gradient-to-r from-[#ee4d2d] via-[#f05637] to-[#ff7337] p-6 text-white shadow-xs">
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur-xs px-3 py-1 text-xs font-bold uppercase tracking-wider text-white border border-white/25">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                <span>eMall Live Shopping</span>
              </div>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-white md:text-3xl">
                Săn Deal Giờ Vàng Trực Tiếp Cùng Shop
              </h1>
              <p className="mt-2 text-xs md:text-sm text-white/90 leading-relaxed">
                Xem người bán review sản phẩm chân thực, đặt câu hỏi trực tiếp và chốt đơn với voucher giảm giá độc quyền đến 50%.
              </p>

              {/* 3 Value Pillars */}
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-white/15 px-3 py-1 border border-white/20">
                  🎟️ Voucher Live 50%
                </span>
                <span className="rounded-full bg-white/15 px-3 py-1 border border-white/20">
                  ⚡ Flash Sale Giờ Vàng
                </span>
                <span className="rounded-full bg-white/15 px-3 py-1 border border-white/20">
                  🚚 Freeship Đơn Từ 0Đ
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void loadSessions()}
              className="rounded-xs bg-white px-5 py-2.5 text-xs font-bold text-[#ee4d2d] hover:bg-[#fff7f5] transition shadow-md shrink-0 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Làm mới danh sách</span>
            </button>
          </div>
        </section>

        {/* Category Navigation Pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`shrink-0 rounded-xs px-4 py-2 text-xs font-bold transition shadow-2xs border ${
                  isActive
                    ? 'border-[#ee4d2d] bg-[#fef6f5] text-[#ee4d2d]'
                    : 'border-[#e8e8e8] bg-white text-[#555555] hover:border-[#ee4d2d] hover:text-[#ee4d2d]'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Loading State */}
        {status === 'loading' ? (
          <div className="rounded-xs border border-[#e8e8e8] bg-white py-20 text-center shadow-xs">
            <span className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-[#ee4d2d] border-t-transparent" />
            <p className="mt-3 text-xs text-[#757575]">{text.home.loading}</p>
          </div>
        ) : null}

        {/* Error State */}
        {status === 'error' ? (
          <div className="rounded-xs border border-[#fcdcd7] bg-white p-8 text-center shadow-xs max-w-md mx-auto">
            <p className="text-sm font-semibold text-[#ee4d2d]">{error || text.home.loadError}</p>
            <button
              type="button"
              onClick={() => void loadSessions()}
              className="mt-4 rounded-xs bg-[#ee4d2d] px-5 py-2 text-xs font-bold text-white hover:bg-[#d73211] transition shadow-xs"
            >
              {text.home.retry}
            </button>
          </div>
        ) : null}

        {/* Empty State Hub: Rich, Informative & Actionable */}
        {status === 'success' && sessions.length === 0 ? (
          <div className="space-y-4">
            <section className="rounded-xs border border-[#e8e8e8] bg-white p-8 text-center shadow-xs">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#fef6f5] text-3xl text-[#ee4d2d] border border-[#fcdcd7] mb-3">
                📡
              </div>
              <h2 className="text-lg font-bold text-[#222222]">Hiện tại chưa có phiên livestream nào đang phát</h2>
              <p className="mt-1 text-xs text-[#757575] max-w-lg mx-auto leading-relaxed">
                Các phiên live sôi động với bão deal thường bắt đầu vào các khung giờ vàng: <strong className="text-[#ee4d2d]">11:30 - 13:30</strong> trưa và <strong className="text-[#ee4d2d]">19:30 - 22:30</strong> tối mỗi ngày.
              </p>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/videos"
                  className="rounded-xs bg-[#ee4d2d] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#d73211] transition shadow-xs flex items-center gap-1.5"
                >
                  <span>🎬 Khám phá Shopee Video</span>
                </Link>
                <Link
                  href="/"
                  className="rounded-xs border border-[#e8e8e8] bg-white px-5 py-2.5 text-xs font-bold text-[#555555] hover:border-[#ee4d2d] hover:text-[#ee4d2d] transition shadow-xs"
                >
                  Săn deal trang chủ
                </Link>
                <button
                  type="button"
                  onClick={() => void loadSessions()}
                  className="rounded-xs border border-[#ee4d2d] bg-[#fef6f5] px-4 py-2.5 text-xs font-bold text-[#ee4d2d] hover:bg-[#ee4d2d] hover:text-white transition"
                >
                  Kiểm tra lại
                </button>
              </div>
            </section>

            {/* Golden Hours Schedule */}
            <section className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xs border border-[#e8e8e8] bg-white p-5 shadow-xs flex items-start gap-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#fef6f5] text-xl text-[#ee4d2d] border border-[#fcdcd7]">
                  ⏰
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#222222]">Deal Giờ Nghỉ Trưa</h3>
                    <span className="rounded-full bg-[#fef6f5] px-2 py-0.2 text-[10px] font-bold text-[#ee4d2d] border border-[#fcdcd7]">
                      11:30 - 13:30
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#555555] leading-relaxed">
                    Săn các voucher phụ kiện, công nghệ và thời trang với mức giảm đến 40% cho đơn hàng phát sinh trong live.
                  </p>
                </div>
              </div>

              <div className="rounded-xs border border-[#e8e8e8] bg-white p-5 shadow-xs flex items-start gap-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#fef6f5] text-xl text-[#ee4d2d] border border-[#fcdcd7]">
                  🔥
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#222222]">Siêu Tiệc Live Tối</h3>
                    <span className="rounded-full bg-[#fef6f5] px-2 py-0.2 text-[10px] font-bold text-[#ee4d2d] border border-[#fcdcd7]">
                      19:30 - 22:30
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#555555] leading-relaxed">
                    Khung giờ sôi động nhất trong ngày với Flash Sale giá hủy diệt, freeship toàn quốc và quà tặng minigame trực tiếp.
                  </p>
                </div>
              </div>
            </section>

            {/* Benefits of Shopee Live */}
            <section className="rounded-xs border border-[#e8e8e8] bg-white p-5 shadow-xs">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#757575] mb-3">
                Đặc quyền mua sắm trên eMall Live
              </h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xs bg-[#fafafa] p-3.5 border border-[#f1f1f1]">
                  <p className="text-xs font-bold text-[#222222]">🔍 Xem Hàng Thực Tế</p>
                  <p className="mt-1 text-xs text-[#666666] leading-relaxed">
                    Người bán thử đồ, bật máy và quay cận cảnh chi tiết chất liệu giúp bạn yên tâm tuyệt đối khi đặt hàng.
                  </p>
                </div>
                <div className="rounded-xs bg-[#fafafa] p-3.5 border border-[#f1f1f1]">
                  <p className="text-xs font-bold text-[#222222]">💬 Tương Tác Trực Tiếp</p>
                  <p className="mt-1 text-xs text-[#666666] leading-relaxed">
                    Hỏi đáp trực tiếp trong khung chat, yêu cầu người bán thử size và tư vấn màu sắc phù hợp trong tích tắc.
                  </p>
                </div>
                <div className="rounded-xs bg-[#fafafa] p-3.5 border border-[#f1f1f1]">
                  <p className="text-xs font-bold text-[#222222]">🎁 Voucher Live Độc Quyền</p>
                  <p className="mt-1 text-xs text-[#666666] leading-relaxed">
                    Các mã giảm giá giá trị cao chỉ áp dụng cho sản phẩm được ghim trong giỏ hàng phiên live.
                  </p>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {/* Active Live Sessions Grid */}
        {status === 'success' && sessions.length > 0 ? (
          <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {sessions.map((session) => (
              <Link
                key={session.sessionId}
                href={`/live/${encodeURIComponent(session.sessionId)}`}
                className="group overflow-hidden rounded-xs border border-[#e8e8e8] bg-white shadow-xs transition hover:border-[#ee4d2d] hover:shadow-md flex flex-col"
              >
                {/* Thumbnail with Live Overlay */}
                <div className="relative aspect-[4/5] bg-[#111111] overflow-hidden">
                  <Image
                    src={session.thumbnailUrl || '/icon.svg'}
                    alt={session.title}
                    fill
                    unoptimized
                    className="object-cover transition duration-300 group-hover:scale-105"
                  />
                  {/* Gradient Overlay for Text Readability */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />

                  {/* Top Badges */}
                  <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#ee4d2d] px-2.5 py-0.5 text-[10px] font-bold text-white shadow-xs">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                      LIVE
                    </span>
                    <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-xs">
                      👁 {session.metricsSnapshot.viewerPeak.toLocaleString('vi-VN')}
                    </span>
                  </div>

                  {/* Bottom Info on Thumbnail */}
                  <div className="absolute bottom-2.5 left-2.5 right-2.5 text-white">
                    <p className="line-clamp-2 text-xs font-bold leading-snug drop-shadow-sm group-hover:text-[#fef6f5]">
                      {session.title}
                    </p>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="p-3 bg-white flex items-center justify-between gap-2 border-t border-[#f1f1f1] text-xs">
                  <span className="truncate text-[11px] text-[#757575]">
                    {session.description || 'Đang phát sóng trực tiếp'}
                  </span>
                  <span className="shrink-0 rounded-xs bg-[#ee4d2d] px-2 py-1 text-[11px] font-bold text-white group-hover:bg-[#d73211] transition shadow-2xs">
                    Vào xem
                  </span>
                </div>
              </Link>
            ))}
          </section>
        ) : null}
      </main>
    </div>
  );
}
