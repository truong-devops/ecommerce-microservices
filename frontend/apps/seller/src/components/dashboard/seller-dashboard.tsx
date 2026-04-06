import type { HighlightModule, SellerDashboardData } from '@/lib/api/types';

interface SellerDashboardProps {
  data: SellerDashboardData;
}

export function SellerDashboard({ data }: SellerDashboardProps) {
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="space-y-3">
        <article className="rounded-md border border-slate-200 bg-white p-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <KpiCell label="Cho Lay Hang" value={data.kpis.waitingForPickup} />
            <KpiCell label="Da Xu Ly" value={data.kpis.processedOrders} />
            <KpiCell label="Don Tra hang/Hoan tien/Huy" value={data.kpis.returnOrCancelledOrders} />
            <KpiCell label="San Pham Bi Tam Khoa" value={data.kpis.lockedProducts} />
          </div>
        </article>

        <article className="rounded-md border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-slate-800 md:text-[28px]">Phan Tich Ban Hang</h3>
              <p className="text-xs text-slate-500">Hom nay {formatDateTime(data.dateRange.to)}</p>
            </div>
            <button type="button" className="text-sm font-medium text-[#0b6bde] hover:underline">
              Xem them
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
            <SalesMetric label="Doanh so" value={formatCurrency(data.salesAnalysis.revenue)} />
            <SalesMetric label="Luot truy cap" value={formatNumber(data.salesAnalysis.visits)} />
            <SalesMetric label="Product Clicks" value={formatNumber(data.salesAnalysis.clicks)} />
            <SalesMetric label="Don hang" value={formatNumber(data.salesAnalysis.orders)} />
            <SalesMetric label="Order Conversion Rate" value={`${data.salesAnalysis.conversionRate.toFixed(2)}%`} />
          </div>
        </article>

        <article className="rounded-md border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800 md:text-[28px]">Dich vu Hien thi Shopee</h3>
            <button type="button" className="text-sm font-medium text-[#0b6bde] hover:underline">
              Xem them
            </button>
          </div>

          <div className="mt-3 rounded-md border border-slate-200 bg-[#fff7f4] p-4">
            <p className="text-base font-semibold text-slate-800 md:text-2xl">Toi da hoa doanh so voi Dich vu Hien thi</p>
            <p className="mt-1 text-sm text-slate-600">{data.displayService.subtitle}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded bg-white px-3 py-1 text-slate-700">Impression: {formatNumber(data.displayService.primaryValue)}</span>
              <span className="rounded bg-white px-3 py-1 text-slate-700">CTR: {data.displayService.secondaryValue.toFixed(2)}%</span>
              <button type="button" className="rounded border border-[#ee4d2d] px-3 py-1 font-medium text-[#ee4d2d] hover:bg-[#ee4d2d] hover:text-white">
                Tim hieu them
              </button>
            </div>
          </div>
        </article>

        <div className="grid gap-3 lg:grid-cols-2">
          <FeatureCard
            title="Tang don cung KOL"
            actionLabel="Them"
            module={data.kolAffiliate}
            ctaText="Phat hoa hong de quang cao shop"
          />

          <FeatureCard
            title="Livestream"
            actionLabel="Xem them"
            module={data.livestream}
            ctaText="Bat dau livestream ngay"
          />
        </div>
      </section>

      <aside className="space-y-3">
        <article className="rounded-md border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800 md:text-2xl">Hieu qua ban hang</h3>
            <span className="text-sm font-semibold text-[#0b6bde]">Xuat sac</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Tat ca chi so deu tot.</p>

          <dl className="mt-3 space-y-2">
            <MetricRow label="Thanh toan thanh cong" value={formatNumber(data.performance.uniquePayments)} />
            <MetricRow label="Lan van chuyen" value={formatNumber(data.performance.uniqueShipments)} />
            <MetricRow label="Tien hoan" value={formatCurrency(data.performance.refundedAmount)} />
          </dl>
        </article>

        <article className="rounded-md border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800 md:text-2xl">Goi y Kinh Doanh</h3>
            <span className="text-xs text-slate-500">{data.suggestions.length} goi y</span>
          </div>

          <div className="mt-3 space-y-2">
            {data.suggestions.map((suggestion) => (
              <div key={suggestion} className="rounded-md border border-slate-200 bg-[#fff9f7] p-2">
                <p className="text-sm text-slate-700">{suggestion}</p>
                <div className="mt-2 flex justify-end">
                  <button type="button" className="rounded border border-[#ee4d2d] px-2.5 py-1 text-xs font-medium text-[#ee4d2d] hover:bg-[#ee4d2d] hover:text-white">
                    Thuc hien
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-md border border-slate-200 bg-white p-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800 md:text-2xl">Tin Noi Bat</h3>
            <button type="button" className="text-sm font-medium text-[#0b6bde] hover:underline">
              Xem them
            </button>
          </div>

          {data.news.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">Chua co tin moi.</div>
          ) : (
            <ul className="space-y-2">
              {data.news.map((news) => (
                <li key={news.id} className="rounded-md border border-slate-200 p-2">
                  <p className="line-clamp-1 text-sm font-semibold text-slate-700">{news.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{news.content}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400">{news.category}</p>
                </li>
              ))}
            </ul>
          )}
        </article>
      </aside>
    </div>
  );
}

function KpiCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-slate-200 px-3 py-2 text-center">
      <p className="text-2xl font-semibold text-[#0b6bde] md:text-[32px]">{formatNumber(value)}</p>
      <p className="mt-1 text-xs text-slate-600">{label}</p>
    </div>
  );
}

function SalesMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-800 md:text-2xl">{value}</p>
      <p className="text-xs text-slate-500">- 0,00%</p>
    </div>
  );
}

function FeatureCard({
  title,
  actionLabel,
  module,
  ctaText
}: {
  title: string;
  actionLabel: string;
  module: HighlightModule;
  ctaText: string;
}) {
  return (
    <article className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800 md:text-2xl">{title}</h3>
        <button type="button" className="text-sm font-medium text-[#0b6bde] hover:underline">
          {actionLabel}
        </button>
      </div>

      <div className="mt-3 rounded-md bg-[#fff3ef] p-3">
        <p className="text-sm text-slate-700">{ctaText}</p>
      </div>

      <div className="mt-3 space-y-1 text-sm">
        <p className="text-slate-600">Chi so chinh: {formatNumber(module.primaryValue)}</p>
        <p className="text-slate-600">
          Chi so phu: {module.unit === 'VND' ? formatCurrency(module.secondaryValue) : formatNumber(module.secondaryValue)}
          {module.unit === '%' ? '%' : ''}
        </p>
      </div>
    </article>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded border border-slate-200 px-2 py-1.5 text-sm">
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-semibold text-slate-800">{value}</dd>
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 0
  }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0
  }).format(value);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date);
}
