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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header keywords={['livestream', 'sale live', 'deal hot']} />

      <main className="mx-auto w-full max-w-[1200px] px-4 py-6">
        <section className="overflow-hidden rounded-3xl border border-orange-100 bg-gradient-to-br from-white via-orange-50 to-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Live shopping</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Livestream đang diễn ra</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Buyer có thể xem playback URL, chat realtime và mở sản phẩm được seller ghim trong live.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadSessions()}
              className="rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Tải lại
            </button>
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
            <p className="text-lg font-semibold text-slate-900">Chưa có livestream LIVE.</p>
            <p className="mt-2 text-sm text-slate-500">Tạo và start session từ Seller Center để thấy live ở đây.</p>
          </section>
        ) : null}

        {status === 'success' && sessions.length > 0 ? (
          <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sessions.map((session) => (
              <Link
                key={session.sessionId}
                href={`/live/${encodeURIComponent(session.sessionId)}`}
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
              >
                <div className="relative aspect-video bg-slate-100">
                  <Image src={session.thumbnailUrl || '/icon.svg'} alt={session.title} fill unoptimized className="object-cover" />
                  <span className="absolute left-3 top-3 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white shadow-sm">LIVE</span>
                </div>
                <div className="p-4">
                  <h2 className="line-clamp-2 text-base font-semibold text-slate-950 group-hover:text-brand-600">{session.title}</h2>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{session.description || 'Seller đang livestream bán hàng.'}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2 py-1">Peak {session.metricsSnapshot.viewerPeak}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1">{session.metricsSnapshot.messageCount} chat</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1">{session.metricsSnapshot.productClickCount} clicks</span>
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
