'use client';

import { useEffect } from 'react';

export default function WalletError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Buyer wallet page failed to render', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-[720px] items-center justify-center px-4">
      <div className="w-full rounded-xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Không thể hiển thị ví eMall</h1>
        <p className="mt-2 text-sm text-slate-600">Dữ liệu ví chưa tải hoàn chỉnh. Vui lòng thử lại.</p>
        <button className="mt-5 rounded-md bg-brand-600 px-5 py-3 font-semibold text-white" type="button" onClick={reset}>
          Tải lại ví
        </button>
      </div>
    </main>
  );
}
