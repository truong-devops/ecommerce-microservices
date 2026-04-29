'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { useAuth } from '@/providers/AppProvider';

const productStatusTabs = ['Tất cả', 'Đang hoạt động (0)', 'Vi phạm (0)', 'Chờ duyệt bởi Shopee (0)', 'Chưa được đăng (0)'];
const productHealthTabs = ['Tất cả', 'Cần bổ sung hàng (0)', 'Cần Cải Thiện Nội Dung (0)'];

const tableColumns = ['Tên sản phẩm', 'Giá', 'Kho hàng', 'Hiệu suất', 'Đánh giá sản phẩm', 'Thao tác'];

export default function AllProductsPage() {
  const router = useRouter();
  const { ready, user, logout } = useAuth();

  const [activeStatusTab, setActiveStatusTab] = useState('Đang hoạt động (0)');
  const [activeHealthTab, setActiveHealthTab] = useState('Tất cả');
  const [agreed, setAgreed] = useState(true);

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

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-orange-500">eMall Seller</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Bạn chưa đăng nhập</h1>
          <p className="mt-2 text-sm text-slate-600">Đăng nhập để truy cập Seller Center.</p>

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
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
            <Link href="/" className="hover:text-[#ee4d2d]">
              Trang chủ
            </Link>
            <span>›</span>
            <span className="font-medium text-slate-700">Sản phẩm</span>
          </div>

          <section className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-sm font-semibold text-slate-900">Sản phẩm</h1>

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                  Cài đặt sản phẩm ▾
                </button>
                <button type="button" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                  Công cụ xử lý hàng loạt ▾
                </button>
                <Link
                  href="/products/new"
                  className="rounded-md bg-[#ee4d2d] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#db4729]"
                >
                  ＋ Thêm 1 sản phẩm mới
                </Link>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-5 border-b border-slate-200 pb-2">
                {productStatusTabs.map((tab) => {
                  const isActive = activeStatusTab === tab;

                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => {
                        setActiveStatusTab(tab);
                      }}
                      className={[
                        'border-b-[3px] pb-2 text-sm font-semibold transition',
                        isActive ? 'border-[#ee4d2d] text-[#ee4d2d]' : 'border-transparent text-slate-800'
                      ].join(' ')}
                    >
                      {tab}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 grid gap-3 rounded-md border border-[#f8dfd7] bg-[#fff3ee] p-3 xl:grid-cols-[1fr_640px]">
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-[#ffe8de] p-3 text-[#ee4d2d]">📈</div>
                  <p className="text-sm font-semibold text-[#ee4d2d]">
                    Bật tính năng Nạp Tiền Tự Động để hạn chế gián đoạn hiển thị do số dư tài khoản Dịch Vụ Hiển Thị đã hết và cải thiện duy trì chiến dịch.
                  </p>
                </div>

                <div className="grid gap-2 xl:grid-cols-[1fr_1fr_120px]">
                  <label className="block text-sm text-slate-600">
                    Khi gần ghi công quảng cáo…
                    <input
                      defaultValue="₫22000"
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                    />
                  </label>
                  <label className="block text-sm text-slate-600">
                    Nạp tiền
                    <input
                      defaultValue="₫50000"
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                    />
                  </label>
                  <div className="flex items-end">
                    <button type="button" className="h-10 w-full rounded-md bg-[#ee4d2d] text-sm font-semibold text-white hover:bg-[#db4729]">
                      Bật
                    </button>
                  </div>
                  <label className="col-span-full flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(event) => {
                        setAgreed(event.target.checked);
                      }}
                    />
                    <span>
                      Tôi đồng ý với <span className="text-[#2563eb]">Điều khoản và Điều kiện</span>
                    </span>
                  </label>
                </div>
              </div>

              <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-5 border-b border-slate-200 pb-2">
                  {productHealthTabs.map((tab) => {
                    const isActive = activeHealthTab === tab;

                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => {
                          setActiveHealthTab(tab);
                        }}
                        className={[
                          'border-b-[3px] pb-2 text-sm transition',
                          isActive ? 'border-[#ee4d2d] font-semibold text-[#ee4d2d]' : 'border-transparent font-medium text-slate-700'
                        ].join(' ')}
                      >
                        {tab}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_340px_340px_140px_140px_auto]">
                  <input
                    placeholder="Tìm Tên sản phẩm, SKU sản phẩm"
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400"
                  />
                  <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-500">
                    Ngành hàng ✎
                  </button>
                  <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-500">
                    Sản phẩm chủ lực ▾
                  </button>
                  <button type="button" className="rounded-md border border-[#ee4d2d] px-3 py-2 text-sm font-semibold text-[#ee4d2d]">
                    Áp dụng
                  </button>
                  <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
                    Đặt lại
                  </button>
                  <button type="button" className="text-sm font-medium text-[#2563eb] hover:underline">
                    Mở rộng ▾
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">0 Sản Phẩm</h3>
                    <span className="text-slate-300">|</span>
                    <span className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-600">Tiềm năng Dịch Vụ Hiển Thị</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
                      ⇅ Sắp xếp theo gợi ý
                    </button>
                    <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700">
                      ☰
                    </button>
                    <Link
                      href="/products/ai-tools"
                      className="rounded-md border border-[#ee4d2d] px-4 py-2 text-sm font-semibold text-[#ee4d2d] transition hover:bg-[#fff5f2]"
                    >
                      ✦ Công cụ Tối ưu AI
                    </Link>
                  </div>
                </div>

                <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-[980px] w-full border-collapse text-left text-sm text-slate-700">
                      <thead className="bg-slate-50 text-sm font-medium text-slate-500">
                        <tr>
                          <th className="px-4 py-3">☐</th>
                          {tableColumns.map((column) => (
                            <th key={column} className="px-4 py-3 font-medium">
                              {column}
                              {(column === 'Kho hàng' || column === 'Hiệu suất' || column === 'Đánh giá sản phẩm') && (
                                <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-400">
                                  ?
                                </span>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td colSpan={tableColumns.length + 1} className="h-[260px] px-4 py-6 text-center">
                            <div className="mx-auto flex w-fit flex-col items-center text-slate-400">
                              <span className="text-3xl">📦</span>
                              <p className="mt-2 text-sm">Chưa có sản phẩm nào</p>
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
