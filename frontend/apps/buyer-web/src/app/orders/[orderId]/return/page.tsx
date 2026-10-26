'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { BuyerApiClientError } from '@/lib/api/client';
import { fetchBuyerOrderById } from '@/lib/api/orders';
import { cancelReturnRequest, createReturnRequest, fetchReturnByOrder, shipReturnRequest } from '@/lib/api/returns';
import type { Order, ReturnReasonCode, ReturnRequest } from '@/lib/api/types';
import { formatOrderCode } from '@/lib/order-codes';
import { formatPrice } from '@/lib/price';
import { useAuth } from '@/providers/AppProvider';

const reasons: Array<{ value: ReturnReasonCode; label: string }> = [
  { value: 'DAMAGED', label: 'Sản phẩm bị hư hỏng' },
  { value: 'WRONG_ITEM', label: 'Giao sai sản phẩm' },
  { value: 'MISSING_PARTS', label: 'Thiếu sản phẩm hoặc phụ kiện' },
  { value: 'NOT_AS_DESCRIBED', label: 'Không đúng mô tả' },
  { value: 'QUALITY_ISSUE', label: 'Chất lượng không đạt' },
  { value: 'OTHER', label: 'Lý do khác' }
];

export default function BuyerReturnPage() {
  const params = useParams<{ orderId: string }>();
  const router = useRouter();
  const { ready, user, accessToken } = useAuth();
  const orderId = useMemo(() => decodeURIComponent(params?.orderId ?? '').trim(), [params?.orderId]);
  const [order, setOrder] = useState<Order | null>(null);
  const [returnRequest, setReturnRequest] = useState<ReturnRequest | null>(null);
  const [reasonCode, setReasonCode] = useState<ReturnReasonCode>('DAMAGED');
  const [reasonDetail, setReasonDetail] = useState('');
  const [evidenceText, setEvidenceText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!accessToken || !orderId) return;
    setLoading(true);
    setError('');
    try {
      const detail = await fetchBuyerOrderById({ accessToken, orderId });
      setOrder(detail);
      try { setReturnRequest(await fetchReturnByOrder(accessToken, orderId)); }
      catch (requestError) {
        if (!(requestError instanceof BuyerApiClientError) || (requestError.code !== 'NOT_FOUND' && requestError.code !== 'HTTP_404')) throw requestError;
        setReturnRequest(null);
      }
    } catch (loadError) {
      setError(loadError instanceof BuyerApiClientError ? loadError.message : 'Không tải được thông tin trả hàng.');
    } finally { setLoading(false); }
  }, [accessToken, orderId]);

  useEffect(() => {
    if (!ready) return;
    if (!user || !accessToken) { router.replace(`/login?returnUrl=${encodeURIComponent(`/orders/${orderId}/return`)}`); return; }
    void load();
  }, [accessToken, load, orderId, ready, router, user]);

  const submit = async () => {
    if (!accessToken || !order) return;
    if (reasonDetail.trim().length < 10) { setError('Vui lòng mô tả vấn đề ít nhất 10 ký tự.'); return; }
    const evidenceUrls = evidenceText.split('\n').map((item) => item.trim()).filter(Boolean);
    if (evidenceUrls.length > 5) { setError('Chỉ được cung cấp tối đa 5 liên kết bằng chứng.'); return; }
    setSubmitting(true); setError('');
    try {
      setReturnRequest(await createReturnRequest(accessToken, order.id, { reasonCode, reasonDetail: reasonDetail.trim(), evidenceUrls }));
    } catch (submitError) { setError(submitError instanceof BuyerApiClientError ? submitError.message : 'Không thể gửi yêu cầu.'); }
    finally { setSubmitting(false); }
  };

  const cancel = async () => {
    if (!accessToken || !returnRequest || !window.confirm('Bạn muốn hủy yêu cầu trả hàng này?')) return;
    setSubmitting(true); setError('');
    try { setReturnRequest(await cancelReturnRequest(accessToken, returnRequest.id)); }
    catch (cancelError) { setError(cancelError instanceof BuyerApiClientError ? cancelError.message : 'Không thể hủy yêu cầu.'); }
    finally { setSubmitting(false); }
  };

  const ship = async () => {
    if (!accessToken || !returnRequest || !window.confirm('Xác nhận bạn đã gửi kiện hàng trả về cho Seller?')) return;
    setSubmitting(true); setError('');
    try { setReturnRequest(await shipReturnRequest(accessToken, returnRequest.id)); }
    catch (shipError) { setError(shipError instanceof BuyerApiClientError ? shipError.message : 'Không thể xác nhận đã gửi hàng.'); }
    finally { setSubmitting(false); }
  };

  if (!ready || loading) return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-600">Đang tải yêu cầu trả hàng...</main>;

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-slate-900">
      <Header keywords={[]} />
      <main className="mx-auto w-full max-w-[1040px] px-4 py-7">
        <Link href={`/orders/${encodeURIComponent(orderId)}`} className="text-sm font-semibold text-brand-600 hover:underline">← Quay lại chi tiết đơn hàng</Link>
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Bảo vệ người mua</p>
            <h1 className="mt-2 text-2xl font-bold">Trả hàng và hoàn tiền</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">Yêu cầu được gửi đến Seller. Tiền chỉ được hoàn vào ví eMall sau khi Seller xác nhận đã nhận hàng hoàn.</p>
            {error ? <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

            {returnRequest ? <ReturnStatusPanel request={returnRequest} submitting={submitting} onCancel={cancel} onShip={ship} /> : (
              <div className="mt-7 space-y-5">
                <label className="block text-sm font-semibold text-slate-700">Lý do trả hàng
                  <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value as ReturnReasonCode)} className="mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 outline-none focus:border-brand-500">
                    {reasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-semibold text-slate-700">Mô tả chi tiết
                  <textarea value={reasonDetail} onChange={(event) => setReasonDetail(event.target.value)} maxLength={1000} rows={5} placeholder="Mô tả tình trạng sản phẩm, thời điểm phát hiện và mong muốn xử lý..." className="mt-2 w-full rounded-lg border border-slate-300 p-3 font-normal outline-none focus:border-brand-500" />
                  <span className="mt-1 block text-right text-xs font-normal text-slate-400">{reasonDetail.length}/1000</span>
                </label>
                <label className="block text-sm font-semibold text-slate-700">Liên kết ảnh/video bằng chứng <span className="font-normal text-slate-400">(không bắt buộc)</span>
                  <textarea value={evidenceText} onChange={(event) => setEvidenceText(event.target.value)} rows={3} placeholder={'https://...\nMỗi liên kết một dòng, tối đa 5 liên kết'} className="mt-2 w-full rounded-lg border border-slate-300 p-3 font-normal outline-none focus:border-brand-500" />
                </label>
                <button type="button" disabled={submitting || !order || order.status !== 'DELIVERED' || order.paymentMethod !== 'ONLINE'} onClick={() => void submit()} className="h-12 w-full rounded-lg bg-brand-600 px-5 text-sm font-bold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? 'Đang gửi...' : 'Gửi yêu cầu trả hàng'}</button>
                {order && (order.status !== 'DELIVERED' || order.paymentMethod !== 'ONLINE') ? <p className="text-xs text-amber-700">Tính năng hiện áp dụng cho đơn thanh toán online đã giao thành công.</p> : null}
              </div>
            )}
          </section>

          <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold">Thông tin yêu cầu</h2>
            {order ? <div className="mt-4 space-y-3 text-sm">
              <Info label="Mã đơn" value={formatOrderCode(order.orderNumber, order.id)} />
              <Info label="Sản phẩm" value={`${order.items.length} dòng sản phẩm`} />
              <Info label="Số tiền dự kiến hoàn" value={formatPrice(order.totalAmount, order.currency)} highlight />
              <Info label="Phương thức" value={order.paymentMethod === 'ONLINE' ? 'Thanh toán online' : 'COD'} />
            </div> : <p className="mt-4 text-sm text-slate-500">Không có dữ liệu đơn hàng.</p>}
            <div className="mt-5 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">Thời hạn gửi yêu cầu là 7 ngày kể từ khi đơn được ghi nhận giao thành công.</div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function ReturnStatusPanel({ request, submitting, onCancel, onShip }: { request: ReturnRequest; submitting: boolean; onCancel: () => Promise<void>; onShip: () => Promise<void> }) {
  const status = statusMeta(request.status);
  return <div className="mt-7">
    <div className={`rounded-xl border p-5 ${status.tone}`}><p className="text-xs font-bold uppercase tracking-wide">{request.returnNumber}</p><h2 className="mt-2 text-xl font-bold">{status.label}</h2><p className="mt-2 text-sm leading-6">{status.description}</p></div>
    <dl className="mt-5 grid gap-4 rounded-xl border border-slate-200 p-5 text-sm sm:grid-cols-2"><Info label="Lý do" value={reasons.find((item) => item.value === request.reasonCode)?.label ?? request.reasonCode} /><Info label="Số tiền hoàn" value={formatPrice(request.refundAmount, request.currency)} highlight /><Info label="Mô tả" value={request.reasonDetail} />{request.sellerNote ? <Info label="Phản hồi Seller" value={request.sellerNote} /> : null}</dl>
    <div className="mt-4 flex flex-wrap gap-3">
      {request.status === 'APPROVED' ? <button type="button" disabled={submitting} onClick={() => void onShip()} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{submitting ? 'Đang xác nhận...' : 'Tôi đã gửi trả hàng'}</button> : null}
      {request.status === 'REQUESTED' || request.status === 'APPROVED' ? <button type="button" disabled={submitting} onClick={() => void onCancel()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Hủy yêu cầu</button> : null}
    </div>
  </div>;
}

function statusMeta(status: ReturnRequest['status']) {
  const values = {
    REQUESTED: { label: 'Đang chờ Seller phản hồi', description: 'Seller sẽ xem lý do và bằng chứng trước khi quyết định.', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
    APPROVED: { label: 'Seller đã duyệt yêu cầu', description: 'Hãy gửi hàng về Seller, sau đó bấm “Tôi đã gửi trả hàng”.', tone: 'border-cyan-200 bg-cyan-50 text-cyan-800' },
    RETURNING: { label: 'Đang vận chuyển hàng hoàn', description: 'Bạn đã xác nhận gửi hàng. Đang chờ Seller nhận và kiểm tra kiện hoàn.', tone: 'border-blue-200 bg-blue-50 text-blue-800' },
    REJECTED: { label: 'Yêu cầu bị từ chối', description: 'Xem phản hồi của Seller bên dưới hoặc liên hệ hỗ trợ nếu cần.', tone: 'border-red-200 bg-red-50 text-red-800' },
    REFUND_PENDING: { label: 'Đang xử lý hoàn tiền', description: 'Hệ thống đang chuyển tiền vào ví eMall của bạn.', tone: 'border-indigo-200 bg-indigo-50 text-indigo-800' },
    REFUNDED: { label: 'Đã hoàn tiền', description: 'Tiền đã được ghi có vào ví eMall của bạn.', tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
    CANCELLED: { label: 'Yêu cầu đã hủy', description: 'Yêu cầu này không còn được xử lý.', tone: 'border-slate-200 bg-slate-50 text-slate-700' }
  } as const;
  return values[status];
}

function Info({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className={`mt-1 break-words font-semibold ${highlight ? 'text-brand-600' : 'text-slate-800'}`}>{value}</dd></div>; }
