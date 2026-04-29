'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { useAuth } from '@/providers/AppProvider';

const transactionTypes = ['Doanh Thu Đơn Hàng', 'Điều chỉnh', 'Cấn trừ Số dư TK Shopee', 'Giá trị hoàn được ghi nhận', 'Rút Tiền', 'SEasy Cho Vay Người Bán'];

export default function FinanceBalancePage() {
  const router = useRouter();
  const { ready, user, logout } = useAuth();
  const [cashflow, setCashflow] = useState('Tất cả');
  const [checkedTypes, setCheckedTypes] = useState<string[]>([...transactionTypes]);

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
            <span className="font-medium text-slate-700">Số dư TK Shopee</span>
          </div>

          <section className="space-y-3 text-sm">
            <article className="rounded-md border border-slate-200 bg-white p-4">
              <h2 className="text-2xl font-semibold leading-none text-slate-800">Tổng Quan</h2>
              <div className="mt-3 grid gap-3 rounded-md border border-slate-200 p-3 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                  <p className="text-base font-semibold text-slate-700">Số dư <span className="ml-2 text-sm font-normal text-slate-400">Tự động rút tiền:Tắt</span></p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="text-4xl font-semibold leading-none text-slate-800">₫0</span>
                    <button type="button" className="rounded-md bg-[#f9b6aa] px-5 py-2 text-sm font-semibold text-white">
                      Yêu Cầu Thanh Toán
                    </button>
                  </div>
                </div>

                <div className="border-l border-slate-200 pl-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xl font-semibold leading-none text-slate-800">Tài khoản ngân hàng</h3>
                    <Link href="/finance/bank-account" className="text-sm font-medium text-[#2563eb] hover:underline">
                      Xem thêm ›
                    </Link>
                  </div>
                  <p className="text-sm text-[#2563eb]">Techcombank <span className="ml-2 rounded bg-[#d8faf3] px-2 py-0.5 text-xs text-[#0f766e]">Mặc định</span> <span className="ml-2">**** 7015</span></p>
                  <p className="text-sm text-slate-500">Đã kiểm tra</p>
                </div>
              </div>
            </article>

            <article className="rounded-md border border-slate-200 bg-white p-4">
              <h2 className="text-2xl font-semibold leading-none text-slate-800">Các giao dịch gần đây</h2>

              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="w-[170px] text-sm text-slate-700">Thời gian phát sinh giao dịch</p>
                  <button type="button" className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700">
                    <span>CAL</span>
                    <span className="font-semibold">Trong vòng tháng này:</span>
                    <span>01/04/2026 - 21/04/2026</span>
                    <span>▾</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <p className="w-[170px] text-sm text-slate-700">Dòng tiền</p>
                  <div className="inline-flex overflow-hidden rounded-md border border-[#ee4d2d] text-sm">
                    {['Tất cả', 'Tiền vào', 'Tiền ra'].map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setCashflow(item);
                        }}
                        className={[
                          'px-5 py-2',
                          cashflow === item ? 'bg-[#ee4d2d] font-semibold text-white' : 'bg-white text-[#ee4d2d]'
                        ].join(' ')}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  <p className="w-[170px] pt-1 text-sm text-slate-700">Loại giao dịch</p>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-2">
                    {transactionTypes.map((type) => {
                      const checked = checkedTypes.includes(type);
                      return (
                        <label key={type} className="inline-flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[#ee4d2d]"
                            checked={checked}
                            onChange={(event) => {
                              if (event.target.checked) {
                                setCheckedTypes((prev) => [...prev, type]);
                              } else {
                                setCheckedTypes((prev) => prev.filter((item) => item !== type));
                              }
                            }}
                          />
                          <span>{type}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button type="button" className="rounded-md border border-slate-300 px-6 py-2 text-sm font-semibold text-slate-700">
                    Thiết lập lại
                  </button>
                  <button type="button" className="rounded-md border border-[#ee4d2d] px-6 py-2 text-sm font-semibold text-[#ee4d2d]">
                    Áp dụng
                  </button>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-2xl font-semibold leading-none text-slate-800">
                  0 giao dịch <span className="text-sm font-normal text-slate-500">(Tổng số tiền: 0)</span>
                </h3>
                <div className="flex items-center gap-2">
                  <div className="flex items-center rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-400">
                    <span>Tìm kiếm đơn hàng</span>
                    <span className="ml-2">Search</span>
                  </div>
                  <button type="button" className="rounded-md border border-slate-300 px-6 py-2 text-sm font-semibold text-slate-700">
                    Xuất
                  </button>
                  <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-500">
                    LIST
                  </button>
                </div>
              </div>

              <div className="mt-5 flex h-[220px] flex-col items-center justify-center text-slate-400">
                <span className="rounded-md border border-slate-300 px-3 py-1 text-xs">DATA</span>
                <p className="mt-2 text-sm">Không có lịch sử giao dịch</p>
              </div>
            </article>
          </section>
        </main>
      </div>
    </div>
  );
}
