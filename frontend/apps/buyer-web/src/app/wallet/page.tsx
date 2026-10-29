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
const money = (value: number | null | undefined) => new Intl.NumberFormat('vi-VN').format(Number.isFinite(Number(value)) ? Number(value) : 0) + 'đ';

const date = (value: string | null | undefined) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
};

const shortReference = (value: string | null | undefined) => (typeof value === 'string' && value ? value.slice(0, 8) : '—');

const itemsOf = <T,>(page: { items?: T[] } | null | undefined): T[] => (Array.isArray(page?.items) ? page.items : []);

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
      setTransactions(itemsOf(transactionPage));
      setPayouts(itemsOf(payoutPage));
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
    <div className="min-h-screen bg-[#f5f5f5] text-[#222222]">
      <Header keywords={keywords} />
      <main className="mx-auto w-full max-w-[1200px] space-y-4 px-3 py-6 md:px-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#ee4d2d]">Tài chính khách hàng</p>
          <h1 className="mt-1 text-2xl font-bold text-[#222222]">Ví eMall &amp; hoàn tiền</h1>
          <p className="mt-1 text-xs text-[#757575]">Tiền của đơn online bị hủy được ghi nhận ở đây trước khi Admin chuyển về ngân hàng của bạn.</p>
        </div>
        {notice && <div className="rounded border border-[#e8e8e8] bg-white p-3 text-xs font-medium text-[#222222] shadow-xs">{notice}</div>}
        {error && <div className="rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
        {loading ? (
          <div className="rounded-lg border border-[#e8e8e8] bg-white p-10 text-center text-xs text-[#757575]">Đang tải ví...</div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <Card label="Có thể yêu cầu hoàn" value={money(wallet?.availableAmount ?? 0)} />
              <Card label="Admin đang chuyển" value={money(wallet?.payoutPendingAmount ?? 0)} />
              <Card label="Đã chuyển về ngân hàng" value={money(wallet?.totalPaidOut ?? 0)} />
            </section>
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-[#e8e8e8] bg-white p-5 shadow-xs">
                <h2 className="text-base font-bold text-[#222222]">Tài khoản nhận tiền hoàn</h2>
                {bank && (
                  <p className="mt-1 text-xs text-[#757575]">
                    {bank.bankCode} · {bank.maskedAccountNumber} · <b className="text-[#ee4d2d]">{bank.status}</b>
                  </p>
                )}
                <div className="mt-4 grid gap-3">
                  <input
                    className="h-10 rounded border border-[#e8e8e8] px-3 text-xs text-[#222222] placeholder:text-[#999999] focus:border-[#ee4d2d] outline-none transition"
                    placeholder="Mã ngân hàng, ví dụ VCB"
                    value={form.bankCode}
                    onChange={(e) => setForm({ ...form, bankCode: e.target.value.toUpperCase() })}
                  />
                  <input
                    className="h-10 rounded border border-[#e8e8e8] px-3 text-xs text-[#222222] placeholder:text-[#999999] focus:border-[#ee4d2d] outline-none transition"
                    placeholder={bank ? 'Nhập số tài khoản mới nếu muốn thay đổi' : 'Số tài khoản'}
                    value={form.accountNumber}
                    onChange={(e) => setForm({ ...form, accountNumber: e.target.value.replace(/\D/g, '') })}
                  />
                  <input
                    className="h-10 rounded border border-[#e8e8e8] px-3 text-xs text-[#222222] placeholder:text-[#999999] focus:border-[#ee4d2d] outline-none transition"
                    placeholder="Tên chủ tài khoản"
                    value={form.accountHolderName}
                    onChange={(e) => setForm({ ...form, accountHolderName: e.target.value.toUpperCase() })}
                  />
                  <button
                    className={`h-10 rounded text-xs font-semibold transition ${
                      action !== '' || !form.bankCode || !form.accountNumber || !form.accountHolderName
                        ? 'bg-[#f5f5f5] text-[#999999] border border-[#e8e8e8] cursor-not-allowed'
                        : 'bg-[#ee4d2d] text-white hover:bg-[#d73211] shadow-xs'
                    }`}
                    disabled={action !== '' || !form.bankCode || !form.accountNumber || !form.accountHolderName}
                    onClick={() => void saveBank()}
                  >
                    {action === 'bank' ? 'Đang lưu...' : 'Lưu tài khoản'}
                  </button>
                  <button
                    className={`h-10 rounded text-xs font-semibold transition ${
                      action !== '' || !bank || bank.status !== 'ALLOWLISTED' || (wallet?.availableAmount ?? 0) <= 0
                        ? 'bg-[#f5f5f5] text-[#999999] border border-[#e8e8e8] cursor-not-allowed'
                        : 'border border-[#ee4d2d] bg-[#fef6f5] text-[#ee4d2d] hover:bg-[#ee4d2d] hover:text-white shadow-xs'
                    }`}
                    disabled={action !== '' || !bank || bank.status !== 'ALLOWLISTED' || (wallet?.availableAmount ?? 0) <= 0}
                    onClick={() => void requestRefund()}
                  >
                    {action === 'payout' ? 'Đang gửi...' : `Yêu cầu chuyển ${money(wallet?.availableAmount ?? 0)}`}
                  </button>
                  {bank?.status !== 'ALLOWLISTED' && (
                    <p className="text-[11px] text-[#757575]">Tài khoản phải được Admin xác minh trước khi chuyển tiền.</p>
                  )}
                </div>
              </div>
              <Table
                title="Yêu cầu chuyển tiền"
                empty="Chưa có yêu cầu."
                rows={payouts.map((p) => [date(p?.requestedAt), money(p?.amount), p?.status ?? '—'])}
              />
            </section>
            <Table
              title="Lịch sử ví"
              empty="Chưa có khoản hoàn tiền."
              rows={transactions.map((t) => [date(t?.occurredAt), t?.type ?? '—', shortReference(t?.referenceId), money(t?.amount)])}
            />
          </>
        )}
      </main>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#e8e8e8] bg-white p-4 shadow-xs">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#757575]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[#222222]">{value}</p>
    </div>
  );
}

function Table({ title, empty, rows }: { title: string; empty: string; rows: (string | number)[][] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#e8e8e8] bg-white shadow-xs">
      <h2 className="border-b border-[#e8e8e8] bg-[#fafafa] px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#333333]">{title}</h2>
      {rows.length === 0 ? (
        <p className="p-8 text-center text-xs text-[#757575]">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <tbody className="divide-y divide-[#f0f0f0]">
              {rows.map((row, index) => (
                <tr key={index} className="hover:bg-[#fafafa]">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-4 py-2.5 text-[#333333]">
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
