'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { useLanguage } from '@/providers/AppProvider';
import { PaymentQrPanel } from './payment-qr-panel';

function parseOrderIds(search: string): string[] {
  const params = new URLSearchParams(search);
  const raw = params.get('orderIds') ?? '';
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item, index, arr) => item.length > 0 && arr.indexOf(item) === index);
}

export default function MultiPaymentPage() {
  const { text } = useLanguage();
  const [orderIds, setOrderIds] = useState<string[]>([]);

  useEffect(() => {
    setOrderIds(parseOrderIds(window.location.search));
  }, []);

  return (
    <div className="min-h-screen bg-app-bg text-slate-900">
      <Header keywords={[]} />
      <main className="mx-auto w-full max-w-[1180px] px-3 py-4 md:px-4 md:py-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-slate-900">{text.paymentQr.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{text.paymentQr.subtitle}</p>
        </div>

        {orderIds.length === 0 ? (
          <p className="rounded-md bg-white p-5 text-sm text-red-600 shadow-card">{text.orders.invalidData}</p>
        ) : (
          <div className="space-y-4">
            {orderIds.map((orderId) => (
              <PaymentQrPanel key={orderId} orderId={orderId} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
