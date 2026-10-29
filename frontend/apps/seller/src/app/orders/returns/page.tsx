'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { SellerApiClientError } from '@/lib/api/client';
import { completeSellerReturn, decideSellerReturn, listSellerReturns } from '@/lib/api/returns';
import type { SellerReturnRequest, SellerReturnStatus } from '@/lib/api/types';
import { formatOrderCode } from '@/lib/order-codes';
import { useAuth } from '@/providers/AppProvider';

type StatusFilter = 'ALL' | SellerReturnStatus;

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'REQUESTED', label: 'Chờ phản hồi' },
  { value: 'APPROVED', label: 'Chờ khách gửi' },
  { value: 'RETURNING', label: 'Đang hoàn hàng' },
  { value: 'REFUND_PENDING', label: 'Đang hoàn tiền' },
  { value: 'REFUNDED', label: 'Đã hoàn tiền' },
  { value: 'REJECTED', label: 'Đã từ chối' },
  { value: 'CANCELLED', label: 'Người mua đã hủy' }
];

const STATUS_META: Record<SellerReturnStatus, { label: string; className: string; description: string }> = {
  REQUESTED: {
    label: 'Chờ phản hồi',
    className: 'border-[#fcdcd7] bg-[#fef6f5] text-[#ee4d2d]',
    description: 'Người mua đang chờ shop duyệt yêu cầu.'
  },
  APPROVED: {
    label: 'Chờ khách gửi',
    className: 'border-[#fed7aa] bg-[#fffaf5] text-[#c2410c]',
    description: 'Shop đã duyệt. Đang chờ người mua gửi kiện hàng hoàn.'
  },
  RETURNING: {
    label: 'Đang hoàn hàng',
    className: 'border-[#fed7aa] bg-[#fffaf5] text-[#ea580c]',
    description: 'Người mua đã gửi hàng, đang chờ shop nhận và kiểm tra.'
  },
  REFUND_PENDING: {
    label: 'Đang hoàn tiền',
    className: 'border-[#e5e7eb] bg-[#f9fafb] text-[#374151]',
    description: 'Hệ thống đang xử lý hoàn tiền vào ví người mua.'
  },
  REFUNDED: {
    label: 'Đã hoàn tiền',
    className: 'border-[#e5e7eb] bg-[#f9fafb] text-[#111827]',
    description: 'Tiền đã được hoàn vào ví eMall của người mua.'
  },
  REJECTED: {
    label: 'Đã từ chối',
    className: 'border-[#f3f4f6] bg-[#f9fafb] text-[#6b7280]',
    description: 'Shop đã từ chối yêu cầu và ghi nhận lý do.'
  },
  CANCELLED: {
    label: 'Đã hủy',
    className: 'border-[#f3f4f6] bg-[#f9fafb] text-[#9ca3af]',
    description: 'Người mua đã hủy yêu cầu trước khi shop xử lý.'
  }
};

function getStatusMeta(status?: string | null) {
  if (status && status in STATUS_META) {
    return STATUS_META[status as SellerReturnStatus];
  }
  return {
    label: status || 'Chờ xử lý',
    className: 'border-[#e5e7eb] bg-[#f9fafb] text-[#555555]',
    description: 'Yêu cầu đang được xử lý trong hệ thống.'
  };
}

const REASON_LABELS: Record<string, string> = {
  DAMAGED: 'Sản phẩm bị hư hỏng',
  WRONG_ITEM: 'Giao sai sản phẩm',
  MISSING_PARTS: 'Thiếu sản phẩm hoặc phụ kiện',
  NOT_AS_DESCRIBED: 'Không đúng mô tả',
  QUALITY_ISSUE: 'Vấn đề chất lượng',
  OTHER: 'Lý do khác'
};

export default function ReturnsPage() {
  const router = useRouter();
  const { ready, user, accessToken, logout } = useAuth();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [returns, setReturns] = useState<SellerReturnRequest[]>([]);
  const [selected, setSelected] = useState<SellerReturnRequest | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState('');

  const loadReturns = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError('');
    try {
      const result = await listSellerReturns(accessToken, {
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        search: search || undefined
      });
      const items = Array.isArray(result) ? result : Array.isArray(result?.items) ? result.items : [];
      setReturns(items);
      setSelected((current) => (current ? (items.find((item) => item.id === current.id) ?? null) : null));
    } catch (loadError) {
      setError(toErrorMessage(loadError, 'Không tải được danh sách trả hàng/hoàn tiền.'));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, search, statusFilter]);

  useEffect(() => {
    if (ready && accessToken) void loadReturns();
  }, [accessToken, loadReturns, ready]);

  const summary = useMemo(() => {
    const list = Array.isArray(returns) ? returns : [];
    return {
      total: list.length,
      awaiting: list.filter((item) => item?.status === 'REQUESTED').length,
      returning: list.filter((item) => item?.status === 'RETURNING').length,
      refunding: list.filter((item) => item?.status === 'REFUND_PENDING').length,
      refunded: list.filter((item) => item?.status === 'REFUNDED').reduce((sum, item) => sum + (item?.refundAmount || 0), 0)
    };
  }, [returns]);

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  const mutate = async (action: () => Promise<SellerReturnRequest>, successMessage: string) => {
    setIsMutating(true);
    setError('');
    try {
      const updated = await action();
      setSelected(updated);
      await loadReturns();
      window.alert(successMessage);
    } catch (mutationError) {
      setError(toErrorMessage(mutationError, 'Không thể xử lý yêu cầu.'));
    } finally {
      setIsMutating(false);
    }
  };

  const approve = (request: SellerReturnRequest) => {
    if (!accessToken || !window.confirm(`Duyệt yêu cầu ${request.returnNumber}? Người mua sẽ tiến hành hoàn hàng.`)) return;
    void mutate(() => decideSellerReturn(accessToken, request.id, 'APPROVE', 'Shop đồng ý nhận lại hàng'), 'Đã duyệt yêu cầu trả hàng.');
  };

  const reject = (request: SellerReturnRequest) => {
    if (!accessToken) return;
    const note = window.prompt('Nhập lý do từ chối để người mua biết:');
    if (note === null) return;
    if (note.trim().length < 3) {
      setError('Vui lòng nhập lý do từ chối rõ ràng.');
      return;
    }
    void mutate(() => decideSellerReturn(accessToken, request.id, 'REJECT', note), 'Đã từ chối yêu cầu trả hàng.');
  };

  const complete = (request: SellerReturnRequest) => {
    if (!accessToken || !window.confirm('Xác nhận shop đã nhận và kiểm tra hàng hoàn? Thao tác này sẽ bắt đầu hoàn tiền cho người mua.')) return;
    void mutate(
      () => completeSellerReturn(accessToken, request.id, 'Shop đã nhận lại và kiểm tra hàng'),
      'Đã xác nhận nhận hàng. Hệ thống đang hoàn tiền cho người mua.'
    );
  };

  if (!ready) return <main className="grid min-h-screen place-items-center text-sm text-slate-500">Đang kiểm tra phiên đăng nhập...</main>;

  if (!user || !accessToken) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ee4d2d]">eMall Seller Center</p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900">Phiên đăng nhập đã hết hạn</h1>
          <Link href="/login" className="mt-6 inline-flex rounded-lg bg-[#ee4d2d] px-5 py-2.5 text-sm font-semibold text-white">
            Đăng nhập lại
          </Link>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-slate-900">
      <SellerTopbar email={user.email} role={user.role} onLogout={handleLogout} />
      <div className="flex">
        <SellerSidebar />
        <main className="min-w-0 flex-1 px-4 py-5 xl:px-7">
          <div className="mx-auto max-w-[1500px]">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
                  <Link href="/" className="hover:text-[#ee4d2d]">
                    Trang chủ
                  </Link>
                  <span>›</span>
                  <span>Quản lý đơn hàng</span>
                </div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#ee4d2d]">After-sales operations</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight">Trả hàng &amp; hoàn tiền</h1>
                <p className="mt-2 text-sm text-slate-600">Phản hồi yêu cầu, xác nhận hàng hoàn và theo dõi tiền hoàn vào ví khách hàng.</p>
              </div>
              <button
                type="button"
                onClick={() => void loadReturns()}
                disabled={isLoading}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold shadow-sm hover:border-slate-400 disabled:opacity-50"
              >
                {isLoading ? 'Đang tải...' : 'Làm mới dữ liệu'}
              </button>
            </div>

            {error ? <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

            <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryCard label="Tổng yêu cầu" value={String(summary.total)} note="Theo bộ lọc hiện tại" />
              <SummaryCard label="Chờ phản hồi" value={String(summary.awaiting)} note="Cần shop xử lý" highlight={summary.awaiting > 0} />
              <SummaryCard label="Đang hoàn hàng" value={String(summary.returning)} note="Chờ nhận lại hàng" />
              <SummaryCard label="Đang hoàn tiền" value={String(summary.refunding)} note="Hệ thống đang xử lý" />
              <SummaryCard label="Đã hoàn" value={formatCurrency(summary.refunded, 'VND')} note="Tổng tiền theo bộ lọc" />
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-4">
                <div className="flex flex-wrap gap-2">
                  {STATUS_FILTERS.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setStatusFilter(filter.value)}
                      className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition ${statusFilter === filter.value ? 'border-[#ee4d2d] bg-[#fff5f2] text-[#ee4d2d]' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                <form
                  className="mt-4 flex max-w-2xl gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setSearch(searchDraft.trim());
                  }}
                >
                  <input
                    value={searchDraft}
                    onChange={(event) => setSearchDraft(event.target.value)}
                    placeholder="Tìm theo mã yêu cầu hoặc mã đơn hàng"
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-[#ee4d2d] focus:ring-2 focus:ring-orange-100"
                  />
                  <button type="submit" className="rounded-lg bg-[#ee4d2d] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#d94325]">
                    Tìm kiếm
                  </button>
                </form>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Yêu cầu / Đơn hàng</th>
                      <th className="px-5 py-3">Sản phẩm</th>
                      <th className="px-5 py-3">Lý do</th>
                      <th className="px-5 py-3">Tiền hoàn</th>
                      <th className="px-5 py-3">Trạng thái</th>
                      <th className="px-5 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isLoading ? (
                      <EmptyRow message="Đang tải yêu cầu..." />
                    ) : returns.length === 0 ? (
                      <EmptyRow message="Chưa có yêu cầu phù hợp với bộ lọc." />
                    ) : (
                      returns.map((request) => (
                        <tr key={request.id} className="align-top hover:bg-slate-50/70">
                          <td className="px-5 py-4">
                            <button type="button" onClick={() => setSelected(request)} className="font-semibold text-slate-900 hover:text-[#ee4d2d] hover:underline">
                              {request.returnNumber}
                            </button>
                            <p className="mt-1 text-xs text-slate-500">{formatOrderCode(request.orderNumber, request.orderId)}</p>
                            <p className="mt-1 text-xs text-slate-400">{formatDateTime(request.requestedAt)}</p>
                          </td>
                          <td className="max-w-[280px] px-5 py-4">
                            <p className="font-medium text-slate-800">{productSummary(request)}</p>
                            <p className="mt-1 text-xs text-slate-500">{(request.items || []).reduce((sum, item) => sum + (item?.quantity ?? 1), 0)} sản phẩm</p>
                          </td>
                          <td className="max-w-[280px] px-5 py-4">
                            <p className="font-medium">{REASON_LABELS[request.reasonCode] ?? request.reasonCode}</p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{request.reasonDetail}</p>
                          </td>
                          <td className="px-5 py-4 font-semibold text-slate-900">{formatCurrency(request.refundAmount, request.currency)}</td>
                          <td className="px-5 py-4">
                            <StatusBadge status={request.status} />
                          </td>
                          <td className="px-5 py-4 text-right">
                            <RowActions
                              request={request}
                              disabled={isMutating}
                              onView={setSelected}
                              onApprove={approve}
                              onReject={reject}
                              onComplete={complete}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </main>
      </div>
      {selected ? (
        <ReturnDetail
          request={selected}
          disabled={isMutating}
          onClose={() => setSelected(null)}
          onApprove={approve}
          onReject={reject}
          onComplete={complete}
        />
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  note,
  highlight = false
}: {
  label: string;
  value: string;
  note: string;
  highlight?: boolean;
}) {
  return (
    <article className={`rounded-xl border p-4 shadow-sm transition-all ${highlight ? 'border-[#fcdcd7] bg-[#fef6f5]' : 'border-slate-200 bg-white'}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${highlight ? 'text-[#ee4d2d]' : 'text-slate-900'}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </article>
  );
}

function StatusBadge({ status }: { status?: SellerReturnStatus | string | null }) {
  const meta = getStatusMeta(status);
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.className}`}>{meta.label}</span>;
}

function RowActions({
  request,
  disabled,
  onView,
  onApprove,
  onReject,
  onComplete,
  showView = true
}: {
  request: SellerReturnRequest;
  disabled: boolean;
  onView: (request: SellerReturnRequest) => void;
  onApprove: (request: SellerReturnRequest) => void;
  onReject: (request: SellerReturnRequest) => void;
  onComplete: (request: SellerReturnRequest) => void;
  showView?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2">
      {showView ? (
        <button
          type="button"
          onClick={() => onView(request)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50"
        >
          Chi tiết
        </button>
      ) : null}
      {request.status === 'REQUESTED' ? (
        <>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onReject(request)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Từ chối
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onApprove(request)}
            className="rounded-md bg-[#ee4d2d] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d73211] disabled:opacity-50"
          >
            Duyệt
          </button>
        </>
      ) : null}
      {request.status === 'RETURNING' ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onComplete(request)}
          className="rounded-md bg-[#ee4d2d] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d73211] disabled:opacity-50"
        >
          Đã nhận hàng
        </button>
      ) : null}
    </div>
  );
}

function ReturnDetail({
  request,
  disabled,
  onClose,
  onApprove,
  onReject,
  onComplete
}: {
  request: SellerReturnRequest;
  disabled: boolean;
  onClose: () => void;
  onApprove: (request: SellerReturnRequest) => void;
  onReject: (request: SellerReturnRequest) => void;
  onComplete: (request: SellerReturnRequest) => void;
}) {
  const meta = getStatusMeta(request?.status);
  const items = Array.isArray(request?.items) ? request.items : [];
  const evidenceUrls = Array.isArray(request?.evidenceUrls) ? request.evidenceUrls : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" role="dialog" aria-modal="true" aria-label="Chi tiết yêu cầu trả hàng">
      <button type="button" aria-label="Đóng" className="min-w-0 flex-1" onClick={onClose} />
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#ee4d2d]">Return request</p>
            <h2 className="mt-1 text-2xl font-semibold">{request.returnNumber}</h2>
            <p className="mt-1 text-sm text-slate-500">Đơn {formatOrderCode(request.orderNumber, request.orderId)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50">
            Đóng
          </button>
        </div>
        <div className="space-y-5 p-6">
          <section className={`rounded-xl border p-4 ${meta.className}`}>
            <StatusBadge status={request.status} />
            <p className="mt-2 text-sm leading-6">{meta.description}</p>
          </section>
          <section className="grid grid-cols-2 gap-3">
            <Info label="Tiền hoàn" value={formatCurrency(request.refundAmount, request.currency)} />
            <Info label="Ngày yêu cầu" value={formatDateTime(request.requestedAt)} />
          </section>
          {request.returnTrackingNumber || request.returnAwb ? (
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vận đơn hoàn Nexus</p>
              <p className="mt-1 font-semibold text-slate-900">{request.returnTrackingNumber ?? request.returnAwb}</p>
              {request.returnTrackingUrl ? (
                <a
                  href={request.returnTrackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex text-sm font-semibold text-[#ee4d2d] hover:underline"
                >
                  Theo dõi hành trình →
                </a>
              ) : null}
            </section>
          ) : null}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Lý do trả hàng</h3>
            <p className="mt-2 font-semibold text-slate-900">{REASON_LABELS[request.reasonCode] ?? request.reasonCode}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{request.reasonDetail}</p>
          </section>
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Sản phẩm</h3>
            <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {items.length === 0 ? (
                <p className="p-3 text-sm text-slate-500">Không có thông tin chi tiết sản phẩm.</p>
              ) : (
                items.map((item) => (
                  <div key={item.id || item.sku} className="flex items-start justify-between gap-3 p-3 text-sm">
                    <div>
                      <p className="font-medium text-slate-900">{item.productName || 'Sản phẩm'}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        SKU {item.sku || 'N/A'} · SL {item.quantity || 1}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold text-slate-900">{formatCurrency(item.totalPrice || 0, request.currency || 'VND')}</p>
                  </div>
                ))
              )}
            </div>
          </section>
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Bằng chứng người mua</h3>
            {evidenceUrls.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Không có tệp đính kèm.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {evidenceUrls.map((url, index) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-[#ee4d2d] hover:text-[#ee4d2d]"
                    >
                      Bằng chứng {index + 1} ↗
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {request.sellerNote ? (
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Phản hồi của shop</h3>
              <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">{request.sellerNote}</p>
            </section>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-5">
            <RowActions
              request={request}
              disabled={disabled}
              onView={() => undefined}
              onApprove={onApprove}
              onReject={onReject}
              onComplete={onComplete}
              showView={false}
            />
          </div>
        </div>
      </aside>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
function EmptyRow({ message }: { message: string }) {
  return (
    <tr>
      <td colSpan={6} className="px-5 py-14 text-center text-sm text-slate-500">
        {message}
      </td>
    </tr>
  );
}
function productSummary(request: SellerReturnRequest) {
  const items = Array.isArray(request?.items) ? request.items : [];
  if (items.length === 0) return 'Không có thông tin sản phẩm';
  const first = items[0]?.productName || 'Sản phẩm';
  return items.length === 1 ? first : `${first} +${items.length - 1} sản phẩm`;
}
function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount.toLocaleString('vi-VN')} ${currency}`;
  }
}
function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof SellerApiClientError ? error.message : fallback;
}
