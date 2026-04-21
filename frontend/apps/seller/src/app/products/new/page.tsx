'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { useAuth } from '@/providers/AppProvider';

type ProductFormTab = 'basic' | 'description' | 'sales' | 'shipping' | 'other';

const FORM_TABS: Array<{ id: ProductFormTab; label: string }> = [
  { id: 'basic', label: 'Thông tin cơ bản' },
  { id: 'description', label: 'Mô tả' },
  { id: 'sales', label: 'Thông tin bán hàng' },
  { id: 'shipping', label: 'Vận chuyển' },
  { id: 'other', label: 'Thông tin khác' }
];

export default function NewProductPage() {
  const router = useRouter();
  const { ready, user, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<ProductFormTab>('basic');
  const [selectedRatio, setSelectedRatio] = useState<'1:1' | '3:4'>('1:1');
  const [withoutGtin, setWithoutGtin] = useState(false);

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  const tabContent = useMemo(() => {
    if (activeTab !== 'basic') {
      return (
        <section className="rounded-md border border-slate-200 bg-white p-4 text-sm">
          <h2 className="text-sm font-semibold text-slate-900">{FORM_TABS.find((tab) => tab.id === activeTab)?.label}</h2>
          <p className="mt-2 text-sm text-slate-500">Phần nội dung này đang chờ bổ sung.</p>
        </section>
      );
    }

    return (
      <>
        <section className="rounded-md border border-slate-200 bg-white p-4 text-sm">
          <h2 className="text-sm font-semibold text-slate-900">Thông tin cơ bản</h2>

          <div className="mt-4 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">* Hình ảnh sản phẩm</h3>
              <div className="mt-2 flex flex-wrap items-center gap-5">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    checked={selectedRatio === '1:1'}
                    onChange={() => {
                      setSelectedRatio('1:1');
                    }}
                  />
                  Hình ảnh tỷ lệ 1:1
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    checked={selectedRatio === '3:4'}
                    onChange={() => {
                      setSelectedRatio('3:4');
                    }}
                  />
                  Hình ảnh tỷ lệ 3:4
                </label>
                <button type="button" className="text-sm font-medium text-[#2563eb] hover:underline">
                  Xem ví dụ
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-start gap-3">
                <UploadCard label="Thêm hình ảnh" meta="(0/9)" />
                <UploadCard label="(0/1)" meta="Ảnh bìa" />
                <UploadCard label="Thêm video" meta="" />
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-900">* Tên sản phẩm</h3>
              <div className="mt-2 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-500">Tên sản phẩm + Thương hiệu + Model + Thông số kỹ thuật</div>

              <h3 className="mt-4 text-sm font-semibold text-slate-900">* Ngành hàng</h3>
              <div className="mt-2 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-500">Chọn ngành hàng ✎</div>

              <h3 className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
                GTIN
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] text-slate-400">?</span>
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <input
                  placeholder="Nhập vào"
                  className="w-full max-w-[520px] rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400"
                />
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={withoutGtin}
                    onChange={(event) => {
                      setWithoutGtin(event.target.checked);
                    }}
                  />
                  Item without GTIN
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-4 text-sm">
          <h2 className="text-sm font-semibold text-slate-900">Mô tả</h2>
          <h3 className="mt-4 text-sm font-semibold text-slate-900">* Mô tả sản phẩm</h3>
          <textarea
            placeholder="Nhập mô tả sản phẩm hoặc tải lên hình ảnh"
            className="mt-2 h-56 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 outline-none"
          />
        </section>
      </>
    );
  }, [activeTab, selectedRatio, withoutGtin]);

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

      <div className="px-3 py-3 lg:px-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <Link href="/" className="hover:text-[#ee4d2d]">
            Trang chủ
          </Link>
          <span>›</span>
          <Link href="/products/all" className="hover:text-[#ee4d2d]">
            Sản phẩm
          </Link>
          <span>›</span>
          <span className="font-medium text-slate-700">Thêm 1 sản phẩm mới</span>
        </div>

        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
          <aside className="h-fit rounded-md border border-slate-200 bg-white p-4 text-sm xl:sticky xl:top-16">
            <h3 className="text-sm font-semibold text-[#2563eb]">Gợi ý</h3>
            <h4 className="mt-3 text-sm font-semibold text-slate-900">Hình ảnh sản phẩm</h4>
            <p className="mt-2 text-sm text-slate-600">- Tham khảo hướng dẫn hình ảnh sản phẩm khi đăng bán tại đây</p>
            <p className="mt-1 text-sm text-slate-600">- Tham khảo hướng dẫn cho Shopee Mall tại đây</p>
            <p className="mt-2 text-sm text-slate-500">
              In accordance with the Shopee Terms of Service, you agree that others including Shopee may use or adapt images, videos or any other
              content provided by you.
            </p>
          </aside>

          <main className="space-y-4">
            <section className="rounded-md border border-slate-200 bg-white px-4 pb-0 pt-3 text-sm">
              <div className="flex flex-wrap items-center gap-5 border-b border-slate-200 pb-2">
                {FORM_TABS.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(tab.id);
                      }}
                      className={[
                        'border-b-[3px] pb-2 text-sm font-semibold',
                        isActive ? 'border-[#ee4d2d] text-[#ee4d2d]' : 'border-transparent text-slate-800'
                      ].join(' ')}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </section>

            {tabContent}
          </main>

          <aside className="h-fit rounded-md border border-slate-200 bg-white p-4 text-sm xl:sticky xl:top-16">
            <h3 className="text-sm font-semibold text-slate-900">Xem trước</h3>
            <p className="mt-2 text-sm text-slate-600">Chi tiết sản phẩm</p>
            <div className="mt-3 h-[460px] overflow-hidden rounded-md border border-slate-200 bg-[#f8fafc] p-3">
              <div className="h-40 rounded-md bg-slate-100" />
              <p className="mt-3 text-sm text-slate-500">0 phân loại có sẵn</p>
              <div className="mt-3 h-24 rounded-md bg-slate-100" />
              <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
                <span className="text-sm font-semibold text-slate-700">truong_am</span>
                <button className="rounded-md border border-[#f2b8aa] px-3 py-1 text-sm text-[#ee4d2d]">Xem</button>
              </div>
              <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-md">
                <button className="bg-[#14b8a6] px-3 py-2 text-sm font-semibold text-white">💬</button>
                <button className="bg-[#ee4d2d] px-3 py-2 text-sm font-semibold text-white">Mua Ngay</button>
              </div>
              <p className="mt-3 text-sm text-slate-500">Hình ảnh có tính chất tham khảo, không phải hình ảnh cuối cùng Người mua sẽ thấy.</p>
            </div>
          </aside>
        </div>
      </div>

      <footer className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] justify-center gap-3">
          <button type="button" className="rounded-md border border-slate-300 px-8 py-2 text-sm font-semibold text-slate-700">
            Hủy
          </button>
          <button type="button" className="rounded-md border border-slate-300 bg-slate-100 px-8 py-2 text-sm font-semibold text-slate-400">
            Lưu & Ẩn
          </button>
          <button type="button" className="rounded-md bg-[#f9b6a6] px-8 py-2 text-sm font-semibold text-white">
            Lưu & Hiển thị
          </button>
        </div>
      </footer>
    </div>
  );
}

function UploadCard({ label, meta }: { label: string; meta: string }) {
  return (
    <button type="button" className="flex h-32 w-32 flex-col items-center justify-center rounded-md border border-dashed border-slate-300 text-sm text-[#ee4d2d]">
      <span className="text-xl">🖼️</span>
      <span className="mt-1 text-sm font-medium">{label}</span>
      {meta ? <span className="text-xs text-slate-500">{meta}</span> : null}
    </button>
  );
}
