'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { useLanguage } from '@/providers/AppProvider';
import { PaymentQrPanel } from '../payment-qr-panel';

function normalizeOrderId(raw: string): string {
  try {
    return decodeURIComponent(raw ?? '').trim();
  } catch {
    return '';
  }
}

export default function SinglePaymentPage() {
  const params = useParams<{ orderId: string }>();
  const { text } = useLanguage();
  const orderId = useMemo(() => normalizeOrderId(typeof params?.orderId === 'string' ? params.orderId : ''), [params?.orderId]);

  return (
    <div className="min-h-screen bg-app-bg text-slate-900">
      <Header keywords={[]} />
      <main className="mx-auto w-full max-w-[980px] px-3 py-4 md:px-4 md:py-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-slate-900">{text.paymentQr.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{text.paymentQr.subtitle}</p>
        </div>
        {orderId ? <PaymentQrPanel orderId={orderId} autoRedirect /> : <p className="rounded-md bg-white p-5 text-sm text-red-600 shadow-card">{text.orders.invalidData}</p>}
      </main>
    </div>
  );
}
