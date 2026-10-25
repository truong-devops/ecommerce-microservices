'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BuyerApiClientError } from '@/lib/api/client';
import { fetchBuyerPaymentGroupById } from '@/lib/api/payments';
import { formatPrice } from '@/lib/price';
import type { PaymentGroup, PaymentInstructions, PaymentStatus } from '@/lib/api/types';
import { useAuth, useLanguage } from '@/providers/AppProvider';

const TERMINAL_STATUSES: Set<PaymentStatus> = new Set(['CAPTURED', 'FAILED', 'CANCELLED', 'REFUNDED', 'CHARGEBACK']);

function normalizeInstructions(group: PaymentGroup | null): PaymentInstructions | null {
  if (group?.paymentInstructions) return group.paymentInstructions;
  const candidate = group?.metadata?.paymentInstructions as Partial<PaymentInstructions> | undefined;
  if (!candidate || typeof candidate.qrImageUrl !== 'string' || typeof candidate.paymentCode !== 'string') return null;
  return candidate as PaymentInstructions;
}

function secondsUntil(rawDate: string | null | undefined, now: number): number | null {
  if (!rawDate) return null;
  const target = new Date(rawDate).getTime();
  return Number.isFinite(target) ? Math.max(0, Math.floor((target - now) / 1000)) : null;
}

function formatCountdown(seconds: number | null): string {
  if (seconds === null) return '--:--';
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function PaymentGroupQrPanel({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { text } = useLanguage();
  const { ready, user, accessToken } = useAuth();
  const [group, setGroup] = useState<PaymentGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    if (!accessToken || !groupId) return;
    try {
      const result = await fetchBuyerPaymentGroupById({ accessToken, groupId });
      setGroup(result);
      setError('');
    } catch (loadError) {
      if (loadError instanceof BuyerApiClientError && ['UNAUTHORIZED', 'HTTP_401'].includes(loadError.code)) {
        router.replace(`/login?returnUrl=${encodeURIComponent(`/checkout/payment/group/${groupId}`)}`);
        return;
      }
      setError(loadError instanceof Error ? loadError.message : text.product.loadError);
    } finally {
      setLoading(false);
    }
  }, [accessToken, groupId, router, text.product.loadError]);

  useEffect(() => {
    if (ready && user && accessToken) void load();
  }, [accessToken, load, ready, user]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!group || TERMINAL_STATUSES.has(group.status)) return;
    const timer = window.setInterval(() => void load(), document.hidden ? 5000 : 1500);
    return () => window.clearInterval(timer);
  }, [group, load]);

  const instructions = useMemo(() => normalizeInstructions(group), [group]);
  const secondsLeft = secondsUntil(instructions?.expiresAt ?? group?.expiresAt, now);
  const expired = group?.status !== 'CAPTURED' && secondsLeft !== null && secondsLeft <= 0;

  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(''), 1500);
  };

  if (!ready || loading) return <div className="rounded-md bg-white p-6 shadow-card">{text.orders.loading}</div>;
  if (!user || !accessToken) return <div className="rounded-md bg-white p-6 shadow-card">{text.orders.loginRequired}</div>;

  if (!group) {
    return (
      <div className="rounded-md bg-white p-6 shadow-card">
        <p className="text-sm text-red-600">{error || text.product.loadError}</p>
        <button type="button" onClick={() => void load()} className="mt-4 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white">
          {text.orders.retry}
        </button>
      </div>
    );
  }

  return (
    <article className="rounded-md bg-white p-4 shadow-card md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Thanh toán {group.orderIds.length} đơn hàng</h2>
          <p className="mt-1 text-sm text-slate-600">Một lần chuyển khoản, hệ thống tự phân bổ cho từng shop.</p>
        </div>
        <span className={`rounded px-3 py-1 text-xs font-semibold ${group.status === 'CAPTURED' ? 'bg-emerald-50 text-emerald-700' : expired || group.status === 'FAILED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
          {group.status === 'CAPTURED' ? text.paymentQr.paid : expired || group.status === 'FAILED' ? text.paymentQr.expired : text.paymentQr.pending}
        </span>
      </div>

      {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      {group.status === 'CAPTURED' ? (
        <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-semibold">{text.paymentQr.paid}</p>
          <p className="mt-1">Cả {group.orderIds.length} đơn đã được ghi nhận thanh toán.</p>
        </div>
      ) : null}

      {instructions && group.status !== 'CAPTURED' ? (
        <div className="mt-5 grid gap-5 md:grid-cols-[300px_minmax(0,1fr)]">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <img src={instructions.qrImageUrl} alt={text.paymentQr.qrAlt} className="aspect-square w-full rounded-md bg-white object-contain" />
          </div>
          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs font-medium uppercase text-slate-500">{text.paymentQr.amount}</p>
              <p className="mt-1 text-xl font-semibold text-brand-600">{formatPrice(group.amount, group.currency)}</p>
            </div>
            <CopyRow label={text.paymentQr.content} value={instructions.transferDescription} copied={copied === 'content'} onCopy={() => void copy('content', instructions.transferDescription)} copyText={text.paymentQr.copy} copiedText={text.paymentQr.copied} />
            <CopyRow label={text.paymentQr.bank} value={instructions.bankCode} copied={copied === 'bank'} onCopy={() => void copy('bank', instructions.bankCode)} copyText={text.paymentQr.copy} copiedText={text.paymentQr.copied} />
            <CopyRow label={text.paymentQr.account} value={instructions.accountNumber} copied={copied === 'account'} onCopy={() => void copy('account', instructions.accountNumber)} copyText={text.paymentQr.copy} copiedText={text.paymentQr.copied} />
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs font-medium uppercase text-slate-500">{text.paymentQr.expiresIn}</p>
              <p className={`mt-1 text-lg font-semibold ${expired ? 'text-red-600' : 'text-slate-900'}`}>{formatCountdown(secondsLeft)}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-5 border-t border-slate-200 pt-4">
        <p className="text-sm font-semibold text-slate-900">Các đơn trong lần thanh toán này</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {group.orderIds.map((orderId, index) => (
            <Link key={orderId} href={`/orders/${encodeURIComponent(orderId)}`} className="rounded-sm border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:border-brand-500 hover:text-brand-600">
              Đơn {index + 1}
            </Link>
          ))}
          <Link href="/orders" className="rounded-sm border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:border-brand-500 hover:text-brand-600">
            {text.orders.backToOrders}
          </Link>
        </div>
      </div>
    </article>
  );
}

function CopyRow({ label, value, copied, onCopy, copyText, copiedText }: { label: string; value: string; copied: boolean; onCopy: () => void; copyText: string; copiedText: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="break-all font-semibold text-slate-900">{value}</p>
        <button type="button" onClick={onCopy} className="shrink-0 rounded-sm border border-slate-300 px-3 py-1.5 text-xs font-semibold">
          {copied ? copiedText : copyText}
        </button>
      </div>
    </div>
  );
}
