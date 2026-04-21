'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { useAuth } from '@/providers/AppProvider';

const liveOverviewTabs = ['Tổng Quan', 'Xu hướng', 'Tổng Quan Người Dùng', 'Danh Sách Livestreams', 'Phân tích', 'Danh Sách Sản Phẩm'];
const videoOverviewTabs = ['Tổng Quan', 'Xu hướng', 'Tổng Quan Người Dùng', 'Danh sách Video', 'Danh Sách Sản Phẩm'];
const shopScopeTabs = ['Tổng quan', 'Cửa hàng của tôi', 'Các cửa hàng khác'];
const accessTabs = ['Hiệu suất', 'Nguồn Truy Cập'];
const conversionTabs = ['Hiệu suất', 'Phễu Chuyển Đổi'];

const accessMetrics = [
  'Số phiên Livestream',
  'Tổng thời lượng Livestream',
  'Thời lượng trung bình mỗi phiên Livestream',
  'Người xem',
  'Số người xem tương tác',
  'Tổng lượt xem',
  'PCU',
  'Thời lượng xem bình quân'
];

const conversionMetrics = ['CTR', 'Người mua', 'Tỷ lệ chuyển đổi từ Click thành đơn hàng', 'Tổng lượt Thêm vào Giỏ hàng', 'GPM'];
const engagementMetrics = ['Lượt thích', 'Lượt Chia sẻ', 'Tổng số Bình luận', 'Người theo dõi mới từ Livestream'];
const promotionMetrics = ['Mã giảm giá toàn Shop đã lưu', 'Mã giảm giá độc quyền Livestream đã lưu', 'Số lượng xu đã được lấy'];
const analysisFlow = ['Vào Phòng Livestream', 'Xem Live', 'Sự Tương Tác', 'Nhấp vào sản phẩm', 'Mua Sản Phẩm'];
const analysisMetrics = ['Tổng giờ Livestream', 'Lượt xem mỗi giờ', 'Thời lượng xem trung bình', 'Bình luận mỗi giờ', 'CTR', 'Tỉ lệ CTO'];
const videoMainMetrics = ['Doanh thu', 'Đơn hàng', 'Tổng sản phẩm đã bán', 'Người xem', 'Lượt xem hiệu quả (lượt xem >3s)', 'Thời gian xem bình quân/Video'];
const videoConversionMetrics = [
  'Người mua',
  'Tổng lượt Thêm vào Giỏ hàng',
  'CTR',
  'Tỷ lệ chuyển đổi từ Click thành đơn hàng',
  'Giá trị đơn hàng trung bình',
  'GPM',
  'Video có sản phẩm',
  'Doanh số từ Video'
];
const videoEngagementMetrics = ['Lượt Xem', 'Lượt Thích', 'Lượt Chia sẻ', 'Tổng số Bình luận', 'Người theo dõi mới từ Video'];
const trendGroups = [
  {
    title: 'Số liệu chính:',
    items: [
      { label: 'Doanh thu', checked: true },
      { label: 'Đơn hàng', checked: true },
      { label: 'Tổng sản phẩm đã bán', checked: true },
      { label: 'Người xem' },
      { label: 'Số người xem tương tác' },
      { label: 'Thời lượng xem bình quân' }
    ]
  },
  {
    title: 'Tỷ lệ chuyển đổi:',
    items: [
      { label: 'Người mua' },
      { label: 'Tổng lượt Thêm vào Giỏ hàng' },
      { label: 'CTR' },
      { label: 'Tỷ lệ chuyển đổi từ Click thành đơn hàng' },
      { label: 'Giá trị đơn hàng trung bình' },
      { label: 'GPM' }
    ]
  },
  {
    title: 'Tương tác:',
    items: [
      { label: 'Tổng lượt xem' },
      { label: 'PCU' },
      { label: 'Lượt thích' },
      { label: 'Lượt Chia sẻ' },
      { label: 'Tổng số Bình luận' },
      { label: 'Người theo dõi mới từ Livestream' }
    ]
  },
  {
    title: 'Khuyến mãi:',
    items: [{ label: 'Mã giảm giá toàn Shop đã lưu' }, { label: 'Mã giảm giá độc quyền Livestream đã lưu' }, { label: 'Số lượng xu đã được lấy' }]
  }
];
const videoTrendGroups = [
  {
    title: 'Số liệu chính:',
    items: [
      { label: 'Doanh thu', checked: true },
      { label: 'Đơn hàng', checked: true },
      { label: 'Tổng sản phẩm đã bán', checked: true },
      { label: 'Người xem' },
      { label: 'Lượt xem hiệu quả (lượt xem >3s)' },
      { label: 'Thời gian xem bình quân/Video' }
    ]
  },
  {
    title: 'Tỷ lệ chuyển đổi:',
    items: [
      { label: 'Người mua' },
      { label: 'Tổng lượt Thêm vào Giỏ hàng' },
      { label: 'CTR' },
      { label: 'Tỷ lệ chuyển đổi từ Click thành đơn hàng' },
      { label: 'Giá trị đơn hàng trung bình' },
      { label: 'GPM' },
      { label: 'Video có sản phẩm' },
      { label: 'Doanh số từ Video' }
    ]
  },
  {
    title: 'Tương tác:',
    items: [
      { label: 'Lượt Xem' },
      { label: 'Lượt Thích' },
      { label: 'Lượt Chia sẻ' },
      { label: 'Tổng số Bình luận' },
      { label: 'Người theo dõi mới từ Video' }
    ]
  }
];

export default function LiveVideoPage() {
  const router = useRouter();
  const { ready, user, logout } = useAuth();

  const [activeMediaTab, setActiveMediaTab] = useState<'Live' | 'Video'>('Live');
  const [activeLiveOverviewTab, setActiveLiveOverviewTab] = useState('Tổng Quan');
  const [activeVideoOverviewTab, setActiveVideoOverviewTab] = useState('Tổng Quan');
  const [activeShopScope, setActiveShopScope] = useState('Tổng quan');
  const [activeAccessTab, setActiveAccessTab] = useState('Hiệu suất');
  const [activeConversionTab, setActiveConversionTab] = useState('Hiệu suất');
  const isLiveTab = activeMediaTab === 'Live';
  const activeOverviewTab = isLiveTab ? activeLiveOverviewTab : activeVideoOverviewTab;
  const overviewTabs = isLiveTab ? liveOverviewTabs : videoOverviewTabs;

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
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <Link href="/" className="hover:text-[#ee4d2d]">
              Trang chủ
            </Link>
            <span>›</span>
            <span>Kênh Marketing</span>
            <span>›</span>
            <span>Live & Video</span>
            <span>›</span>
            <span className="font-medium text-slate-700">{activeMediaTab}</span>
          </div>

          <section className="space-y-3 text-sm">
            <div className="rounded-md border border-[#f7d681] bg-[#fff8e1] px-3 py-2 text-sm text-[#7a5b00]">
              Trong quá trình cập nhật các chỉ số bán hàng mới trên trang quản trị của bạn, dữ liệu doanh thu có thể tạm thời biến động cho đến khi quá
              trình cập nhật hoàn tất. <button className="text-[#2563eb] hover:underline">Tìm hiểu thêm</button>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-2">
              <div className="flex items-center gap-5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveMediaTab('Live');
                  }}
                  className={[
                    'border-b-[3px] pb-2 text-sm transition',
                    isLiveTab ? 'border-[#ee4d2d] font-semibold text-[#ee4d2d]' : 'border-transparent font-medium text-slate-700'
                  ].join(' ')}
                >
                  Live
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveMediaTab('Video');
                  }}
                  className={[
                    'border-b-[3px] pb-2 text-sm transition',
                    !isLiveTab ? 'border-[#ee4d2d] font-semibold text-[#ee4d2d]' : 'border-transparent font-medium text-slate-700'
                  ].join(' ')}
                >
                  Video
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isLiveTab ? (
                  <>
                    <button type="button" className="rounded-md border border-[#ee4d2d] px-4 py-2 text-sm font-semibold text-[#ee4d2d]">
                      Quản lý Giá chỉ có trên Live
                    </button>
                    <button type="button" className="rounded-md bg-[#ee4d2d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#db4729]">
                      ▶ Bắt đầu Livestream
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="rounded-md border border-[#ee4d2d] px-4 py-2 text-sm font-semibold text-[#ee4d2d]">
                      Quản lý video
                    </button>
                    <button type="button" className="rounded-md bg-[#ee4d2d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#db4729]">
                      ⇪ Tải video lên
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center gap-5 border-b border-slate-200 pb-2">
                {overviewTabs.map((tab) => {
                  const isActive = tab === activeOverviewTab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => {
                        if (isLiveTab) {
                          setActiveLiveOverviewTab(tab);
                        } else {
                          setActiveVideoOverviewTab(tab);
                        }
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

              {activeOverviewTab !== 'Tổng Quan Người Dùng' && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600">
                      Khung Thời Gian {getTimeLabel(activeMediaTab, activeOverviewTab)} 📅
                    </button>
                    {showOrderTypeFilter(activeMediaTab, activeOverviewTab) && (
                      <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600">
                        Loại đơn ⓘ Đơn hàng được xác nhận ▾
                      </button>
                    )}
                  </div>

                  <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                    ⇩ Tải dữ liệu
                  </button>
                </div>
              )}
            </div>

            {isLiveTab && activeOverviewTab === 'Tổng Quan' && (
              <>
                <Panel title="Giao dịch">
                  <div className="mb-3 flex justify-end">
                    <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
                      {shopScopeTabs.map((tab) => {
                        const isActive = tab === activeShopScope;
                        return (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => {
                              setActiveShopScope(tab);
                            }}
                            className={[
                              'border-r border-slate-300 px-3 py-1.5 text-sm transition last:border-r-0',
                              isActive ? 'bg-[#fff5f2] font-semibold text-[#ee4d2d]' : 'bg-white text-slate-700'
                            ].join(' ')}
                          >
                            {tab}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                    <div className="rounded-md border border-slate-200 p-3">
                      <MetricBody title="Doanh thu" />
                      <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                        <MetricBody title="Doanh số từ Khách hàng Mới" compact />
                        <MetricBody title="Doanh số từ Khách hàng Cũ" compact />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <MetricCard title="Đơn hàng" />
                      <MetricCard title="Tổng sản phẩm đã bán" />
                      <MetricCard title="Giá trị đơn hàng trung bình" />
                      <MetricCard title="Doanh số trên mỗi người mua" />
                    </div>
                  </div>
                </Panel>

                <Panel title="Truy Cập">
                  <TabLine tabs={accessTabs} activeTab={activeAccessTab} onChange={setActiveAccessTab} />
                  <MetricsGrid items={accessMetrics} columns={4} />
                </Panel>

                <Panel title="Tỷ lệ chuyển đổi">
                  <TabLine tabs={conversionTabs} activeTab={activeConversionTab} onChange={setActiveConversionTab} />
                  <MetricsGrid items={conversionMetrics} columns={4} />
                </Panel>

                <Panel title="Sự tương tác">
                  <MetricsGrid items={engagementMetrics} columns={4} />
                </Panel>

                <Panel title="Khuyến mãi">
                  <MetricsGrid items={promotionMetrics} columns={3} />
                </Panel>
              </>
            )}

            {isLiveTab && activeOverviewTab === 'Xu hướng' && <TrendTab />}

            {isLiveTab && activeOverviewTab === 'Tổng Quan Người Dùng' && <UserOverviewTab />}

            {isLiveTab && activeOverviewTab === 'Danh Sách Livestreams' && <LivestreamListTab />}

            {isLiveTab && activeOverviewTab === 'Phân tích' && <AnalysisTab />}

            {isLiveTab && activeOverviewTab === 'Danh Sách Sản Phẩm' && <ProductListTab />}

            {!isLiveTab && activeOverviewTab === 'Tổng Quan' && <VideoOverviewTab />}
            {!isLiveTab && activeOverviewTab === 'Xu hướng' && <VideoTrendTab />}
            {!isLiveTab && activeOverviewTab === 'Tổng Quan Người Dùng' && <VideoUserOverviewTab />}
            {!isLiveTab && activeOverviewTab === 'Danh sách Video' && <VideoListTab />}
            {!isLiveTab && activeOverviewTab === 'Danh Sách Sản Phẩm' && <VideoProductListTab />}
          </section>
        </main>
      </div>
    </div>
  );
}

function getTimeLabel(mediaTab: 'Live' | 'Video', overviewTab: string) {
  if (mediaTab === 'Live' && overviewTab === 'Xu hướng') return '14-04-2026 ~ 20-04-2026';
  if (mediaTab === 'Video' && overviewTab === 'Xu hướng') return '14-04-2026 ~ 20-04-2026';
  if (mediaTab === 'Live' && overviewTab === 'Danh Sách Livestreams') return 'Trực tuyến Hôm nay đến 16:30 (GMT +07)';
  return '20-04-2026';
}

function showOrderTypeFilter(mediaTab: 'Live' | 'Video', overviewTab: string) {
  if (overviewTab === 'Tổng Quan Người Dùng') return false;
  if (mediaTab === 'Video' && overviewTab === 'Danh sách Video') return false;
  return true;
}

function VideoOverviewTab() {
  return (
    <>
      <Panel title="Số liệu chính">
        <SimpleMetricsGrid items={videoMainMetrics} />
      </Panel>

      <Panel title="Tỷ lệ chuyển đổi">
        <SimpleMetricsGrid items={videoConversionMetrics} />
      </Panel>

      <Panel title="Tương tác">
        <SimpleMetricsGrid items={videoEngagementMetrics} />
      </Panel>
    </>
  );
}

function VideoTrendTab() {
  const selectedCount = videoTrendGroups.flatMap((group) => group.items).filter((item) => item.checked).length;

  return (
    <Panel title="Tổng Quan Xu Hướng">
      <div className="overflow-hidden rounded-md border border-slate-200">
        {videoTrendGroups.map((group) => (
          <div key={group.title} className="grid gap-3 border-b border-slate-200 p-3 last:border-b-0 md:grid-cols-[130px_minmax(0,1fr)]">
            <p className="text-sm font-medium text-slate-700">{group.title}</p>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {group.items.map((item) => (
                <label key={item.label} className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={Boolean(item.checked)} readOnly className="h-4 w-4 accent-[#ee4d2d]" />
                  <span>{item.label}</span>
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-400">?</span>
                </label>
              ))}
            </div>
          </div>
        ))}

        <div className="bg-slate-50 px-3 py-2 text-sm text-slate-500">
          Chỉ số đã chọn: <span className="font-semibold text-[#ee4d2d]">{selectedCount}</span>
        </div>
      </div>
    </Panel>
  );
}

function VideoUserOverviewTab() {
  const cards = ['Giới tính', 'Danh tính', 'Hoạt động', 'Tuổi'];

  return (
    <Panel title="Phân tích Người xem">
      <div className="grid gap-3 lg:grid-cols-2">
        {cards.map((title) => (
          <section key={title} className="rounded-md border border-slate-200 p-3">
            <h3 className="text-sm font-medium text-slate-700">{title}</h3>
            <div className="mt-6 flex min-h-[210px] items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50">
              <NoDataContent />
            </div>
          </section>
        ))}
      </div>
    </Panel>
  );
}

function VideoListTab() {
  return (
    <Panel title="Danh sách Video">
      <div className="mb-3 flex justify-end">
        <label className="flex w-full max-w-[340px] items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-500">
          <input
            type="text"
            placeholder="Nhập tên Video để tìm kiếm"
            className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
          <span className="pl-2 text-base">⌕</span>
        </label>
      </div>

      <DataTable
        headers={['No.', 'Tên Video', 'Lượt xem', 'Lượt thích', 'Bình luận', 'Thời lượng xem Video bình quân', 'Hoạt động']}
        minTableWidth={1200}
      />
    </Panel>
  );
}

function VideoProductListTab() {
  return (
    <Panel title="Danh Sách Sản Phẩm">
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600">
          Tên sản phẩm ▾
        </button>
        <label className="flex w-full max-w-[320px] items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-500">
          <input
            type="text"
            placeholder="Nhập tên sản phẩm hoặc SKU sản phẩm"
            className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
          <span className="pl-2 text-base">⌕</span>
        </label>
      </div>

      <DataTable headers={['Xếp hạng', 'Các sản phẩm', 'Đơn hàng', 'Doanh số', 'Người mua']} minTableWidth={1000} />
    </Panel>
  );
}

function TrendTab() {
  const selectedCount = trendGroups.flatMap((group) => group.items).filter((item) => item.checked).length;

  return (
    <Panel title="Tổng Quan Xu Hướng">
      <div className="overflow-hidden rounded-md border border-slate-200">
        {trendGroups.map((group) => (
          <div key={group.title} className="grid gap-3 border-b border-slate-200 p-3 last:border-b-0 md:grid-cols-[130px_minmax(0,1fr)]">
            <p className="text-sm font-medium text-slate-700">{group.title}</p>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {group.items.map((item) => (
                <label key={item.label} className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={Boolean(item.checked)} readOnly className="h-4 w-4 accent-[#ee4d2d]" />
                  <span>{item.label}</span>
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-400">?</span>
                </label>
              ))}
            </div>
          </div>
        ))}

        <div className="bg-slate-50 px-3 py-2 text-sm text-slate-500">
          Chỉ số đã chọn: <span className="font-semibold text-[#ee4d2d]">{selectedCount}</span>
        </div>
      </div>
    </Panel>
  );
}

function UserOverviewTab() {
  const cards = ['Giới tính', 'Danh tính', 'Tuổi', 'Activity'];

  return (
    <Panel title="Phân tích Người xem">
      <div className="grid gap-3 lg:grid-cols-2">
        {cards.map((title) => (
          <section key={title} className="rounded-md border border-slate-200 p-3">
            <h3 className="text-sm font-medium text-slate-700">{title}</h3>
            <div className="mt-6 flex min-h-[210px] items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50">
              <NoDataContent />
            </div>
          </section>
        ))}
      </div>
    </Panel>
  );
}

function LivestreamListTab() {
  return (
    <Panel title="Danh Sách Livestreams">
      <div className="mb-3 flex justify-end">
        <label className="flex w-full max-w-[380px] items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-500">
          <input
            type="text"
            placeholder="Nhập tên buổi livestream để tìm kiếm"
            className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
          <span className="pl-2 text-base">⌕</span>
        </label>
      </div>

      <DataTable
        headers={['No.', 'Tên buổi livestream', 'Bình luận', 'Thêm vào Giỏ hàng', 'Thời lượng theo dõi trung bình', 'Người xem', 'Đơn hàng', 'Doanh số', 'Hoạt động']}
        minTableWidth={1200}
      />
    </Panel>
  );
}

function AnalysisTab() {
  return (
    <>
      <Panel title="Phân tích Livestream">
        <div className="grid gap-3 md:grid-cols-5">
          {analysisFlow.map((title, index) => (
            <div key={title} className="text-center text-sm text-slate-600">
              <div className="mb-2 flex items-center justify-center gap-2 text-slate-400">
                <span className="text-lg">◌</span>
                {index < analysisFlow.length - 1 && <span className="h-px w-12 bg-slate-300" />}
              </div>
              <p>{title}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {analysisMetrics.map((metric) => (
            <MetricCard key={metric} title={metric} />
          ))}
        </div>
      </Panel>

      <Panel title="Phân tích dữ liệu sản phẩm">
        <h3 className="text-sm font-semibold text-slate-700">
          Sản phẩm tăng trưởng tiềm năng
          <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-400">?</span>
        </h3>
        <p className="mt-1 text-sm text-slate-500">Đây là sản phẩm có tiềm năng cải thiện doanh số.</p>
        <div className="mt-4 flex min-h-[180px] items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50">
          <NoDataContent text="Livestream và bán nhiều hơn để có thêm thông tin chi tiết" />
        </div>
      </Panel>
    </>
  );
}

function ProductListTab() {
  return (
    <Panel title="Danh Sách Sản Phẩm">
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600">
          Tên sản phẩm ▾
        </button>
        <label className="flex w-full max-w-[320px] items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-500">
          <input
            type="text"
            placeholder="Nhập tên sản phẩm hoặc SKU sản phẩm"
            className="w-full border-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
          <span className="pl-2 text-base">⌕</span>
        </label>
      </div>

      <DataTable
        headers={['Xếp hạng', 'Các sản phẩm', 'Lượt click vào sản phẩm', 'Thêm vào Giỏ hàng', 'Đơn hàng', 'Sản phẩm đã bán', 'Doanh số']}
        minTableWidth={1100}
      />
    </Panel>
  );
}

function DataTable({ headers, minTableWidth }: { headers: string[]; minTableWidth: number }) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full border-collapse text-sm" style={{ minWidth: `${minTableWidth}px` }}>
        <thead className="bg-slate-50 text-left text-slate-600">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-3 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={headers.length} className="px-3 py-10">
              <NoDataContent />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function NoDataContent({ text }: { text?: string }) {
  return (
    <div className="text-center">
      <div className="mx-auto h-14 w-14 rounded-md border border-slate-300 bg-slate-100" />
      <p className="mt-2 text-sm text-slate-400">{text ?? 'Không có dữ liệu'}</p>
    </div>
  );
}

function SimpleMetricsGrid({ items }: { items: string[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <SimpleMetricCard key={item} title={item} />
      ))}
    </div>
  );
}

function SimpleMetricCard({ title }: { title: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex items-center gap-1 text-sm text-slate-700">
        <p>{title}</p>
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-400">?</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-800">-</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-3">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function TabLine({ tabs, activeTab, onChange }: { tabs: string[]; activeTab: string; onChange: (value: string) => void }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-4 border-b border-slate-200 pb-2">
      {tabs.map((tab) => {
        const isActive = tab === activeTab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => {
              onChange(tab);
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
  );
}

function MetricsGrid({ items, columns }: { items: string[]; columns: 3 | 4 }) {
  const gridClass = columns === 4 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-2 xl:grid-cols-3';

  return (
    <div className={`grid gap-3 ${gridClass}`}>
      {items.map((title) => (
        <MetricCard key={title} title={title} />
      ))}
    </div>
  );
}

function MetricCard({ title }: { title: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <MetricBody title={title} />
    </div>
  );
}

function MetricBody({ title, compact }: { title: string; compact?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-sm text-slate-700">
        <p>{title}</p>
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-400">?</span>
      </div>
      <p className={`mt-2 font-semibold text-slate-800 ${compact ? 'text-sm' : 'text-sm'}`}>-</p>
      <p className="mt-1 text-sm text-slate-400">so với 1 ngày trước -</p>
    </div>
  );
}
