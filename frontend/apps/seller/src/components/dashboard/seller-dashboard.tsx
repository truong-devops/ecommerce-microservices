import type { OrderStatusSlice, SellerDashboardData, SellerDashboardKpi, SellerNewsItem } from '@/lib/api/types';

interface SellerDashboardProps {
  data: SellerDashboardData;
  rangeDays: number;
  onRangeChange: (days: number) => void;
  isRefreshing: boolean;
}

const RANGE_OPTIONS = [7, 14, 30] as const;

export function SellerDashboard({ data, rangeDays, onRangeChange, isRefreshing }: SellerDashboardProps) {
  const orderStatus = toOrderStatusMap(data.orderStatus);

  const waitingForPickup = orderStatus.pending;
  const processedOrders = orderStatus.inTransit + orderStatus.completed;
  const returnCancelled = orderStatus.cancelled;

  const revenueKpi = findKpi(data.kpis, 'revenue');
  const visitsKpi = findKpi(data.kpis, 'visits');
  const ordersKpi = findKpi(data.kpis, 'orders');
  const conversionKpi = findKpi(data.kpis, 'conversion');
  const lowStockKpi = findKpi(data.kpis, 'low-stock');

  const adsTraffic = data.trafficSources.find((item) => item.id === 'ads')?.value ?? 0;
  const totalTraffic = data.trafficSources.reduce((sum, item) => sum + item.value, 0);
  const adsRatio = totalTraffic > 0 ? (adsTraffic / totalTraffic) * 100 : 0;

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-3">
        <article className="rounded-lg border border-slate-200 bg-white px-4 py-5">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <TopKpiCell label="Chờ Lấy Hàng" value={waitingForPickup} />
            <TopKpiCell label="Đã Xử Lý" value={processedOrders} />
            <TopKpiCell label="Đơn Trả hàng/Hoàn tiền/Hủy" value={returnCancelled} />
            <TopKpiCell label="Sản Phẩm Bị Tạm Khóa" value={Math.round(lowStockKpi.value)} />
          </div>
        </article>

        <article className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-lg font-semibold leading-tight text-slate-800">Phân Tích Bán Hàng</h3>
              <p className="text-sm text-slate-400">Hôm nay {formatDateTime(data.dateRange.to)} (Dữ liệu thay đổi so với hôm qua)</p>
            </div>

            <div className="flex items-center gap-2">
              {RANGE_OPTIONS.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => onRangeChange(days)}
                  className={`rounded-md border px-2 py-1 text-xs font-semibold transition ${
                    rangeDays === days
                      ? 'border-[#ee4d2d] bg-[#fff2ec] text-[#ee4d2d]'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {days} ngày
                </button>
              ))}
              <button type="button" className="text-sm font-medium text-[#0b6bde] hover:underline">
                Xem thêm
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <SalesMetric label="Doanh số" value={formatCurrency(revenueKpi.value)} change={revenueKpi.changePercent} />
            <SalesMetric label="Lượt truy cập" value={formatNumber(Math.round(visitsKpi.value))} change={visitsKpi.changePercent} />
            <SalesMetric label="Product Clicks" value={formatNumber(totalTraffic)} change={adsRatio - 50} />
            <SalesMetric label="Đơn hàng" value={formatNumber(Math.round(ordersKpi.value))} change={ordersKpi.changePercent} />
            <SalesMetric label="Order Conversion Rate" value={`${conversionKpi.value.toFixed(2)}%`} change={conversionKpi.changePercent} />
          </div>

          {isRefreshing && <p className="mt-3 text-xs text-slate-400">Đang cập nhật dữ liệu...</p>}
        </article>

        <article className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold leading-tight text-slate-800">Dịch vụ Hiển thị Shopee</h3>
            <button type="button" className="text-sm font-medium text-[#0b6bde] hover:underline">
              Xem thêm
            </button>
          </div>

          <div className="mt-3 rounded-lg border border-slate-200 bg-[#fff8f5] p-4">
            <p className="text-base font-semibold text-slate-800">
              Tối đa hóa doanh số bán hàng của bạn với Dịch vụ Hiển thị Shopee!
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Tìm hiểu thêm về Dịch vụ hiển thị để tạo chiến dịch hiệu quả và tối ưu chi phí.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
                Traffic Ads: {formatNumber(adsTraffic)}
              </span>
              <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
                Tỷ trọng Ads: {adsRatio.toFixed(1)}%
              </span>
              <button type="button" className="rounded-md border border-[#ee4d2d] px-2.5 py-1 font-medium text-[#ee4d2d] hover:bg-[#ee4d2d] hover:text-white">
                Tìm hiểu thêm
              </button>
            </div>
          </div>
        </article>

        <div className="grid gap-3 lg:grid-cols-2">
          <article className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold leading-tight text-slate-800">Tăng đơn cùng KOL</h3>
              <button type="button" className="text-sm font-medium text-[#0b6bde] hover:underline">
                Thêm
              </button>
            </div>

            <div className="mt-3 rounded-md bg-[#fff2ef] px-4 py-3 text-sm font-medium text-slate-700">
              Chỉ thanh toán cho các đơn hàng thành công được mang đến từ KOL!
            </div>

            <div className="mt-3 rounded-md border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-700">Phát Hoa Hồng để Quảng Cáo Shop Của Bạn</p>
              <p className="mt-1 text-sm text-slate-500">
                Nguồn từ social đang đóng góp {formatNumber(data.trafficSources.find((item) => item.id === 'social')?.value ?? 0)} lượt truy cập.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Doanh thu tiềm năng:{' '}
                <span className="font-semibold text-slate-700">{formatCurrency(revenueKpi.value * 0.12)}</span>
              </p>
            </div>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold leading-tight text-slate-800">Livestream</h3>
              <button type="button" className="text-sm font-medium text-[#0b6bde] hover:underline">
                Xem thêm
              </button>
            </div>

            <div className="mt-3 rounded-md bg-[#fff4f2] p-5">
              <p className="text-lg font-semibold leading-tight text-slate-800">Bắt đầu Livestream ngay</p>
              <p className="mt-2 text-sm text-slate-700">
                Tăng tỉ lệ chuyển đổi của bạn <span className="font-semibold text-[#ee4d2d]">2x!</span>
              </p>
              <button className="mt-4 rounded-full bg-[#ee4d2d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#db4729]">
                Bắt đầu livestream
              </button>
            </div>
          </article>
        </div>
      </section>

      <aside className="space-y-3">
        <article className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-lg font-semibold leading-tight text-slate-800">Hiệu quả bán hàng</h3>
          <p className="mt-2 text-sm font-semibold text-[#0b6bde]">Xuất sắc</p>
          <p className="mt-1 text-sm text-slate-500">Tất cả chỉ số đều tốt!</p>
        </article>

        <article className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold leading-tight text-slate-800">Gợi ý Kinh Doanh</h3>
            <span className="text-sm text-slate-400">{data.insights.length} Gợi ý</span>
          </div>

          <div className="mt-3 max-h-[460px] space-y-2 overflow-y-auto pr-1">
            {data.insights.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500">
                Chưa có gợi ý mới.
              </div>
            ) : (
              data.insights.map((insight) => (
                <div key={insight} className="rounded-md border border-slate-200 p-3">
                  <p className="text-sm leading-7 text-slate-700">{insight}</p>
                  <div className="mt-2 flex justify-end">
                    <button className="rounded-md border border-[#ee4d2d] px-3 py-1 text-sm font-medium text-[#ee4d2d] hover:bg-[#ee4d2d] hover:text-white">
                      Thực hiện
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold leading-tight text-slate-800">Tin Nổi Bật</h3>
            <button className="text-sm font-medium text-[#0b6bde] hover:underline">Xem thêm</button>
          </div>

          <NewsPanel news={data.news} />
        </article>
      </aside>
    </div>
  );
}

function TopKpiCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2 py-1 text-center">
      <p className="text-xl font-semibold leading-tight text-[#0b6bde]">{formatNumber(value)}</p>
      <p className="mt-1 text-sm text-slate-600">{label}</p>
    </div>
  );
}

function SalesMetric({ label, value, change }: { label: string; value: string; change: number }) {
  const formattedChange = `${change >= 0 ? '+' : '-'} ${Math.abs(change).toFixed(2)}%`;

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold leading-tight text-slate-800">{value}</p>
      <p className="mt-1 text-sm font-medium text-slate-500">{formattedChange}</p>
    </div>
  );
}

function NewsPanel({ news }: { news: SellerNewsItem[] }) {
  const first = news[0];

  if (!first) {
    return <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">Chưa có tin mới.</div>;
  }

  return (
    <div className="overflow-hidden rounded-md border border-slate-200">
      <div className="bg-gradient-to-r from-[#ff8d46] via-[#ff6a3b] to-[#ee4d2d] p-4 text-white">
        <p className="line-clamp-2 text-sm font-semibold leading-tight">{first.title}</p>
        <p className="mt-1 line-clamp-2 text-sm text-white/90">{first.content}</p>
      </div>
      <div className="bg-white px-4 py-2 text-xs uppercase tracking-wide text-slate-400">{first.category}</div>
    </div>
  );
}

function toOrderStatusMap(status: OrderStatusSlice[]) {
  return {
    pending: status.find(i => i.id === 'pending')?.value ?? 0,
    inTransit: status.find(i => i.id === 'in_transit')?.value ?? 0,
    completed: status.find(i => i.id === 'completed')?.value ?? 0,
    cancelled: status.find(i => i.id === 'cancelled')?.value ?? 0,
  };
}

function findKpi(kpis: SellerDashboardKpi[], id: string): SellerDashboardKpi {
  return kpis.find((item) => item.id === id) ?? {
    id,
    label: id,
    value: 0,
    metricType: 'number',
    changePercent: 0,
    trend: 'flat',
    sparkline: [0, 0, 0, 0, 0, 0, 0],
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
    timeZoneName: 'short',
  }).format(date);
}