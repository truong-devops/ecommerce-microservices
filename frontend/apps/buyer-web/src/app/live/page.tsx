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

export default function LiveSessionsPage() {
  const { text } = useLanguage();
  const [status, setStatus] = useState<LiveListStatus>('loading');
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [error, setError] = useState('');

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
    <div className="min-h-screen bg-[#f6f6f6] text-slate-900">
      <Header keywords={['livestream', 'sale live', 'deal hot']} />

      <main className="mx-auto w-full max-w-[1200px] px-3 py-4 md:px-4 md:py-6">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ee4d2d]">eMall Live</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">Mua sắm trực tiếp cùng shop</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Xem shop phát trực tiếp, trò chuyện trong phòng live và mua nhanh các sản phẩm đang được ghim.
              </p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <Link
                href="/videos"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-center text-sm font-semibold text-slate-700 hover:border-[#ee4d2d] hover:text-[#ee4d2d] sm:flex-none"
              >
                Xem video
              </Link>
              <button
                type="button"
                onClick={() => void loadSessions()}
                className="flex-1 rounded-lg bg-[#ee4d2d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#d94324] sm:flex-none"
              >
                Làm mới
              </button>
            </div>
          </div>
        </section>

        {status === 'loading' ? <p className="py-16 text-center text-sm text-slate-600">{text.home.loading}</p> : null}

        {status === 'error' ? (
          <section className="mt-6 rounded-2xl border border-red-100 bg-white p-6 text-center">
            <p className="text-sm text-red-600">{error || text.home.loadError}</p>
          </section>
        ) : null}

        {status === 'success' && sessions.length === 0 ? (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-lg font-semibold text-slate-900">Chưa có shop nào đang live.</p>
            <p className="mt-2 text-sm text-slate-500">Khi người bán bắt đầu phát trực tiếp, phòng live sẽ xuất hiện tại đây.</p>
          </section>
        ) : null}

        {status === 'success' && sessions.length > 0 ? (
          <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sessions.map((session) => (
              <Link
                key={session.sessionId}
                href={`/live/${encodeURIComponent(session.sessionId)}`}
                className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-[#ee4d2d] hover:shadow-md"
              >
                <div className="relative aspect-video bg-slate-100">
                  <Image src={session.thumbnailUrl || '/icon.svg'} alt={session.title} fill unoptimized className="object-cover" />
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-[#ee4d2d] px-3 py-1 text-xs font-bold text-white shadow-sm">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                    LIVE
                  </span>
                  <span className="absolute bottom-3 right-3 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
                    Xem ngay
                  </span>
                </div>
                <div className="p-4">
                  <h2 className="line-clamp-2 text-base font-semibold text-slate-950 group-hover:text-[#ee4d2d]">{session.title}</h2>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{session.description || 'Shop đang phát trực tiếp.'}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span>{session.metricsSnapshot.viewerPeak} người xem cao nhất</span>
                    <span aria-hidden="true">·</span>
                    <span>{session.metricsSnapshot.messageCount} tin nhắn</span>
                    <span aria-hidden="true">·</span>
                    <span>{session.metricsSnapshot.productClickCount} lượt xem sản phẩm</span>
                  </div>
                </div>
              </Link>
            ))}
          </section>
        ) : null}
      </main>
    </div>
  );
}
