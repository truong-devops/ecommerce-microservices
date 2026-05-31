'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BuyerApiClientError } from '@/lib/api/client';
import { fetchBuyerOrderById } from '@/lib/api/orders';
import { createBuyerPaymentIntent, fetchBuyerPaymentByOrderId } from '@/lib/api/payments';
import { formatOrderCode } from '@/lib/order-codes';
import { formatPrice } from '@/lib/price';
import type { Order, Payment, PaymentInstructions, PaymentStatus } from '@/lib/api/types';
import { useAuth, useLanguage } from '@/providers/AppProvider';

type PanelStatus = 'idle' | 'loading' | 'success' | 'error';

const TERMINAL_PAYMENT_STATUSES: Set<PaymentStatus> = new Set([
  'CAPTURED',
  'FAILED',
  'CANCELLED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'CHARGEBACK'
]);
const PAYMENT_POLL_INTERVAL_MS = 1500;
const PAYMENT_POLL_BACKGROUND_INTERVAL_MS = 5000;
const PAYMENT_SUCCESS_REDIRECT_DELAY_MS = 1200;

function buildIdempotencyKey(orderId: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `sepay-${orderId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isTerminalPayment(status: PaymentStatus | undefined): boolean {
  return status ? TERMINAL_PAYMENT_STATUSES.has(status) : false;
}

function normalizeInstructions(payment: Payment | null): PaymentInstructions | null {
  if (!payment) {
    return null;
  }
  if (payment.paymentInstructions) {
    return payment.paymentInstructions;
  }

  const metadataInstructions =
    payment.metadata && typeof payment.metadata === 'object'
      ? (payment.metadata.paymentInstructions as Partial<PaymentInstructions> | undefined)
      : undefined;
  if (!metadataInstructions || typeof metadataInstructions !== 'object') {
    return null;
  }
  if (typeof metadataInstructions.qrImageUrl !== 'string' || typeof metadataInstructions.paymentCode !== 'string') {
    return null;
  }

  return metadataInstructions as PaymentInstructions;
}

function canRequestPaymentIntent(payment: Payment | null, instructions: PaymentInstructions | null): boolean {
  if (!payment) {
    return true;
  }
  if (instructions) {
    return false;
  }
  return payment.status === 'PENDING' || payment.status === 'REQUIRES_ACTION';
}

function secondsUntil(rawDate: string | null | undefined, nowMs: number): number | null {
  if (!rawDate) {
    return null;
  }
  const target = new Date(rawDate).getTime();
  if (!Number.isFinite(target)) {
    return null;
  }
  return Math.max(0, Math.floor((target - nowMs) / 1000));
}

function formatCountdown(seconds: number | null): string {
  if (seconds === null) {
    return '--:--';
  }
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function paymentStatusLabel(payment: Payment | null, expired: boolean, text: ReturnType<typeof useLanguage>['text']): string {
  if (payment?.status === 'CAPTURED') {
    return text.paymentQr.paid;
  }
  if (payment?.status === 'FAILED' || expired) {
    return text.paymentQr.expired;
  }
  if (payment?.status === 'CANCELLED') {
    return text.orders.paymentCancelled;
  }
  return text.paymentQr.pending;
}

interface PaymentQrPanelProps {
  orderId: string;
  autoRedirect?: boolean;
}

export function PaymentQrPanel({ orderId, autoRedirect = false }: PaymentQrPanelProps) {
  const router = useRouter();
  const { text } = useLanguage();
  const { ready, user, accessToken } = useAuth();

  const [panelStatus, setPanelStatus] = useState<PanelStatus>('idle');
  const [order, setOrder] = useState<Order | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');
  const [nowMs, setNowMs] = useState(Date.now());
  const redirectTimerRef = useRef<number | null>(null);

  const loadPayment = useCallback(async () => {
    if (!accessToken || !orderId) {
      return;
    }

    setPanelStatus((current) => (current === 'success' ? current : 'loading'));
    setErrorMessage('');

    try {
      const [orderResult, paymentResult] = await Promise.all([
        fetchBuyerOrderById({ accessToken, orderId }),
        (async () => {
          try {
            return await fetchBuyerPaymentByOrderId({ accessToken, orderId });
          } catch (error) {
            if (error instanceof BuyerApiClientError) {
              if (error.code === 'PAYMENT_NOT_FOUND' || error.code === 'NOT_FOUND' || error.code === 'HTTP_404') {
                return null;
              }
            }
            throw error;
          }
        })()
      ]);

      setOrder(orderResult);
      setPayment(paymentResult);
      setPanelStatus('success');
    } catch (error) {
      if (error instanceof BuyerApiClientError) {
        if (error.code === 'UNAUTHORIZED' || error.code === 'FORBIDDEN' || error.code === 'HTTP_401' || error.code === 'HTTP_403') {
          if (!user || !accessToken) {
            router.replace(`/login?returnUrl=${encodeURIComponent(`/checkout/payment/${orderId}`)}`);
            return;
          }
          setErrorMessage(error.message || text.product.loadError);
          setPanelStatus('error');
          return;
        }
        setErrorMessage(error.message);
      } else {
        setErrorMessage(text.product.loadError);
      }
      setPanelStatus('error');
    }
  }, [accessToken, orderId, router, text.product.loadError, user]);

  useEffect(() => {
    if (!ready || !user || !accessToken || !orderId) {
      return;
    }
    void loadPayment();
  }, [accessToken, loadPayment, orderId, ready, user]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!payment || isTerminalPayment(payment.status)) {
      return;
    }

    let cancelled = false;
    let timeoutID: number | null = null;
    const poll = async () => {
      if (cancelled) {
        return;
      }
      await loadPayment();
      if (cancelled) {
        return;
      }
      timeoutID = window.setTimeout(poll, document.hidden ? PAYMENT_POLL_BACKGROUND_INTERVAL_MS : PAYMENT_POLL_INTERVAL_MS);
    };

    timeoutID = window.setTimeout(poll, document.hidden ? PAYMENT_POLL_BACKGROUND_INTERVAL_MS : PAYMENT_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timeoutID !== null) {
        window.clearTimeout(timeoutID);
      }
    };
  }, [loadPayment, payment]);

  useEffect(() => {
    if (!payment || isTerminalPayment(payment.status)) {
      return;
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void loadPayment();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadPayment, payment]);

  useEffect(() => {
    if (!autoRedirect || payment?.status !== 'CAPTURED') {
      return;
    }
    if (redirectTimerRef.current !== null) {
      window.clearTimeout(redirectTimerRef.current);
    }
    redirectTimerRef.current = window.setTimeout(() => {
      router.push(`/orders/${encodeURIComponent(orderId)}`);
    }, PAYMENT_SUCCESS_REDIRECT_DELAY_MS);

    return () => {
      if (redirectTimerRef.current !== null) {
        window.clearTimeout(redirectTimerRef.current);
      }
    };
  }, [autoRedirect, orderId, payment?.status, router]);

  const instructions = useMemo(() => normalizeInstructions(payment), [payment]);
  const expiresAt = instructions?.expiresAt ?? payment?.expiresAt ?? null;
  const secondsLeft = secondsUntil(expiresAt, nowMs);
  const expired = payment?.status !== 'CAPTURED' && secondsLeft !== null && secondsLeft <= 0;
  const canCreateIntent =
    Boolean(order) &&
    order?.paymentMethod === 'ONLINE' &&
    order.totalAmount > 0 &&
    canRequestPaymentIntent(payment, instructions);

  const handleCopy = async (key: string, value: string | number | null | undefined) => {
    const textValue = String(value ?? '').trim();
    if (!textValue) {
      return;
    }
    await navigator.clipboard.writeText(textValue);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(''), 1500);
  };

  const handleCreateIntent = async () => {
    if (!accessToken || !order) {
      return;
    }

    setIsCreatingIntent(true);
    setErrorMessage('');
    try {
      const created = await createBuyerPaymentIntent({
        accessToken,
        idempotencyKey: buildIdempotencyKey(order.id),
        payload: {
          orderId: order.id,
          currency: order.currency,
          amount: order.totalAmount,
          description: `Payment for order ${order.orderNumber}`
        }
      });
      setPayment(created);
      setPanelStatus('success');
    } catch (error) {
      if (error instanceof BuyerApiClientError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(text.checkout.paymentIntentFailed);
      }
      setPanelStatus('error');
    } finally {
      setIsCreatingIntent(false);
    }
  };

  if (!ready || panelStatus === 'loading' || panelStatus === 'idle') {
    return <article className="rounded-md bg-white p-5 shadow-card">{text.orders.loading}</article>;
  }

  if (!user || !accessToken) {
    return <article className="rounded-md bg-white p-5 shadow-card">{text.orders.loginRequired}</article>;
  }

  if (panelStatus === 'error' && !order) {
    return (
      <article className="rounded-md bg-white p-5 shadow-card">
        <p className="text-sm text-red-600">{errorMessage || text.product.loadError}</p>
        <button
          type="button"
          onClick={() => {
            void loadPayment();
          }}
          className="mt-4 h-10 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white"
        >
          {text.orders.retry}
        </button>
      </article>
    );
  }

  const orderCode = order ? formatOrderCode(order.orderNumber, order.id) : orderId;
  const statusLabel = paymentStatusLabel(payment, expired, text);
  const statusClass =
    payment?.status === 'CAPTURED'
      ? 'bg-emerald-50 text-emerald-700'
      : expired || payment?.status === 'FAILED'
        ? 'bg-red-50 text-red-700'
        : 'bg-amber-50 text-amber-700';

  return (
    <article className="rounded-md bg-white p-4 shadow-card md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{orderCode}</h2>
          {order ? <p className="mt-1 text-sm text-slate-600">{formatPrice(order.totalAmount, order.currency)}</p> : null}
        </div>
        <span className={`inline-flex rounded px-2.5 py-1 text-xs font-semibold ${statusClass}`}>{statusLabel}</span>
      </div>

      {errorMessage ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p> : null}

      {payment?.status === 'CAPTURED' ? (
        <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-semibold">{text.paymentQr.paid}</p>
          <Link href={`/orders/${encodeURIComponent(orderId)}`} className="mt-3 inline-flex h-10 items-center rounded-md bg-emerald-600 px-4 font-semibold text-white">
            {text.paymentQr.viewOrder}
          </Link>
        </div>
      ) : null}

      {instructions && payment?.status !== 'CAPTURED' ? (
        <div className="mt-5 grid gap-5 md:grid-cols-[280px_minmax(0,1fr)]">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <img src={instructions.qrImageUrl} alt={text.paymentQr.qrAlt} className="aspect-square w-full rounded-md bg-white object-contain" />
          </div>

          <div className="space-y-3 text-sm text-slate-700">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs font-medium uppercase text-slate-500">{text.paymentQr.amount}</p>
              <p className="mt-1 text-xl font-semibold text-brand-600">{formatPrice(instructions.amount, instructions.currency)}</p>
            </div>

            <CopyRow
              label={text.paymentQr.content}
              value={instructions.transferDescription}
              copied={copiedKey === 'content'}
              copiedLabel={text.paymentQr.copied}
              copyLabel={text.paymentQr.copy}
              onCopy={() => void handleCopy('content', instructions.transferDescription)}
            />
            <CopyRow
              label={text.paymentQr.bank}
              value={instructions.bankCode}
              copied={copiedKey === 'bank'}
              copiedLabel={text.paymentQr.copied}
              copyLabel={text.paymentQr.copy}
              onCopy={() => void handleCopy('bank', instructions.bankCode)}
            />
            <CopyRow
              label={text.paymentQr.account}
              value={instructions.accountNumber}
              copied={copiedKey === 'account'}
              copiedLabel={text.paymentQr.copied}
              copyLabel={text.paymentQr.copy}
              onCopy={() => void handleCopy('account', instructions.accountNumber)}
            />
            {instructions.accountName ? (
              <CopyRow
                label={text.paymentQr.accountName}
                value={instructions.accountName}
                copied={copiedKey === 'accountName'}
                copiedLabel={text.paymentQr.copied}
                copyLabel={text.paymentQr.copy}
                onCopy={() => void handleCopy('accountName', instructions.accountName)}
              />
            ) : null}

            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs font-medium uppercase text-slate-500">{text.paymentQr.expiresIn}</p>
              <p className={`mt-1 text-lg font-semibold ${expired ? 'text-red-600' : 'text-slate-900'}`}>
                {formatCountdown(secondsLeft)}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {!instructions && payment && payment.status !== 'CAPTURED' ? (
        <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p>{text.paymentQr.support}</p>
        </div>
      ) : null}

      {canCreateIntent ? (
        <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
          <button
            type="button"
            disabled={isCreatingIntent}
            onClick={() => {
              void handleCreateIntent();
            }}
            className="h-10 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isCreatingIntent ? text.checkout.placingOrder : text.paymentQr.retry}
          </button>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={`/orders/${encodeURIComponent(orderId)}`}
          className="inline-flex h-10 items-center rounded-sm border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:border-brand-500 hover:text-brand-600"
        >
          {text.paymentQr.viewOrder}
        </Link>
        <Link
          href="/orders"
          className="inline-flex h-10 items-center rounded-sm border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:border-brand-500 hover:text-brand-600"
        >
          {text.orders.backToOrders}
        </Link>
      </div>
    </article>
  );
}

interface CopyRowProps {
  label: string;
  value: string;
  copied: boolean;
  copyLabel: string;
  copiedLabel: string;
  onCopy: () => void;
}

function CopyRow({ label, value, copied, copyLabel, copiedLabel, onCopy }: CopyRowProps) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className="break-all font-semibold text-slate-900">{value}</p>
        <button
          type="button"
          onClick={onCopy}
          className="h-8 rounded-sm border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:border-brand-500 hover:text-brand-600"
        >
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
    </div>
  );
}
