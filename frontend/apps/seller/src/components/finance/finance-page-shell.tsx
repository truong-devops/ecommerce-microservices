'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import type { SellerAuthUser } from '@/lib/api/types';
import { useAuth } from '@/providers/AppProvider';

interface FinancePageShellProps {
  current: string;
  parent?: { label: string; href: string };
  children: (context: { accessToken: string; user: SellerAuthUser }) => ReactNode;
}

export function FinancePageShell({ current, parent, children }: FinancePageShellProps) {
  const router = useRouter();
  const { ready, user, accessToken, logout } = useAuth();
  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  if (!ready) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-slate-600">Đang kiểm tra phiên đăng nhập...</main>;
  }

  if (!user || !accessToken) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ee4d2d]">eMall Seller</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Bạn chưa đăng nhập</h1>
          <p className="mt-2 text-sm text-slate-600">Đăng nhập để truy cập khu vực tài chính của shop.</p>
          <Link
            href="/login"
            className="mt-5 inline-flex rounded-md bg-[#ee4d2d] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#db4729]"
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
          <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-sm text-slate-500">
            <Link href="/" className="transition hover:text-[#ee4d2d]">
              Trang chủ
            </Link>
            <span aria-hidden="true">›</span>
            {parent ? (
              <>
                <Link href={parent.href} className="transition hover:text-[#ee4d2d]">
                  {parent.label}
                </Link>
                <span aria-hidden="true">›</span>
              </>
            ) : null}
            <span className="font-medium text-slate-700">{current}</span>
          </nav>
          {children({ accessToken, user })}
        </main>
      </div>
    </div>
  );
}

export function FinanceAlert({ tone, children }: { tone: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'border-rose-200 bg-rose-50 text-rose-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    info: 'border-sky-200 bg-sky-50 text-sky-700'
  } as const;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-md border px-3 py-2.5 text-sm ${styles[tone]}`}>
      {children}
    </div>
  );
}

export function FinanceEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center px-6 py-10 text-center">
      <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
        <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current" strokeWidth="1.7">
          <path d="M4 7.5h16v11H4z" />
          <path d="M8 4.5h8M8 12h8" />
        </svg>
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

export function FinanceLoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-label="Đang tải dữ liệu" className="animate-pulse space-y-3 p-4">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-11 rounded-md bg-slate-100" />
      ))}
    </div>
  );
}
