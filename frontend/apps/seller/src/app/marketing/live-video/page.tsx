'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { SellerApiClientError } from '@/lib/api/client';
import {
  buildLiveWebSocketUrl,
  createLiveSession,
  endLiveSession,
  listPinnedLiveProducts,
  listSellerLiveSessions,
  pauseLiveSession,
  pinLiveProduct,
  startLiveSession,
  unpinLiveProduct
} from '@/lib/api/live';
import type { LiveProduct, LiveSession } from '@/lib/api/types';
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
const videoMainMetrics = [
  'Doanh thu',
  'Đơn hàng',
  'Tổng sản phẩm đã bán',
  'Người xem',
  'Lượt xem hiệu quả (lượt xem >3s)',
  'Thời gian xem bình quân/Video'
];
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
const DEFAULT_PLAYBACK_URL = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
const BUYER_WEB_URL = process.env.NEXT_PUBLIC_BUYER_WEB_URL ?? 'http://localhost:8888';
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
  const { ready, user, accessToken, logout } = useAuth();

  const [activeMediaTab, setActiveMediaTab] = useState<'Live' | 'Video'>('Live');
  const [activeLiveOverviewTab, setActiveLiveOverviewTab] = useState('Tổng Quan');
  const [activeVideoOverviewTab, setActiveVideoOverviewTab] = useState('Tổng Quan');
  const [activeShopScope, setActiveShopScope] = useState('Tổng quan');
  const [activeAccessTab, setActiveAccessTab] = useState('Hiệu suất');
  const [activeConversionTab, setActiveConversionTab] = useState('Hiệu suất');
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [selectedLiveSessionId, setSelectedLiveSessionId] = useState('');
  const [pinnedProducts, setPinnedProducts] = useState<LiveProduct[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveActionLoading, setLiveActionLoading] = useState(false);
  const [liveNotice, setLiveNotice] = useState('');
  const [liveError, setLiveError] = useState('');
  const [pinProductId, setPinProductId] = useState('');
  const [liveForm, setLiveForm] = useState({
    title: '',
    description: '',
    playbackUrl: DEFAULT_PLAYBACK_URL,
    thumbnailUrl: ''
  });
  const isLiveTab = activeMediaTab === 'Live';
  const activeOverviewTab = isLiveTab ? activeLiveOverviewTab : activeVideoOverviewTab;
  const overviewTabs = isLiveTab ? liveOverviewTabs : videoOverviewTabs;
  const selectedLiveSession = useMemo(
    () => liveSessions.find((session) => session.sessionId === selectedLiveSessionId) ?? liveSessions[0] ?? null,
    [liveSessions, selectedLiveSessionId]
  );

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  const loadLiveSessions = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLiveLoading(true);
    setLiveError('');
    try {
      const sessions = await listSellerLiveSessions({ accessToken, page: 1, pageSize: 20 });
      setLiveSessions(sessions);
      setSelectedLiveSessionId((current) => {
        if (current && sessions.some((session) => session.sessionId === current)) {
          return current;
        }
        return sessions[0]?.sessionId ?? '';
      });
    } catch (error) {
      setLiveError(error instanceof SellerApiClientError ? error.message : 'Không thể tải danh sách livestream.');
    } finally {
      setLiveLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (ready && user && accessToken) {
      void loadLiveSessions();
    }
  }, [accessToken, loadLiveSessions, ready, user]);

  useEffect(() => {
    if (!accessToken || !selectedLiveSession?.sessionId) {
      setPinnedProducts([]);
      return;
    }

    let cancelled = false;
    void listPinnedLiveProducts(accessToken, selectedLiveSession.sessionId)
      .then((products) => {
        if (!cancelled) {
          setPinnedProducts(products.filter((product) => product.pinStatus === 'PINNED'));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPinnedProducts([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedLiveSession?.sessionId]);

  const handleCreateLiveSession = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLiveActionLoading(true);
    setLiveError('');
    setLiveNotice('');
    try {
      if (!liveForm.title.trim()) {
        throw new Error('Vui lòng nhập tiêu đề livestream.');
      }
      if (!liveForm.playbackUrl.trim()) {
        throw new Error('Vui lòng nhập URL phát MP4/HLS để người xem có nguồn dự phòng.');
      }
      const created = await createLiveSession(accessToken, {
        title: liveForm.title.trim(),
        description: liveForm.description.trim(),
        playbackUrl: liveForm.playbackUrl.trim(),
        thumbnailUrl: liveForm.thumbnailUrl.trim() || undefined,
        defaultLanguage: 'en',
        supportedLanguages: ['en', 'vi']
      });
      setLiveSessions((current) => [created, ...current.filter((session) => session.sessionId !== created.sessionId)]);
      setSelectedLiveSessionId(created.sessionId);
      setLiveNotice('Đã tạo phiên livestream. Khi sẵn sàng, hãy bắt đầu LIVE để người xem có thể tham gia.');
    } catch (error) {
      setLiveError(error instanceof SellerApiClientError || error instanceof Error ? error.message : 'Tạo livestream thất bại.');
    } finally {
      setLiveActionLoading(false);
    }
  }, [accessToken, liveForm]);

  const handleStartLiveSession = useCallback(async () => {
    if (!accessToken || !selectedLiveSession) {
      return;
    }

    setLiveActionLoading(true);
    setLiveError('');
    setLiveNotice('');
    try {
      const updated = await startLiveSession(accessToken, selectedLiveSession.sessionId);
      setLiveSessions((current) => current.map((session) => (session.sessionId === updated.sessionId ? updated : session)));
      setLiveNotice(
        selectedLiveSession.status === 'PAUSED'
          ? 'Đã tiếp tục livestream. Người mua có thể vào lại đúng phiên này.'
          : 'Livestream đang LIVE. Mở trang người mua để theo dõi phòng live và trò chuyện.'
      );
    } catch (error) {
      setLiveError(error instanceof SellerApiClientError ? error.message : 'Bắt đầu livestream thất bại.');
    } finally {
      setLiveActionLoading(false);
    }
  }, [accessToken, selectedLiveSession]);

  const handlePauseLiveSession = useCallback(async () => {
    if (!accessToken || !selectedLiveSession) {
      return;
    }

    setLiveActionLoading(true);
    setLiveError('');
    setLiveNotice('');
    try {
      const updated = await pauseLiveSession(accessToken, selectedLiveSession.sessionId);
      setLiveSessions((current) => current.map((session) => (session.sessionId === updated.sessionId ? updated : session)));
      setLiveNotice('Đã tạm ngừng livestream. Phiên này sẽ không còn hiện trong danh sách live của người mua.');
    } catch (error) {
      setLiveError(error instanceof SellerApiClientError ? error.message : 'Tạm ngừng livestream thất bại.');
    } finally {
      setLiveActionLoading(false);
    }
  }, [accessToken, selectedLiveSession]);

  const handleEndLiveSession = useCallback(async () => {
    if (!accessToken || !selectedLiveSession) {
      return;
    }

    setLiveActionLoading(true);
    setLiveError('');
    setLiveNotice('');
    try {
      const updated = await endLiveSession(accessToken, selectedLiveSession.sessionId);
      setLiveSessions((current) => current.map((session) => (session.sessionId === updated.sessionId ? updated : session)));
      setLiveNotice('Đã kết thúc livestream.');
    } catch (error) {
      setLiveError(error instanceof SellerApiClientError ? error.message : 'Kết thúc livestream thất bại.');
    } finally {
      setLiveActionLoading(false);
    }
  }, [accessToken, selectedLiveSession]);

  const handlePinProduct = useCallback(async () => {
    if (!accessToken || !selectedLiveSession || !pinProductId.trim()) {
      return;
    }

    setLiveActionLoading(true);
    setLiveError('');
    setLiveNotice('');
    try {
      const product = await pinLiveProduct(accessToken, selectedLiveSession.sessionId, { productId: pinProductId.trim() });
      setPinnedProducts((current) => [product, ...current.filter((item) => item.productId !== product.productId)]);
      setPinProductId('');
      setLiveNotice('Đã ghim sản phẩm vào livestream.');
    } catch (error) {
      setLiveError(error instanceof SellerApiClientError ? error.message : 'Ghim sản phẩm thất bại.');
    } finally {
      setLiveActionLoading(false);
    }
  }, [accessToken, pinProductId, selectedLiveSession]);

  const handleUnpinProduct = useCallback(
    async (productId: string) => {
      if (!accessToken || !selectedLiveSession) {
        return;
      }

      setLiveActionLoading(true);
      setLiveError('');
      setLiveNotice('');
      try {
        await unpinLiveProduct(accessToken, selectedLiveSession.sessionId, productId);
        setPinnedProducts((current) => current.filter((product) => product.productId !== productId));
        setLiveNotice('Đã bỏ ghim sản phẩm.');
      } catch (error) {
        setLiveError(error instanceof SellerApiClientError ? error.message : 'Bỏ ghim sản phẩm thất bại.');
      } finally {
        setLiveActionLoading(false);
      }
    },
    [accessToken, selectedLiveSession]
  );

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
              Trong quá trình cập nhật các chỉ số bán hàng mới trên trang quản trị của bạn, dữ liệu doanh thu có thể tạm thời biến động cho đến khi
              quá trình cập nhật hoàn tất. <button className="text-[#2563eb] hover:underline">Tìm hiểu thêm</button>
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
                    <button
                      type="button"
                      onClick={() => {
                        setActiveLiveOverviewTab('Danh Sách Livestreams');
                      }}
                      className="rounded-md bg-[#ee4d2d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#db4729]"
                    >
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

            {isLiveTab ? (
              <LiveOperationsPanel
                accessToken={accessToken}
                buyerWebUrl={BUYER_WEB_URL}
                form={liveForm}
                sessions={liveSessions}
                selectedSession={selectedLiveSession}
                selectedSessionId={selectedLiveSessionId}
                pinnedProducts={pinnedProducts}
                pinProductId={pinProductId}
                loading={liveLoading}
                actionLoading={liveActionLoading}
                notice={liveNotice}
                error={liveError}
                onFormChange={setLiveForm}
                onSessionChange={setSelectedLiveSessionId}
                onCreate={handleCreateLiveSession}
                onRefresh={loadLiveSessions}
                onStart={handleStartLiveSession}
                onPause={handlePauseLiveSession}
                onEnd={handleEndLiveSession}
                onPinProductIdChange={setPinProductId}
                onPinProduct={handlePinProduct}
                onUnpinProduct={handleUnpinProduct}
              />
            ) : null}

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

interface LiveSessionFormState {
  title: string;
  description: string;
  playbackUrl: string;
  thumbnailUrl: string;
}

interface LiveOperationsPanelProps {
  accessToken: string | null;
  buyerWebUrl: string;
  form: LiveSessionFormState;
  sessions: LiveSession[];
  selectedSession: LiveSession | null;
  selectedSessionId: string;
  pinnedProducts: LiveProduct[];
  pinProductId: string;
  loading: boolean;
  actionLoading: boolean;
  notice: string;
  error: string;
  onFormChange: Dispatch<SetStateAction<LiveSessionFormState>>;
  onSessionChange: (sessionId: string) => void;
  onCreate: () => void;
  onRefresh: () => void;
  onStart: () => void;
  onPause: () => void;
  onEnd: () => void;
  onPinProductIdChange: (productId: string) => void;
  onPinProduct: () => void;
  onUnpinProduct: (productId: string) => void;
}

interface SellerViewerPeer {
  peer: RTCPeerConnection;
  negotiationId: string;
  offerResetTimer: ReturnType<typeof setTimeout> | null;
}

function LiveOperationsPanel({
  accessToken,
  buyerWebUrl,
  form,
  sessions,
  selectedSession,
  selectedSessionId,
  pinnedProducts,
  pinProductId,
  loading,
  actionLoading,
  notice,
  error,
  onFormChange,
  onSessionChange,
  onCreate,
  onRefresh,
  onStart,
  onPause,
  onEnd,
  onPinProductIdChange,
  onPinProduct,
  onUnpinProduct
}: LiveOperationsPanelProps) {
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const viewerPeersRef = useRef<Map<string, SellerViewerPeer>>(new Map());
  const signalSocketRef = useRef<WebSocket | null>(null);
  const mediaEnginePeerRef = useRef<RTCPeerConnection | null>(null);
  const clientIdRef = useRef(createClientMessageId());
  const manualRealtimeStopRef = useRef(false);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [captureMode, setCaptureMode] = useState<'camera' | 'screen' | null>(null);
  const [captureError, setCaptureError] = useState('');
  const [realtimeStatus, setRealtimeStatus] = useState<'idle' | 'connecting' | 'broadcasting' | 'connected' | 'error'>('idle');
  const [realtimeError, setRealtimeError] = useState('');
  const buyerLink = selectedSession ? `${buyerWebUrl.replace(/\/$/, '')}/live/${encodeURIComponent(selectedSession.sessionId)}` : '';
  const mediaPublish = selectedSession?.media?.publish;
  const isMediaEngineSession = selectedSession?.media?.provider === 'MEDIAMTX' && mediaPublish?.protocol === 'WHIP' && Boolean(mediaPublish.url);

  useEffect(() => {
    if (previewRef.current) {
      previewRef.current.srcObject = previewStream;
    }
  }, [previewStream]);

  const syncRealtimeStatus = useCallback(() => {
    const peers = Array.from(viewerPeersRef.current.values());
    setRealtimeStatus(peers.some((entry) => entry.peer.connectionState === 'connected') ? 'connected' : 'broadcasting');
  }, []);

  const closeViewerPeer = useCallback(
    (viewerClientId: string) => {
      const entry = viewerPeersRef.current.get(viewerClientId);
      if (!entry) {
        return;
      }
      if (entry.offerResetTimer) {
        clearTimeout(entry.offerResetTimer);
      }
      entry.peer.close();
      viewerPeersRef.current.delete(viewerClientId);
      syncRealtimeStatus();
    },
    [syncRealtimeStatus]
  );

  const closeRealtimeBroadcast = useCallback((nextStatus: 'idle' | 'connecting' = 'idle') => {
    mediaEnginePeerRef.current?.close();
    mediaEnginePeerRef.current = null;
    viewerPeersRef.current.forEach((entry) => {
      if (entry.offerResetTimer) {
        clearTimeout(entry.offerResetTimer);
      }
      entry.peer.close();
    });
    viewerPeersRef.current.clear();
    signalSocketRef.current?.close();
    signalSocketRef.current = null;
    setRealtimeStatus(nextStatus);
  }, []);

  const stopCapturePreview = useCallback(() => {
    closeRealtimeBroadcast('idle');
    setPreviewStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });
    setCaptureMode(null);
  }, [closeRealtimeBroadcast]);

  const sendSignal = useCallback((payload: Record<string, unknown>) => {
    const socket = signalSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    socket.send(JSON.stringify({ ...payload, clientId: clientIdRef.current }));
    return true;
  }, []);

  useEffect(() => {
    return () => {
      previewStream?.getTracks().forEach((track) => track.stop());
      closeRealtimeBroadcast('idle');
    };
  }, [closeRealtimeBroadcast, previewStream]);

  const createSellerPeerConnection = useCallback(
    (viewerClientId: string, negotiationId: string) => {
      closeViewerPeer(viewerClientId);
      const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

      peer.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal({
            type: 'live:webrtc:ice-candidate',
            targetClientId: viewerClientId,
            negotiationId,
            candidate: event.candidate.toJSON()
          });
        }
      };

      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') {
          setRealtimeStatus('connected');
          setRealtimeError('');
        }
        if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') {
          closeViewerPeer(viewerClientId);
          setRealtimeError('');
        }
      };

      previewStream?.getTracks().forEach((track) => {
        peer.addTrack(track, previewStream);
      });

      return peer;
    },
    [closeViewerPeer, previewStream, sendSignal]
  );

  const publishOffer = useCallback(
    async (targetClientId: string) => {
      if (!previewStream) {
        setRealtimeError('Hãy bật camera hoặc chọn màn hình trước.');
        return;
      }

      if (!targetClientId) {
        return;
      }

      const negotiationId = createClientMessageId();
      const peer = createSellerPeerConnection(targetClientId, negotiationId);
      viewerPeersRef.current.set(targetClientId, { peer, negotiationId, offerResetTimer: null });
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      sendSignal({
        type: 'live:webrtc:offer',
        targetClientId,
        negotiationId,
        sdp: { type: offer.type, sdp: offer.sdp }
      });
      const offerResetTimer = setTimeout(() => {
        const current = viewerPeersRef.current.get(targetClientId);
        if (current?.negotiationId === negotiationId && current.peer.signalingState === 'have-local-offer') {
          closeViewerPeer(targetClientId);
        }
        setRealtimeError('');
      }, 12000);
      viewerPeersRef.current.set(targetClientId, { peer, negotiationId, offerResetTimer });
      setRealtimeStatus('broadcasting');
    },
    [closeViewerPeer, createSellerPeerConnection, previewStream, sendSignal]
  );

  const startMediaEngineBroadcast = useCallback(async () => {
    if (!previewStream || !mediaPublish?.url) {
      setRealtimeError('Chưa có nguồn phát hoặc MediaMTX publish URL.');
      return;
    }

    setRealtimeStatus('connecting');
    setRealtimeError('');
    mediaEnginePeerRef.current?.close();

    const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    mediaEnginePeerRef.current = peer;
    previewStream.getTracks().forEach((track) => {
      peer.addTrack(track, previewStream);
    });
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') {
        setRealtimeStatus('connected');
        setRealtimeError('');
      }
      if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
        setRealtimeStatus('error');
        setRealtimeError('Kết nối publish đến MediaMTX bị ngắt.');
      }
    };

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await waitForIceGatheringComplete(peer);

    const localDescription = peer.localDescription;
    if (!localDescription?.sdp) {
      throw new Error('Không tạo được SDP để publish.');
    }

    setRealtimeStatus('broadcasting');
    const response = await fetch(mediaPublish.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: localDescription.sdp
    });
    if (!response.ok) {
      throw new Error(`MediaMTX từ chối publish (${response.status}).`);
    }

    const answer = await response.text();
    await peer.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answer }));
  }, [mediaPublish?.url, previewStream]);

  const startRealtimeBroadcast = useCallback(async () => {
    if (!accessToken || !selectedSession) {
      setRealtimeError('Bạn cần đăng nhập người bán và chọn phiên livestream.');
      return;
    }
    if (selectedSession.status !== 'LIVE') {
      setRealtimeError('Hãy bắt đầu LIVE trước khi phát trực tiếp.');
      return;
    }
    if (!previewStream) {
      setRealtimeError('Hãy bật camera hoặc chọn màn hình trước.');
      return;
    }

    setRealtimeError('');
    manualRealtimeStopRef.current = false;
    closeRealtimeBroadcast('connecting');

    if (isMediaEngineSession) {
      try {
        await startMediaEngineBroadcast();
      } catch (error) {
        mediaEnginePeerRef.current?.close();
        mediaEnginePeerRef.current = null;
        setRealtimeStatus('error');
        setRealtimeError(error instanceof Error ? error.message : 'Không thể publish lên MediaMTX.');
      }
      return;
    }

    const socket = new WebSocket(buildLiveWebSocketUrl(selectedSession.sessionId), ['live.v1', `access-token.${accessToken}`]);
    signalSocketRef.current = socket;

    socket.onopen = () => {
      sendSignal({ type: 'live:join' });
      sendSignal({ type: 'live:webrtc:broadcaster-ready' });
      setRealtimeStatus('broadcasting');
    };

    socket.onmessage = (event) => {
      const payload = safeParseRealtimePayload(event.data);
      if (!payload || payload.fromClientId === clientIdRef.current) {
        return;
      }

      if (payload.type === 'live:webrtc:viewer-ready') {
        const targetClientId = typeof payload.targetClientId === 'string' ? payload.targetClientId.trim() : '';
        if (targetClientId && targetClientId !== clientIdRef.current) {
          return;
        }
        const viewerClientId = typeof payload.fromClientId === 'string' ? payload.fromClientId : '';
        void publishOffer(viewerClientId).catch(() => {
          setRealtimeStatus('error');
          setRealtimeError('Không thể gửi tín hiệu phát đến người xem.');
        });
        return;
      }

      if (payload.type === 'live:webrtc:answer' && payload.sdp) {
        const targetClientId = typeof payload.targetClientId === 'string' ? payload.targetClientId.trim() : '';
        if (targetClientId && targetClientId !== clientIdRef.current) {
          return;
        }
        const viewerClientId = typeof payload.fromClientId === 'string' ? payload.fromClientId : '';
        const entry = viewerPeersRef.current.get(viewerClientId);
        if (!entry) {
          return;
        }
        if (typeof payload.negotiationId !== 'string' || payload.negotiationId !== entry.negotiationId) {
          return;
        }
        const peer = entry.peer;
        if (!peer || peer.signalingState !== 'have-local-offer') {
          return;
        }
        void peer
          .setRemoteDescription(new RTCSessionDescription(payload.sdp as RTCSessionDescriptionInit))
          .then(() => {
            if (entry.offerResetTimer) {
              clearTimeout(entry.offerResetTimer);
              entry.offerResetTimer = null;
            }
            setRealtimeError('');
          })
          .catch(() => {
            closeViewerPeer(viewerClientId);
            setRealtimeError('Không thể hoàn tất kết nối với người xem.');
          });
        return;
      }

      if (payload.type === 'live:webrtc:ice-candidate' && payload.candidate) {
        const targetClientId = typeof payload.targetClientId === 'string' ? payload.targetClientId.trim() : '';
        if (targetClientId && targetClientId !== clientIdRef.current) {
          return;
        }
        const viewerClientId = typeof payload.fromClientId === 'string' ? payload.fromClientId : '';
        const entry = viewerPeersRef.current.get(viewerClientId);
        if (!entry || (typeof payload.negotiationId === 'string' && payload.negotiationId !== entry.negotiationId)) {
          return;
        }
        void entry.peer.addIceCandidate(new RTCIceCandidate(payload.candidate as RTCIceCandidateInit)).catch(() => undefined);
      }
    };

    socket.onerror = () => {
      setRealtimeStatus('error');
      setRealtimeError('Không thể kết nối WebSocket signaling.');
    };

    socket.onclose = () => {
      if (signalSocketRef.current !== socket) {
        return;
      }
      signalSocketRef.current = null;
      viewerPeersRef.current.forEach((entry) => {
        if (entry.offerResetTimer) {
          clearTimeout(entry.offerResetTimer);
        }
        entry.peer.close();
      });
      viewerPeersRef.current.clear();
      setRealtimeStatus('idle');
      if (!manualRealtimeStopRef.current && selectedSession.status === 'LIVE') {
        setRealtimeError('Kết nối phát trực tiếp bị ngắt, hệ thống đang tự kết nối lại.');
      }
    };
  }, [accessToken, closeRealtimeBroadcast, closeViewerPeer, isMediaEngineSession, previewStream, publishOffer, selectedSession, sendSignal, startMediaEngineBroadcast]);

  useEffect(() => {
    if (selectedSession?.status === 'LIVE') {
      manualRealtimeStopRef.current = false;
    }
  }, [selectedSession?.sessionId, selectedSession?.status]);

  useEffect(() => {
    if (!selectedSession || selectedSession.status === 'LIVE' || realtimeStatus === 'idle') {
      return;
    }

    manualRealtimeStopRef.current = selectedSession.status === 'PAUSED' || selectedSession.status === 'ENDED';
    closeRealtimeBroadcast('idle');
  }, [closeRealtimeBroadcast, realtimeStatus, selectedSession]);

  useEffect(() => {
    if (manualRealtimeStopRef.current || !selectedSession || selectedSession.status !== 'LIVE' || !previewStream || realtimeStatus !== 'idle') {
      return;
    }

    void startRealtimeBroadcast();
  }, [previewStream, realtimeStatus, selectedSession, startRealtimeBroadcast]);

  const startCapturePreview = useCallback(
    async (mode: 'camera' | 'screen') => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
        setCaptureError('Trình duyệt không hỗ trợ camera/screen capture.');
        return;
      }

      setCaptureError('');
      stopCapturePreview();

      try {
        const stream =
          mode === 'camera'
            ? await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          setPreviewStream(null);
          setCaptureMode(null);
        });

        setPreviewStream(stream);
        setCaptureMode(mode);
      } catch {
        setCaptureError(mode === 'camera' ? 'Không thể mở camera/micro. Hãy kiểm tra quyền trình duyệt.' : 'Không thể chọn màn hình để chia sẻ.');
      }
    },
    [stopCapturePreview]
  );

  const streamStatusLabel = formatSellerStreamStatus(realtimeStatus);

  return (
    <section className="overflow-hidden rounded-2xl border border-[#ffd4c6] bg-gradient-to-br from-white via-white to-[#fff7f3] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-orange-100 px-4 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ee4d2d]">Livestream Center</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Quản lý phiên phát trực tiếp</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            Thiết lập nguồn phát, bắt đầu LIVE, ghim sản phẩm và theo dõi trạng thái kết nối của phòng livestream.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading || actionLoading}
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Đang tải...' : 'Làm mới'}
        </button>
      </div>

      <div className="px-4 pt-4">
        {notice ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p> : null}
        {error ? <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 rounded-2xl border border-orange-100 bg-slate-950 p-4 text-white shadow-inner">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Nguồn phát</p>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-white/60">
                  Chọn camera hoặc màn hình trước khi lên sóng. Người xem sẽ ưu tiên nguồn trực tiếp, URL MP4/HLS dùng làm nguồn dự phòng.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void startCapturePreview('camera')}
                  className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-orange-50"
                >
                  Bật camera
                </button>
                <button
                  type="button"
                  onClick={() => void startCapturePreview('screen')}
                  className="rounded-full border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                >
                  Chọn màn hình
                </button>
                <button
                  type="button"
                  onClick={stopCapturePreview}
                  disabled={!previewStream}
                  className="rounded-full border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Tắt nguồn
                </button>
                <button
                  type="button"
                  onClick={() => void startRealtimeBroadcast()}
                  disabled={!previewStream || !selectedSession || selectedSession.status !== 'LIVE'}
                  className="rounded-full bg-[#ee4d2d] px-4 py-2 text-xs font-semibold text-white hover:bg-[#db4729] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Bắt đầu phát
                </button>
                <button
                  type="button"
                  onClick={() => {
                    manualRealtimeStopRef.current = true;
                    closeRealtimeBroadcast('idle');
                    onPause();
                  }}
                  disabled={realtimeStatus === 'idle'}
                  className="rounded-full border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Tạm ngừng phát
                </button>
              </div>
            </div>

            {captureError ? (
              <p className="mt-3 rounded-xl border border-red-300/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{captureError}</p>
            ) : null}
            {realtimeError ? (
              <p className="mt-3 rounded-xl border border-red-300/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{realtimeError}</p>
            ) : null}

            <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black">
              {previewStream ? (
                <video ref={previewRef} autoPlay muted playsInline className="aspect-video w-full bg-black object-contain" />
              ) : (
                <div className="flex aspect-video items-center justify-center px-4 text-center text-sm text-white/60">
                  Chọn camera hoặc chia sẻ màn hình để chuẩn bị nguồn phát.
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/70">
              <span className="rounded-full bg-white/10 px-3 py-1">
                Nguồn:{' '}
                <span className="font-semibold text-white">
                  {captureMode ? (captureMode === 'camera' ? 'Camera + micro' : 'Màn hình') : 'Chưa chọn'}
                </span>
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1">
                Trạng thái phát: <span className="font-semibold text-white">{streamStatusLabel}</span>
              </span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Tiêu đề live
              <input
                value={form.title}
                onChange={(event) => onFormChange((current) => ({ ...current, title: event.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#ee4d2d]"
                placeholder="Ví dụ: Sale cuối tuần cùng shop"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              URL phát dự phòng MP4/HLS
              <input
                value={form.playbackUrl}
                onChange={(event) => onFormChange((current) => ({ ...current, playbackUrl: event.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#ee4d2d]"
                placeholder={DEFAULT_PLAYBACK_URL}
              />
            </label>
            <label className="text-sm font-medium text-slate-700 md:col-span-2">
              Mô tả
              <textarea
                value={form.description}
                onChange={(event) => onFormChange((current) => ({ ...current, description: event.target.value }))}
                rows={2}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#ee4d2d]"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCreate}
              disabled={actionLoading}
              className="rounded-md bg-[#ee4d2d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#db4729] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Tạo phiên live
            </button>
            <button
              type="button"
              onClick={onStart}
              disabled={!selectedSession || selectedSession.status === 'LIVE' || selectedSession.status === 'ENDED' || selectedSession.status === 'CANCELLED' || actionLoading}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {selectedSession?.status === 'PAUSED' ? 'Tiếp tục LIVE' : 'Bắt đầu LIVE'}
            </button>
            <button
              type="button"
              onClick={onPause}
              disabled={!selectedSession || selectedSession.status !== 'LIVE' || actionLoading}
              className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Tạm ngừng
            </button>
            <button
              type="button"
              onClick={onEnd}
              disabled={!selectedSession || (selectedSession.status !== 'LIVE' && selectedSession.status !== 'PAUSED') || actionLoading}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Kết thúc
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="text-sm font-medium text-slate-700">
            Phiên đang quản lý
            <select
              value={selectedSessionId}
              onChange={(event) => onSessionChange(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#ee4d2d]"
            >
              {sessions.length === 0 ? <option value="">Chưa có phiên live</option> : null}
              {sessions.map((session) => (
                <option key={session.sessionId} value={session.sessionId}>
                  {session.title} - {session.status}
                </option>
              ))}
            </select>
          </label>

          {selectedSession ? (
            <div className="mt-3 space-y-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              <p>
                <span className="font-semibold">Mã phiên:</span> {selectedSession.sessionId}
              </p>
              <p>
                <span className="font-semibold">Trạng thái:</span>{' '}
                <span className="rounded-full bg-[#ee4d2d] px-2 py-0.5 text-xs font-semibold text-white">{selectedSession.status}</span>
              </p>
              <p>
                <span className="font-semibold">Tạo lúc:</span> {formatDateTime(selectedSession.createdAt)}
              </p>
              <a
                href={buyerLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full justify-center rounded-full bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Mở trang người mua
              </a>
            </div>
          ) : (
            <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-500">Tạo phiên live đầu tiên để nhận link chia sẻ cho người mua.</p>
          )}
        </div>
      </div>

      <div className="mx-4 mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[260px] flex-1 text-sm font-medium text-slate-700">
            Sản phẩm ghim trong live
            <input
              value={pinProductId}
              onChange={(event) => onPinProductIdChange(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#ee4d2d]"
              placeholder="Nhập mã sản phẩm đang bán của shop"
            />
          </label>
          <button
            type="button"
            onClick={onPinProduct}
            disabled={!selectedSession || !pinProductId.trim() || actionLoading}
            className="rounded-md bg-[#ee4d2d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#db4729] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Pin sản phẩm
          </button>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {pinnedProducts.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500 md:col-span-2 xl:col-span-3">
              Chưa pin sản phẩm nào. Buyer vẫn xem live được, nhưng chưa có rail sản phẩm.
            </p>
          ) : (
            pinnedProducts.map((product) => (
              <div key={product.productId} className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-2">
                <Image
                  src={product.imageSnapshot || '/icon.svg'}
                  alt={product.nameSnapshot}
                  width={48}
                  height={48}
                  unoptimized
                  className="h-12 w-12 rounded-md object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-semibold text-slate-900">{product.nameSnapshot}</p>
                  <p className="text-xs text-slate-500">{product.productId}</p>
                  <p className="text-sm font-semibold text-[#ee4d2d]">{formatMoney(product.priceSnapshot, product.currencySnapshot)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onUnpinProduct(product.productId)}
                  disabled={actionLoading}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  Bỏ ghim
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function formatDateTime(value: string | undefined) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('vi-VN', { hour12: false });
}

function waitForIceGatheringComplete(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === 'complete') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      peer.removeEventListener('icegatheringstatechange', handleStateChange);
      resolve();
    }, 5000);

    function handleStateChange() {
      if (peer.iceGatheringState !== 'complete') {
        return;
      }
      window.clearTimeout(timeout);
      peer.removeEventListener('icegatheringstatechange', handleStateChange);
      resolve();
    }

    peer.addEventListener('icegatheringstatechange', handleStateChange);
  });
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: currency || 'VND' }).format(value);
  } catch {
    return `${value.toLocaleString('vi-VN')} ${currency}`;
  }
}

function formatSellerStreamStatus(status: 'idle' | 'connecting' | 'broadcasting' | 'connected' | 'error') {
  switch (status) {
    case 'connecting':
      return 'Đang chuẩn bị nguồn phát';
    case 'broadcasting':
      return 'Đang phát - 0 người xem';
    case 'connected':
      return 'Đang phát - có người xem';
    case 'error':
      return 'Nguồn phát cần khởi động lại';
    case 'idle':
    default:
      return 'Chưa phát';
  }
}

function createClientMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function safeParseRealtimePayload(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
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
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-400">
                    ?
                  </span>
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
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-400">
                    ?
                  </span>
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
        headers={[
          'No.',
          'Tên buổi livestream',
          'Bình luận',
          'Thêm vào Giỏ hàng',
          'Thời lượng theo dõi trung bình',
          'Người xem',
          'Đơn hàng',
          'Doanh số',
          'Hoạt động'
        ]}
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
          <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-400">
            ?
          </span>
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
