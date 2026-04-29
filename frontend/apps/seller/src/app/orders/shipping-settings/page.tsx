'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { useAuth } from '@/providers/AppProvider';

interface ShippingOption {
  id: string;
  label: string;
  codActivated?: boolean;
}

interface ShippingGroup {
  id: string;
  title: string;
  description?: string;
  options: ShippingOption[];
}

const SETTINGS_TABS = ['Tài Khoản & Bảo Mật', 'Cài đặt Vận Chuyển', 'Cài đặt Thanh Toán', 'Cài đặt Sản Phẩm', 'Cài đặt Chat', 'Cài đặt Thông Báo'];
const INNER_TABS = ['Địa Chỉ', 'Đơn vị vận chuyển', 'Chứng từ vận chuyển'];

const SHIPPING_GROUPS: ShippingGroup[] = [
  {
    id: 'express-channel',
    title: 'Hỏa Tốc',
    description: 'Phương thức vận chuyển giao đến Người mua trong thời gian sớm nhất',
    options: [{ id: 'hoa-toc', label: 'Hỏa Tốc', codActivated: true }]
  },
  {
    id: 'standard-same-day',
    title: 'Trong Ngày',
    description: 'Bật tùy chọn này để cung cấp dịch vụ giao hàng trong cùng ngày cho Người mua (lưu ý: áp dụng trong ngày làm việc).',
    options: [{ id: 'trong-ngay', label: 'Trong Ngày', codActivated: true }]
  },
  {
    id: 'standard-fast',
    title: 'Nhanh',
    description: 'Phương thức vận chuyển chuyên nghiệp, nhanh chóng và đáng tin cậy',
    options: [{ id: 'nhanh', label: 'Nhanh', codActivated: true }]
  },
  {
    id: 'self-pickup',
    title: 'Lấy hàng chủ động',
    description: 'Cho phép Người mua tự nhận đơn hàng tại địa điểm và thời gian thuận tiện',
    options: [
      { id: 'tu-nhan-hang', label: 'Tự Nhận Hàng', codActivated: true },
      { id: 'diem-nhan-hang', label: 'Điểm nhận hàng', codActivated: true }
    ]
  },
  {
    id: 'bulky',
    title: 'Hàng Cồng Kềnh',
    options: [{ id: 'hang-cong-kenh', label: 'Hàng Cồng Kềnh', codActivated: true }]
  },
  {
    id: 'add-carrier',
    title: 'Thêm đơn vị vận chuyển',
    description:
      'Lưu ý: Shopee không hỗ trợ theo dõi quá trình cho các phương thức vận chuyển không có tích hợp và cũng sẽ không chịu trách nhiệm về bất kỳ sản phẩm nào bị thiếu hoặc hư hỏng.',
    options: [{ id: 'don-vi-khac', label: 'Đơn vị vận chuyển khác', codActivated: false }]
  }
];

export default function ShippingSettingsPage() {
  const router = useRouter();
  const { ready, user, logout } = useAuth();

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    'express-channel': false,
    'standard-same-day': false,
    'standard-fast': false,
    'self-pickup': false,
    bulky: false,
    'add-carrier': false
  });

  const [enabledOptions, setEnabledOptions] = useState<Record<string, boolean>>({
    'hoa-toc': true,
    'trong-ngay': true,
    nhanh: true,
    'tu-nhan-hang': true,
    'diem-nhan-hang': true,
    'hang-cong-kenh': true,
    'don-vi-khac': false
  });

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  const groupedSections = useMemo(
    () => [
      {
        heading: 'Đơn Hỏa Tốc',
        statusText: 'Trạng thái kênh: Bật',
        actionText: 'Tạm ngừng kênh Hỏa Tốc',
        groups: SHIPPING_GROUPS.filter((group) => group.id === 'express-channel')
      },
      {
        heading: 'Đơn thường',
        groups: SHIPPING_GROUPS.filter((group) => group.id === 'standard-same-day' || group.id === 'standard-fast')
      },
      {
        heading: null,
        groups: SHIPPING_GROUPS.filter((group) => group.id === 'self-pickup' || group.id === 'bulky' || group.id === 'add-carrier')
      }
    ],
    []
  );

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
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <Link href="/" className="hover:text-[#ee4d2d]">
              Trang chủ
            </Link>
            <span>›</span>
            <span>Thiết Lập Shop</span>
            <span>›</span>
            <span className="font-medium text-slate-700">Đơn vị vận chuyển</span>
          </div>

          <section className="rounded-md border border-slate-200 bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center gap-5 border-b border-slate-200 pb-2">
              {SETTINGS_TABS.map((tab) => {
                const isActive = tab === 'Cài đặt Vận Chuyển';
                return (
                  <button
                    key={tab}
                    type="button"
                    className={[
                      'border-b-[3px] pb-2 text-sm font-semibold',
                      isActive ? 'border-[#ee4d2d] text-[#ee4d2d]' : 'border-transparent text-slate-800'
                    ].join(' ')}
                  >
                    {tab}
                  </button>
                );
              })}
              <div className="ml-auto flex items-center gap-2 text-slate-400">
                <span>‹</span>
                <span>›</span>
              </div>
            </div>

            <div className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-3">
              <div className="flex flex-wrap items-center gap-5 border-b border-slate-200 pb-2">
                {INNER_TABS.map((tab) => {
                  const isActive = tab === 'Đơn vị vận chuyển';
                  return (
                    <button
                      key={tab}
                      type="button"
                      className={[
                        'border-b-[3px] pb-2 text-sm font-semibold',
                        isActive ? 'border-[#ee4d2d] text-[#ee4d2d]' : 'border-transparent text-slate-700'
                      ].join(' ')}
                    >
                      {tab}
                    </button>
                  );
                })}
              </div>

              <p className="mt-4 text-sm text-slate-500">Các cài đặt liên quan đến đơn vị vận chuyển</p>

              <div className="mt-5 space-y-8">
                {groupedSections.map((section, sectionIndex) => (
                  <div key={`section-${sectionIndex}`}>
                    {section.heading ? (
                      <div className="mb-4 flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold text-slate-900">{section.heading}</h2>
                        {section.statusText ? (
                          <>
                            <span className="h-2 w-2 rounded-full bg-[#52c41a]" />
                            <span className="text-sm text-slate-700">{section.statusText}</span>
                          </>
                        ) : null}
                        {section.actionText ? (
                          <button
                            type="button"
                            className="rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-700"
                          >
                            {section.actionText}
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="space-y-6">
                      {section.groups.map((group) => {
                        const isCollapsed = collapsedGroups[group.id];

                        return (
                          <article key={group.id} className="border-b border-slate-200 pb-5">
                            <div className="mb-3 flex items-start justify-between gap-3">
                              <div>
                                <h3 className="text-sm font-semibold text-slate-900">{group.title}</h3>
                                {group.description ? <p className="mt-1 max-w-[860px] text-sm text-slate-500">{group.description}</p> : null}
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  setCollapsedGroups((prev) => ({
                                    ...prev,
                                    [group.id]: !prev[group.id]
                                  }));
                                }}
                                className="rounded-md border border-slate-300 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700"
                              >
                                {isCollapsed ? 'Mở rộng' : 'Thu gọn'}
                              </button>
                            </div>

                            {!isCollapsed ? (
                              <div className="space-y-3">
                                {group.options.map((option) => (
                                  <div
                                    key={option.id}
                                    className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-3"
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="text-sm font-semibold text-slate-800">{option.label}</p>
                                      {option.codActivated ? <span className="text-sm text-[#ee4d2d]">[COD đã được kích hoạt]</span> : null}
                                    </div>

                                    <div className="flex items-center gap-3">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEnabledOptions((prev) => ({
                                            ...prev,
                                            [option.id]: !prev[option.id]
                                          }));
                                        }}
                                        className={[
                                          'relative h-7 w-14 rounded-full transition',
                                          enabledOptions[option.id] ? 'bg-[#52c41a]' : 'bg-slate-300'
                                        ].join(' ')}
                                        aria-label={`toggle-${option.id}`}
                                      >
                                        <span
                                          className={[
                                            'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition',
                                            enabledOptions[option.id] ? 'right-0.5' : 'left-0.5'
                                          ].join(' ')}
                                        />
                                      </button>
                                      <span className="text-slate-500">▾</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
