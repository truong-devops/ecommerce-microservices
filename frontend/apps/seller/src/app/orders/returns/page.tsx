'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { useAuth } from '@/providers/AppProvider';

type MainTabId = 'all' | 'refund' | 'cancel' | 'failed_delivery';

interface ActionLink {
  label: string;
}

interface MainTabConfig {
  id: MainTabId;
  label: string;
  secondaryTabs: string[];
  priorityChips: string[];
  importantActions: string[];
  actionLinks: ActionLink[];
  columns: string[];
}

const MAIN_TABS: MainTabConfig[] = [
  {
    id: 'all',
    label: 'Tất cả',
    secondaryTabs: [
      'Tất cả',
      'Shopee đang xem xét',
      'Đang trả hàng cho Người bán',
      'Đã hoàn tiền cho Người mua',
      'Đã khiếu nại đến Shopee',
      'Yêu cầu thêm'
    ],
    priorityChips: ['Tất cả', 'Hết hạn sau 1 ngày', 'Hết hạn sau 2 ngày'],
    importantActions: [
      'Thương lượng với Người mua',
      'Cần cung cấp bằng chứng',
      'Giữ lại kiện hàng',
      'Kiểm tra hàng hoàn',
      'Phản hồi quyết định hoàn tiền của Shopee'
    ],
    actionLinks: [{ label: 'Tỉ lệ đơn hàng không thành công' }],
    columns: [
      'Sản phẩm',
      'Số tiền',
      'Lý do',
      'Lý do điều chỉnh bởi Shopee',
      'Phương án cho Người mua',
      'Trạng thái',
      'Vận chuyển hàng hoàn',
      'Thao tác'
    ]
  },
  {
    id: 'refund',
    label: 'Đơn Trả hàng Hoàn tiền',
    secondaryTabs: [
      'Tất cả',
      'Shopee đang xem xét',
      'Đang trả hàng cho Người bán',
      'Đã hoàn tiền cho Người mua',
      'Đã khiếu nại đến Shopee',
      'Yêu cầu thêm'
    ],
    priorityChips: ['Tất cả', 'Hết hạn sau 1 ngày', 'Hết hạn sau 2 ngày'],
    importantActions: ['Cần cung cấp bằng chứng', 'Kiểm tra hàng hoàn', 'Phản hồi quyết định hoàn tiền của Shopee'],
    actionLinks: [{ label: 'Quy trình trả hàng/hoàn tiền' }, { label: 'Tỉ lệ trả hàng/hoàn tiền' }],
    columns: [
      'Sản phẩm',
      'Số tiền',
      'Lý do',
      'Lý do điều chỉnh bởi Shopee',
      'Phương án cho Người mua',
      'Trạng thái',
      'Vận chuyển hàng hoàn',
      'Thao tác'
    ]
  },
  {
    id: 'cancel',
    label: 'Đơn Hủy',
    secondaryTabs: ['Tất cả', 'Shopee đang xem xét', 'Đã hoàn tiền cho Người mua'],
    priorityChips: ['Tất cả', 'Hết hạn sau 1 ngày', 'Hết hạn sau 2 ngày'],
    importantActions: ['Thương lượng với Người mua', 'Giữ lại kiện hàng'],
    actionLinks: [{ label: 'Tỉ lệ hủy đơn' }],
    columns: ['Sản phẩm', 'Số tiền', 'Lý do', 'Phương án cho Người mua', 'Trạng thái', 'Vận chuyển hàng hoàn', 'Thao tác']
  },
  {
    id: 'failed_delivery',
    label: 'Đơn Giao hàng không thành công',
    secondaryTabs: ['Tất cả', 'Đang trả hàng cho Người bán', 'Đã trả hàng cho Người bán', 'Trả hàng không thành công', 'Đã gửi yêu cầu khiếu nại'],
    priorityChips: ['Tất cả', 'Hết hạn sau 1 ngày', 'Hết hạn sau 2 ngày'],
    importantActions: ['Cần cung cấp bằng chứng', 'Kiểm tra hàng hoàn'],
    actionLinks: [{ label: 'Quy trình trả hàng/hoàn tiền' }],
    columns: ['Sản phẩm', 'Số tiền', 'Lý do', 'Phương án cho Người mua', 'Trạng thái', 'Vận chuyển chiều giao hàng', 'Vận chuyển hàng hoàn', 'Thao tác']
  }
];

export default function ReturnsAndCancellationsPage() {
  const router = useRouter();
  const { ready, user, logout } = useAuth();

  const [activeMainTab, setActiveMainTab] = useState<MainTabId>('all');
  const [activeSecondaryTab, setActiveSecondaryTab] = useState('Tất cả');
  const [activePriorityChip, setActivePriorityChip] = useState('Tất cả');

  const currentTab = useMemo(() => MAIN_TABS.find((tab) => tab.id === activeMainTab) ?? MAIN_TABS[0], [activeMainTab]);

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  const activateMainTab = (tabId: MainTabId) => {
    setActiveMainTab(tabId);
    setActiveSecondaryTab('Tất cả');
    setActivePriorityChip('Tất cả');
  };

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
            <span className="font-medium text-slate-700">Trả hàng/Hoàn tiền/Hủy</span>
          </div>

          <section className="rounded-md border border-slate-200 bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
              <div className="flex min-w-0 flex-1 items-end gap-5 overflow-x-auto whitespace-nowrap">
                {MAIN_TABS.map((tab) => {
                  const isActive = activeMainTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        activateMainTab(tab.id);
                      }}
                      className={[
                        'border-b-[3px] pb-2 font-semibold transition',
                        isActive ? 'border-[#ee4d2d] text-[#ee4d2d]' : 'border-transparent text-slate-800'
                      ].join(' ')}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-4 whitespace-nowrap text-[#2563eb]">
                {currentTab.actionLinks.map((actionLink, index) => (
                  <button
                    key={actionLink.label}
                    type="button"
                    className={[
                      'text-sm font-medium hover:underline',
                      index > 0 ? 'border-l border-slate-200 pl-4' : ''
                    ].join(' ')}
                  >
                    {actionLink.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-md border border-slate-200 bg-white px-3 pb-3 pt-2">
              <div className="flex items-center gap-4 overflow-x-auto border-b border-slate-200 pb-2 whitespace-nowrap">
                {currentTab.secondaryTabs.map((tab) => {
                  const isActive = activeSecondaryTab === tab;

                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => {
                        setActiveSecondaryTab(tab);
                      }}
                      className={[
                        'border-b-[3px] px-1 pb-2 text-sm transition',
                        isActive ? 'border-[#ee4d2d] font-semibold text-[#ee4d2d]' : 'border-transparent font-medium text-slate-700'
                      ].join(' ')}
                    >
                      {tab}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="mr-2 text-sm font-medium text-slate-700">Ưu tiên</p>
                  {currentTab.priorityChips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        setActivePriorityChip(chip);
                      }}
                      className={[
                        'rounded-full border px-4 py-2 text-sm transition',
                        activePriorityChip === chip
                          ? 'border-[#ee4d2d] bg-[#fff5f2] font-semibold text-[#ee4d2d]'
                          : 'border-slate-300 bg-white font-medium text-slate-700'
                      ].join(' ')}
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <p className="mr-2 text-sm font-medium uppercase text-slate-700">Hành động quan trọng</p>
                  {currentTab.importantActions.map((action) => (
                    <button
                      key={action}
                      type="button"
                      className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 border-t border-slate-200 pt-4">
                <div className="grid gap-3 xl:grid-cols-[1fr_1fr]">
                  <div className="flex min-w-0 items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                    <span className="mr-3 shrink-0 font-medium text-slate-700">Tìm yêu cầu</span>
                    <input
                      placeholder="Điền Mã yêu cầu trả hàng/ Mã đơn hàng/ Mã vận đơn"
                      className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                    />
                  </div>

                  <div className="flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                    <span className="mr-2 font-medium">Toàn bộ thao tác</span>
                    <span className="mr-3 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] text-slate-400">
                      ?
                    </span>
                    <span className="text-slate-400">Vui lòng chọn</span>
                    <span className="ml-auto text-slate-400">▾</span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button type="button" className="rounded-md border border-[#ee4d2d] px-6 py-2 text-sm font-semibold text-[#ee4d2d]">
                    Tìm kiếm
                  </button>
                  <button type="button" className="rounded-md border border-slate-300 px-6 py-2 text-sm font-semibold text-slate-700">
                    Đặt lại
                  </button>
                  <button type="button" className="text-sm font-medium text-[#2563eb] hover:underline">
                    Mở rộng ▾
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-900">0 Yêu cầu</h3>

                  <div className="flex items-center gap-2">
                    <button type="button" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
                      ⇅ Sắp xếp theo
                    </button>
                    <button type="button" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
                      Export
                    </button>
                    <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700">
                      ☰
                    </button>
                  </div>
                </div>

                <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-[1100px] w-full border-collapse text-left text-sm text-slate-700">
                      <thead className="bg-slate-50 text-sm font-medium text-slate-500">
                        <tr>
                          {currentTab.columns.map((column) => (
                            <th key={column} className="px-4 py-3 align-top font-medium">
                              <span>{column}</span>
                              {column === 'Lý do điều chỉnh bởi Shopee' ? (
                                <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-400">
                                  !
                                </span>
                              ) : null}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td colSpan={currentTab.columns.length} className="h-[240px] px-4 py-6" />
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
