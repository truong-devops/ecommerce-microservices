'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { useAuth } from '@/providers/AppProvider';

const statusFilters = ['Tất cả (0)', 'Cần phản hồi (0)', 'Đã trả lời (0)'];
const starFilters = ['Tất cả', '5 Sao( 0 )', '4 Sao( 0 )', '3 Sao( 0 )', '2 Sao( 0 )', '1 Sao( 0 )'];

export default function CustomerCareReviewsPage() {
  const router = useRouter();
  const { ready, user, logout } = useAuth();

  const [activeStatus, setActiveStatus] = useState('Tất cả (0)');
  const [selectedStars, setSelectedStars] = useState<string[]>([...starFilters]);

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
            <span className="font-medium text-slate-700">Quản lý đánh giá</span>
          </div>

          <section className="space-y-3 text-sm">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_290px]">
              <article className="rounded-md border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h1 className="text-sm font-semibold text-slate-800">
                    Đánh Giá Shop <span className="text-lg font-semibold text-[#ee4d2d]">0.0</span><span className="text-slate-500">/5</span>
                  </h1>
                  <p className="text-sm text-slate-400">Từ 22-03-2026 đến 20-04-2026</p>
                </div>

                <div className="mt-3 rounded-md border border-slate-200">
                  <div className="grid gap-3 border-b border-slate-200 p-3 md:grid-cols-3 md:divide-x md:divide-slate-200">
                    <ScoreStat title="Tổng lượt đánh giá" value="0" trend="▼0%" />
                    <ScoreStat title="Tỷ lệ đánh giá đơn hàng" value="0%" trend="▼0%" />
                    <ScoreStat title="Tỷ lệ đánh giá tốt" value="0%" trend="▼0%" />
                  </div>

                  <div className="grid gap-3 p-3 md:grid-cols-2 md:divide-x md:divide-slate-200">
                    <ReviewActionStat title="Đánh giá tiêu cực cần phản hồi" description="Các đánh giá có 1 & 2 sao cần bạn phản hồi" />
                    <ReviewActionStat title="Đánh giá gần đây" description="Đánh giá mới được cập nhật từ lần truy cập trước" />
                  </div>
                </div>
              </article>

              <article className="rounded-md border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-slate-800">Công cụ đánh giá</h2>

                <div className="mt-3 rounded-md border border-slate-200 p-3">
                  <div className="flex items-start gap-3">
                    <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#ee4d2d] text-white">☞</div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">Xu Thưởng Đánh Giá</h3>
                      <p className="mt-1 text-sm leading-5 text-slate-500">
                        Tăng lượt đáng giá chất lượng lên <span className="text-[#ee4d2d]">+7%</span> bằng cách thưởng thêm xu cho Người mua
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button type="button" className="rounded-md border border-[#ee4d2d] px-3 py-1.5 text-sm font-semibold text-[#ee4d2d] hover:bg-[#fff5f2]">
                      Truy cập ngay
                    </button>
                  </div>
                </div>
              </article>
            </div>

            <article className="rounded-md border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-800">Danh sách đánh giá shop</h2>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-sm text-slate-500">Trạng thái</span>
                {statusFilters.map((status) => {
                  const isActive = activeStatus === status;

                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => {
                        setActiveStatus(status);
                      }}
                      className={[
                        'rounded-full border px-4 py-1.5 text-sm transition',
                        isActive ? 'border-[#ee4d2d] bg-[#fff5f2] font-semibold text-[#ee4d2d]' : 'border-slate-300 text-slate-700'
                      ].join(' ')}
                    >
                      {status}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="text-sm text-slate-500">Số sao đánh giá</span>
                {starFilters.map((star) => {
                  const checked = selectedStars.includes(star);

                  return (
                    <label key={star} className="inline-flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedStars((previous) => [...previous, star]);
                            return;
                          }

                          setSelectedStars((previous) => previous.filter((item) => item !== star));
                        }}
                        className="h-4 w-4 accent-[#ee4d2d]"
                      />
                      <span>{star}</span>
                    </label>
                  );
                })}
              </div>

              <div className="mt-3 grid gap-2 xl:grid-cols-[1fr_1fr_100px_100px]">
                <div className="flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                  <span className="mr-2 shrink-0 text-slate-500">Tìm kiếm</span>
                  <input
                    className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                    placeholder="Tên Sản Phẩm, Mã Đơn Hàng, Tên đăng nhập người mua"
                  />
                </div>

                <div className="flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                  <span className="mr-2 shrink-0 text-slate-500">Thời gian đánh giá</span>
                  <input className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder="Chọn thời gian" />
                </div>

                <button type="button" className="rounded-md border border-[#ee4d2d] px-3 py-2 text-sm font-semibold text-[#ee4d2d] hover:bg-[#fff5f2]">
                  Tìm kiếm
                </button>

                <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Đặt lại
                </button>
              </div>

              <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-sm text-slate-700">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Thông tin Sản phẩm</th>
                        <th className="px-4 py-3 text-left font-medium">Đánh giá của Người mua</th>
                        <th className="px-4 py-3 text-left font-medium">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colSpan={3} className="h-[220px] px-4 py-8 text-center">
                          <NoDataIcon />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </article>
          </section>
        </main>
      </div>
    </div>
  );
}

function ScoreStat({ title, value, trend }: { title: string; value: string; trend: string }) {
  return (
    <div className="px-2 py-1">
      <p className="text-sm text-slate-700">
        {title}
        <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-400">?</span>
      </p>
      <p className="mt-2 text-3xl font-semibold leading-none text-slate-800">{value}</p>
      <p className="mt-2 text-sm text-slate-400">
        so với 30 ngày trước <span className="ml-1 text-[#ef4444]">{trend}</span>
      </p>
    </div>
  );
}

function ReviewActionStat({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-2 py-1">
      <p className="text-sm font-semibold text-slate-700">
        {title}
        <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-400">?</span>
      </p>
      <button type="button" className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[#2563eb] hover:underline">
        <span className="text-xl leading-none text-[#ee4d2d]">0</span>
        <span>Xem ›</span>
      </button>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
    </div>
  );
}

function NoDataIcon() {
  return (
    <div className="flex flex-col items-center justify-center">
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="23" y="12" width="34" height="48" rx="4" fill="#f8fafc" stroke="#cbd5e1" />
        <path d="M30 26H50" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
        <path d="M30 34H50" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
        <path d="M30 42H45" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
        <circle cx="59" cy="22" r="3" fill="#e2e8f0" />
        <circle cx="64" cy="30" r="2" fill="#e2e8f0" />
      </svg>
      <p className="mt-2 text-sm text-slate-400">Không có dữ liệu</p>
    </div>
  );
}
