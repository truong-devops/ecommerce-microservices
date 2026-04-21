'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { SellerDashboard } from '@/components/dashboard/seller-dashboard';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { fetchSellerDashboard } from '@/lib/api/dashboard';
import { SellerApiClientError } from '@/lib/api/client';
import type { DateRange, SellerDashboardData } from '@/lib/api/types';
import { useAuth } from '@/providers/AppProvider';

type DashboardStatus = 'idle' | 'loading' | 'success' | 'error';
type DashboardRangeDays = 7 | 14 | 30;

export default function SellerDashboardPage() {
  const router = useRouter();
  const { ready, user, accessToken, logout } = useAuth();

  const [rangeDays, setRangeDays] = useState<DashboardRangeDays>(7);
  const [status, setStatus] = useState<DashboardStatus>('idle');
  const [error, setError] = useState('');
  const [dashboardData, setDashboardData] = useState<SellerDashboardData | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setStatus('loading');
    setError('');

    try {
      const data = await fetchSellerDashboard({
        accessToken,
        range: toDashboardDateRange(rangeDays)
      });
      setDashboardData(data);
      setStatus('success');
    } catch (loadError) {
      if (loadError instanceof SellerApiClientError) {
        setError(loadError.message);
      } else {
        setError('Khong the tai dashboard tu backend.');
      }
      setStatus('error');
    }
  }, [accessToken, rangeDays]);

  useEffect(() => {
    if (!ready || !accessToken) {
      return;
    }

    void loadDashboard();
  }, [ready, accessToken, loadDashboard]);

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-slate-600">
        Đang kiểm tra phiên đăng nhập...
      </main>
    );
  }

  if (!user || !accessToken) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-orange-500">eMall Seller</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Bạn chưa đăng nhập</h1>
          <p className="mt-2 text-sm text-slate-600">Đăng nhập để truy cập Seller Dashboard.</p>

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

        <main className="min-w-0 flex-1 px-3 py-3">
          {(status === 'loading' || status === 'idle') && !dashboardData ? (
            <section className="rounded-md border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
              Dang tai du lieu dashboard...
            </section>
          ) : null}

          {status === 'loading' && dashboardData ? (
            <section className="mb-3 rounded-md border border-orange-200 bg-[#fff7f3] px-3 py-2 text-xs font-medium text-[#c2410c]">
              Dang cap nhat du lieu...
            </section>
          ) : null}

          {status === 'error' ? (
            <section className="rounded-md border border-rose-200 bg-white p-6 text-center">
              <p className="text-sm text-rose-600">{error || 'Khong the tai dashboard.'}</p>
              <button
                type="button"
                onClick={() => {
                  void loadDashboard();
                }}
                className="mt-4 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
              >
                Thu lai
              </button>
            </section>
          ) : null}

          {dashboardData ? (
            <SellerDashboard
              data={dashboardData}
              rangeDays={rangeDays}
              onRangeChange={(days) => {
                if (days === 7 || days === 14 || days === 30) {
                  setRangeDays(days);
                }
              }}
              isRefreshing={status === 'loading'}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}

function toDashboardDateRange(days: DashboardRangeDays): DateRange {
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - days * 24 * 60 * 60 * 1000);

  return {
    from: fromDate.toISOString(),
    to: toDate.toISOString()
  };
}
