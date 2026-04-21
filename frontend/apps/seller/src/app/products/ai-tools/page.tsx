'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { useAuth } from '@/providers/AppProvider';

const aiTaskTabs = ['Cần tối ưu (0)', 'Tối ưu hóa bởi AI (0)'];

const tableHeaders = ['Sản phẩm', 'Hiệu suất', 'Nhiệm vụ nâng cao khả năng của AI', 'Thực hiện'];

export default function AiToolsPage() {
  const router = useRouter();
  const { ready, user, logout } = useAuth();
  const [activeTaskTab, setActiveTaskTab] = useState(aiTaskTabs[0]);

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
            <Link href="/products/all" className="hover:text-[#ee4d2d]">
              Sản phẩm
            </Link>
            <span>›</span>
            <span className="font-medium text-slate-700">Công cụ Tối ưu AI</span>
          </div>

          <section className="space-y-3 text-sm">
            <article className="rounded-md border border-[#f2dfd8] bg-gradient-to-r from-[#fff8f5] to-[#fffdfa] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-sm font-semibold text-slate-900">
                    ✦ Xin chào, tôi là <span className="text-[#ee4d2d]">Công cụ Tối ưu AI</span> của bạn
                  </h1>
                  <p className="mt-1 text-sm text-slate-600">Tận dụng khả năng của AI để thu hút sản phẩm</p>
                  <p className="mt-4 text-sm font-medium text-slate-800">Nâng cao khả năng của AI bằng cách làm phong phú cơ sở kiến thức</p>
                </div>

                <div className="grid min-w-[330px] gap-2 rounded-md border border-slate-200 bg-white p-3 text-sm sm:grid-cols-3">
                  <Stat title="Tối ưu hóa bởi AI" value="0 sản phẩm" />
                  <Stat title="Lượt truy cập" value="0" />
                  <Stat title="Lượt bán" value="0" />
                </div>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                <FeatureCard
                  title="Tối ưu Hình ảnh Sản phẩm"
                  description="Nâng cao hình ảnh sản phẩm với phông nền hấp dẫn"
                  badge="👍 Tất cả sản phẩm đã được Tối ưu hóa bởi AI!"
                />

                <FeatureCard
                  title="Hiển thị sản phẩm được hỗ trợ bởi AI"
                  description="Nâng cao sản phẩm với phông nền hấp dẫn"
                  badge="👍 Tất cả sản phẩm đã được Tối ưu hóa bởi AI!"
                  label="Nâng cao khả năng AI"
                />
              </div>
            </article>

            <article className="rounded-md border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
                <div className="flex items-center gap-4">
                  {aiTaskTabs.map((tab) => {
                    const isActive = activeTaskTab === tab;

                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => {
                          setActiveTaskTab(tab);
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

                <button type="button" className="text-sm font-medium text-[#2563eb] hover:underline">
                  Cài đặt ⚙
                </button>
              </div>

              <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-[860px] w-full border-collapse text-left text-sm text-slate-700">
                    <thead className="bg-slate-50 text-sm font-medium text-slate-500">
                      <tr>
                        {tableHeaders.map((header) => (
                          <th key={header} className="px-4 py-3 font-medium">
                            {header}
                            {(header === 'Hiệu suất' || header === 'Nhiệm vụ nâng cao khả năng của AI') && (
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
                        <td colSpan={tableHeaders.length} className="h-[220px] px-4 py-6 text-center">
                          <div className="mx-auto flex w-fit flex-col items-center text-slate-400">
                            <span className="text-2xl">📄</span>
                            <p className="mt-1 text-sm">No Data</p>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <p className="mt-2 text-sm text-slate-500">
                Công cụ AI: Vui lòng kiểm tra thông tin{' '}
                <button type="button" className="text-[#2563eb] hover:underline">
                  Điều khoản dịch vụ Công cụ AI của Shopee
                </button>
              </p>
            </article>
          </section>
        </main>
      </div>
    </div>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-100 bg-white px-2 py-1">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function FeatureCard({
  title,
  description,
  badge,
  label
}: {
  title: string;
  description: string;
  badge: string;
  label?: string;
}) {
  return (
    <div className="relative rounded-md border border-[#f3d2c8] bg-white/60 p-3">
      {label ? (
        <span className="absolute -top-2 right-3 rounded-sm bg-[#f59e0b] px-2 py-0.5 text-xs font-medium text-white">
          {label}
        </span>
      ) : null}

      <h3 className="text-sm font-semibold text-[#ee4d2d]">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{description}</p>

      <div className="mt-3 rounded-md bg-[#f8fafc] p-3">
        <div className="grid grid-cols-4 gap-2">
          <div className="h-16 rounded-md bg-slate-200" />
          <div className="h-16 rounded-md bg-slate-200" />
          <div className="h-16 rounded-md bg-slate-200" />
          <div className="h-16 rounded-md bg-slate-200" />
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-600">{badge}</p>
    </div>
  );
}
