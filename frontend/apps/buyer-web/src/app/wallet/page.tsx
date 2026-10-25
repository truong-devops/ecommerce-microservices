'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/providers/AppProvider';
import {
  createBuyerRefundPayout,
  getBuyerWallet,
  getBuyerWalletBankAccount,
  listBuyerRefundPayouts,
  listBuyerWalletTransactions,
  updateBuyerWalletBankAccount
} from '@/lib/api/wallet';
import type { BuyerRefundPayout, BuyerWalletBalance, BuyerWalletBankAccount, BuyerWalletTransaction } from '@/lib/api/types';

const keywords = ['Ví eMall', 'Hoàn tiền', 'Đơn mua'];
const money = (value: number) => new Intl.NumberFormat('vi-VN').format(value) + 'đ';
const date = (value: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

export default function BuyerWalletPage() {
  const router = useRouter();
  const { ready, user, accessToken } = useAuth();
  const [wallet, setWallet] = useState<BuyerWalletBalance | null>(null);
  const [bank, setBank] = useState<BuyerWalletBankAccount | null>(null);
  const [transactions, setTransactions] = useState<BuyerWalletTransaction[]>([]);
  const [payouts, setPayouts] = useState<BuyerRefundPayout[]>([]);
  const [form, setForm] = useState({ bankCode: '', accountNumber: '', accountHolderName: '' });
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const [nextWallet, transactionPage, payoutPage] = await Promise.all([
        getBuyerWallet(accessToken),
        listBuyerWalletTransactions(accessToken),
        listBuyerRefundPayouts(accessToken)
      ]);
      setWallet(nextWallet);
      setTransactions(transactionPage.items);
      setPayouts(payoutPage.items);
      try {
        const account = await getBuyerWalletBankAccount(accessToken);
        setBank(account);
        setForm({ bankCode: account.bankCode, accountNumber: '', accountHolderName: account.accountHolderName });
      } catch {
        setBank(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Không tải được ví eMall.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (ready && (!user || !accessToken)) router.replace('/login');
    if (ready && user && accessToken) void load();
  }, [accessToken, load, ready, router, user]);

  const saveBank = async () => {
    if (!accessToken) return;
    setAction('bank');
    setError('');
    setNotice('');
    try {
      const account = await updateBuyerWalletBankAccount(accessToken, form);
      setBank(account);
      setForm((value) => ({ ...value, accountNumber: '' }));
      setNotice('Đã lưu tài khoản. Admin cần xác minh trước khi bạn yêu cầu chuyển tiền hoàn.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Không lưu được tài khoản.');
    } finally {
      setAction('');
    }
  };

  const requestRefund = async () => {
    if (!accessToken || !wallet || wallet.availableAmount <= 0) return;
    setAction('payout');
    setError('');
    setNotice('');
    try {
      await createBuyerRefundPayout(accessToken, wallet.availableAmount);
      setNotice('Đã gửi yêu cầu. Admin sẽ chuyển khoản và SePay tự xác nhận khi tiền ra thành công.');
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không tạo được yêu cầu hoàn tiền.');
    } finally {
      setAction('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <Header keywords={keywords} />
      <main className="mx-auto w-full max-w-[1200px] space-y-5 px-4 py-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Tài chính khách hàng</p>
          <h1 className="mt-1 text-3xl font-bold">Ví eMall & hoàn tiền</h1>
          <p className="mt-2 text-slate-600">Tiền của đơn online bị hủy được ghi nhận ở đây trước khi Admin chuyển về ngân hàng của bạn.</p>
        </div>
        {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        {loading ? (
          <div className="rounded-xl bg-white p-10 text-center text-slate-500">Đang tải ví...</div>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              <Card label="Có thể yêu cầu hoàn" value={money(wallet?.availableAmount ?? 0)} />
              <Card label="Admin đang chuyển" value={money(wallet?.payoutPendingAmount ?? 0)} />
              <Card label="Đã chuyển về ngân hàng" value={money(wallet?.totalPaidOut ?? 0)} />
            </section>
            <section className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Tài khoản nhận tiền hoàn</h2>
                {bank && (
                  <p className="mt-1 text-sm text-slate-500">
                    {bank.bankCode} · {bank.maskedAccountNumber} · <b>{bank.status}</b>
                  </p>
                )}
                <div className="mt-4 grid gap-3">
                  <input
                    className="h-11 rounded-md border px-3"
                    placeholder="Mã ngân hàng, ví dụ VCB"
                    value={form.bankCode}
                    onChange={(e) => setForm({ ...form, bankCode: e.target.value.toUpperCase() })}
                  />
                  <input
                    className="h-11 rounded-md border px-3"
                    placeholder={bank ? 'Nhập số tài khoản mới nếu muốn thay đổi' : 'Số tài khoản'}
                    value={form.accountNumber}
                    onChange={(e) => setForm({ ...form, accountNumber: e.target.value.replace(/\D/g, '') })}
                  />
                  <input
                    className="h-11 rounded-md border px-3"
                    placeholder="Tên chủ tài khoản"
                    value={form.accountHolderName}
                    onChange={(e) => setForm({ ...form, accountHolderName: e.target.value.toUpperCase() })}
                  />
                  <button
                    className="h-11 rounded-md bg-brand-600 font-semibold text-white disabled:opacity-50"
                    disabled={action !== '' || !form.bankCode || !form.accountNumber || !form.accountHolderName}
                    onClick={() => void saveBank()}
                  >
                    {action === 'bank' ? 'Đang lưu...' : 'Lưu tài khoản'}
                  </button>
                  <button
                    className="h-11 rounded-md bg-emerald-600 font-semibold text-white disabled:opacity-50"
                    disabled={action !== '' || !bank || bank.status !== 'ALLOWLISTED' || (wallet?.availableAmount ?? 0) <= 0}
                    onClick={() => void requestRefund()}
                  >
                    {action === 'payout' ? 'Đang gửi...' : `Yêu cầu chuyển ${money(wallet?.availableAmount ?? 0)}`}
                  </button>
                  {bank?.status !== 'ALLOWLISTED' && (
                    <p className="text-xs text-amber-700">Tài khoản phải được Admin xác minh trước khi chuyển tiền.</p>
                  )}
                </div>
              </div>
              <Table
                title="Yêu cầu chuyển tiền"
                empty="Chưa có yêu cầu."
                rows={payouts.map((p) => [date(p.requestedAt), money(p.amount), p.status])}
              />
            </section>
            <Table
              title="Lịch sử ví"
              empty="Chưa có khoản hoàn tiền."
              rows={transactions.map((t) => [date(t.occurredAt), t.type, t.referenceId.slice(0, 8), money(t.amount)])}
            />
          </>
        )}
      </main>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}
function Table({ title, empty, rows }: { title: string; empty: string; rows: (string | number)[][] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <h2 className="border-b p-4 text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <tbody className="divide-y">
              {rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-4 py-3">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
