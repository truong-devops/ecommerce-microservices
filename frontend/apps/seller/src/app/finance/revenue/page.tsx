'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { useAuth } from '@/providers/AppProvider';

export default function FinanceRevenuePage() {
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
            <span className="font-medium text-slate-700">Doanh thu</span>
          </div>

          <section className="space-y-3 text-sm">
            <article className="flex items-center justify-between gap-4 rounded-md border border-[#f4cdc5] bg-[#fff3ef] p-4">
              <div className="flex items-start gap-4">
                <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-md bg-[#ffe5dd] text-xl text-[#ee4d2d] lg:flex">
                  ADS
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">Bạn đang tìm kiếm cách để tăng doanh số? Hãy thử dùng Quảng cáo Shopee!</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Đừng bỏ lỡ, Quảng cáo Shopee đang giúp những người bán tăng đơn hàng hiệu quả. Bắt đầu ngay hôm nay để tăng mức độ tiếp xúc và bán hàng.
                  </p>
                </div>
              </div>

              <button type="button" className="shrink-0 rounded-md bg-[#ee4d2d] px-6 py-2 text-sm font-semibold text-white hover:bg-[#db4729]">
                Tạo quảng cáo
              </button>
            </article>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
              <article className="rounded-md border border-slate-200 bg-white p-4">
                <h3 className="text-lg font-semibold text-slate-800">Tổng Quan</h3>
                <div className="mt-3 rounded-md border border-[#4a89dc] bg-[#eaf2ff] px-3 py-2 text-sm text-slate-600">
                  Các số dưới đây chưa bao gồm điều chỉnh. Vui lòng tải xuống Báo cáo thu nhập để kiểm tra chi tiết các điều chỉnh liên quan.
                </div>

                <div className="mt-3 grid gap-3 border-b border-slate-200 pb-3 md:grid-cols-2">
                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-sm font-semibold text-slate-700">Chưa thanh toán</p>
                    <p className="mt-2 text-sm text-slate-500">Tổng cộng</p>
                    <p className="mt-1 text-3xl font-semibold leading-none text-slate-800">₫0</p>
                  </div>

                  <div className="rounded-md border border-slate-200 p-3">
                    <p className="text-sm font-semibold text-slate-700">Đã thanh toán</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm text-slate-500">
                      <div>
                        <p>Tuần này</p>
                        <p className="mt-1 text-2xl font-semibold leading-none text-slate-800">₫0</p>
                      </div>
                      <div>
                        <p>Tháng này</p>
                        <p className="mt-1 text-2xl font-semibold leading-none text-slate-800">₫0</p>
                      </div>
                      <div>
                        <p>Tổng cộng</p>
                        <p className="mt-1 text-2xl font-semibold leading-none text-slate-800">₫0</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  Tài khoản Ngân hàng của tôi: <span className="font-semibold">**** 7015</span>
                  <Link href="/finance/balance" className="float-right text-[#2563eb] hover:underline">
                    Số dư TK Shopee ›
                  </Link>
                </div>
              </article>

              <div className="space-y-3">
                <article className="rounded-md border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-lg font-semibold text-slate-800">Báo cáo thu nhập</h4>
                    <button type="button" className="text-sm font-medium text-[#2563eb] hover:underline">
                      Xem thêm ›
                    </button>
                  </div>
                  <div className="space-y-2 text-sm text-slate-600">
                    <RowDownload label="13 Th04 - 19 Th04 2026" />
                    <RowDownload label="6 Th04 - 12 Th04 2026" />
                    <RowDownload label="30 Th03 - 5 Th04 2026" />
                  </div>
                </article>

                <article className="rounded-md border border-slate-200 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-lg font-semibold text-slate-800">Hóa đơn thuế của tôi</h4>
                    <button type="button" className="text-sm font-medium text-[#2563eb] hover:underline">
                      Xem thêm ›
                    </button>
                  </div>
                  <div className="flex h-[180px] flex-col items-center justify-center text-slate-400">
                    <span className="rounded-md border border-slate-300 px-3 py-1 text-xs">INVOICE</span>
                    <p className="mt-2 text-sm">No Invoice</p>
                  </div>
                </article>
              </div>
            </div>

            <article className="rounded-md border border-slate-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-2xl font-semibold leading-none text-slate-800">Chi Tiết</h3>
                <div className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-400">
                  <span>Tìm kiếm đơn hàng</span>
                  <span>Search</span>
                </div>
              </div>

              <div className="flex items-center gap-5 border-b border-slate-200 pb-2 text-sm">
                <button type="button" className="border-b-[3px] border-transparent pb-2 text-slate-700">
                  Chưa thanh toán
                </button>
                <button type="button" className="border-b-[3px] border-[#ee4d2d] pb-2 font-semibold text-[#ee4d2d]">
                  Đã thanh toán
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700">
                  <span>CAL</span>
                  <span className="font-semibold">Tuần này:</span>
                  <span>20/04/2026 - 21/04/2026</span>
                  <span>▾</span>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" className="rounded-md border border-slate-300 px-6 py-2 text-sm font-semibold text-slate-700">
                    Xuất
                  </button>
                  <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-500">
                    LIST
                  </button>
                </div>
              </div>

              <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
                <table className="w-full border-collapse text-sm text-slate-700">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Đơn hàng</th>
                      <th className="px-4 py-3 text-left font-medium">Thanh toán đã chuyển vào</th>
                      <th className="px-4 py-3 text-left font-medium">Trạng thái</th>
                      <th className="px-4 py-3 text-left font-medium">Phương thức thanh toán</th>
                      <th className="px-4 py-3 text-left font-medium">Số tiền thanh toán</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={5} className="h-[170px] text-center text-sm text-slate-400">
                        Không có dữ liệu
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </main>
      </div>
    </div>
  );
}

function RowDownload({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
      <span>{label}</span>
      <button type="button" className="text-[#2563eb] hover:underline">
        Download
      </button>
    </div>
  );
}
