'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { useAuth } from '@/providers/AppProvider';

export default function FinanceBankAccountPage() {
  const router = useRouter();
  const { ready, user, logout } = useAuth();

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  if (!ready) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-slate-600">Đang kiểm tra phiên đăng nhập...</main>;
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-orange-500">eMall Seller</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Bạn chưa đăng nhập</h1>
          <p className="mt-2 text-sm text-slate-600">Đăng nhập để truy cập Seller Center.</p>
          <Link href="/login" className="mt-5 inline-flex rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
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
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
            <Link href="/" className="hover:text-[#ee4d2d]">
              Trang chủ
            </Link>
            <span>›</span>
            <Link href="/finance/balance" className="hover:text-[#ee4d2d]">
              Số dư TK Shopee
            </Link>
            <span>›</span>
            <span className="font-medium text-slate-700">Tài Khoản Ngân Hàng</span>
          </div>

          <section className="rounded-md border border-slate-200 bg-white p-4 text-sm">
            <h1 className="text-2xl font-semibold leading-none text-slate-800">Tài khoản ngân hàng</h1>

            <div className="mt-4 grid gap-4 lg:grid-cols-[380px_380px]">
              <button
                type="button"
                className="flex h-[240px] flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-[#fafafa] text-slate-500 hover:bg-slate-50"
              >
                <span className="text-4xl">+</span>
                <span className="mt-2 text-lg font-medium">Thêm Tài khoản Ngân hàng</span>
              </button>

              <article className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
                <div className="h-[78px] bg-[#5f5f63] px-5 py-4 text-white">
                  <p className="text-2xl font-semibold tracking-wide">TECHCOMBANK</p>
                  <p className="mt-1 text-sm text-emerald-300">Đã kiểm tra</p>
                </div>

                <div className="px-5 py-4">
                  <p className="text-3xl tracking-[0.3em] text-slate-700">**** 7015</p>
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm tracking-[0.2em] text-slate-600">TRAN VAN TRUONG</p>
                    <span className="rounded bg-[#d8faf3] px-2 py-1 text-xs font-semibold text-[#0f766e]">MẶC ĐỊNH</span>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
