'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { useAuth } from '@/providers/AppProvider';

const orderTypeFilters = ['All', 'Đơn thường (0)', 'Đơn Hỏa Tốc (0)'];
const dueDateFilters = ['Tất cả trạng thái', 'Quá hạn giao hàng (0)', 'Trong vòng 24 tiếng (0)', 'Trên 24 tiếng (0)'];
const shippingUnitFilters = [
  'SPX Express (0)',
  'Giao Hàng Nhanh (0)',
  'Ninja Van (0)',
  'VNPost Nhanh (0)',
  'J&T Express (0)',
  'VNP - Hàng Cồng Kềnh (0)',
  'GHN - Hàng Cồng Kềnh (0)',
  'Đang Điều Phối DVVC (0)',
  'BEST Express (0)',
  'NJV - Hàng Cồng Kềnh (0)',
  'SPX - Hàng Cồng Kềnh (0)',
  'Tủ Nhận Hàng (0)',
  'VTP - Hàng Cồng Kềnh (0)',
  'Viettel Post (0)',
  'Điểm nhận hàng (0)',
  'Đơn vị vận chuyển khác (0)'
];

export default function BulkShippingPage() {
  const router = useRouter();
  const { ready, user, logout } = useAuth();

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
          <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
            <Link href="/" className="hover:text-[#ee4d2d]">
              Trang chủ
            </Link>
            <span>›</span>
            <span className="font-medium text-slate-700">Giao Hàng Loạt</span>
          </div>

          <h1 className="text-sm font-semibold tracking-tight text-slate-900">Giao Hàng Loạt</h1>

          <section className="mt-4 flex items-center gap-6 border-b border-slate-200 text-sm font-semibold">
            <button type="button" className="border-b-[3px] border-[#ee4d2d] pb-3 text-[#ee4d2d]">
              Chờ giao hàng
            </button>
            <button type="button" className="pb-3 text-slate-800">
              Tạo phiếu
            </button>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
            <div className="rounded-md border border-slate-200 bg-white p-5">
              <FilterRow label="Loại Đơn hàng" values={orderTypeFilters} activeValue="Đơn thường (0)" />
              <FilterRow label="Hạn giao hàng" values={dueDateFilters} activeValue="Tất cả trạng thái" />
              <FilterRow label="Đơn vị vận chuyển" values={shippingUnitFilters} activeValue="SPX Express (0)" />

              <button type="button" className="text-sm font-medium text-[#3b82f6] hover:underline">
                Mở rộng bộ lọc
              </button>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <h2 className="text-sm font-semibold text-slate-900">0 Kiện hàng</h2>

                <button
                  type="button"
                  className="rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Sắp xếp theo: Hạn gửi hàng (Xa - Gần nhất)
                </button>
              </div>

              <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
                <table className="w-full border-collapse text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Sản phẩm</th>
                      <th className="px-3 py-2">Mã đơn hàng</th>
                      <th className="px-3 py-2">Người mua</th>
                      <th className="px-3 py-2">Đơn vị vận chuyển</th>
                      <th className="px-3 py-2">Thời gian xác nhận</th>
                      <th className="px-3 py-2">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-400">
                        Chưa có đơn hàng nào trong bộ lọc hiện tại.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold leading-tight text-slate-900">Chuẩn bị đơn hàng loạt</h2>
                <p className="mt-1 text-sm text-slate-500">0 parcels selected</p>

                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <h3 className="text-sm font-semibold text-slate-900">Pickup</h3>
                  <p className="mt-2 text-sm font-medium text-slate-500">Địa chỉ lấy hàng</p>
                  <p className="mt-2 text-sm font-semibold text-slate-800">Trần Văn Trường 84384764974</p>
                  <p className="text-sm text-[#ee4d2d]">Đến Lấy Hàng</p>
                  <p className="text-sm text-slate-700">4429 Nguyễn Cửu Phú</p>
                  <p className="text-sm text-slate-700">Phường Tân Tạo</p>
                  <p className="text-sm text-slate-700">Thành phố Hồ Chí Minh</p>

                  <label className="mt-4 block text-sm font-medium text-slate-600">
                    Ngày lấy hàng
                    <select className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-orange-400">
                      <option>Select</option>
                    </select>
                  </label>

                  <button
                    type="button"
                    className="mt-3 w-full rounded-md bg-[#f9a696] px-3 py-2 text-sm font-semibold text-white hover:bg-[#f3917e]"
                  >
                    Yêu cầu đơn vị vận chuyển đến lấy hàng
                  </button>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-900">Drop off</h3>
                <p className="mt-2 text-sm text-slate-700">Bưu cục gần bạn nhất:</p>
                <p className="mt-1 text-sm text-slate-500">Xem tại đây để giao kiện hàng đến bưu cục.</p>
              </div>
            </aside>
          </section>
        </main>
      </div>
    </div>
  );
}

function FilterRow({
  label,
  values,
  activeValue
}: {
  label: string;
  values: string[];
  activeValue?: string;
}) {
  return (
    <div className="mb-5 grid gap-3 lg:grid-cols-[150px_1fr]">
      <p className="pt-1 text-sm font-medium text-slate-700">{label}</p>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => {
          const isActive = value === activeValue;

          return (
            <button
              key={value}
              type="button"
              className={[
                'rounded-full border px-4 py-2 text-xs transition md:text-sm',
                isActive ? 'border-[#ee4d2d] bg-[#fff4f1] text-[#ee4d2d]' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
              ].join(' ')}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}
