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
      setNotice('Đã lưu tài khoản. Tài khoản cần được xác minh trước khi bạn chuyển tiền hoàn.');
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
      setNotice('Đã tiếp nhận yêu cầu. Trạng thái sẽ tự cập nhật khi tiền được chuyển thành công.');
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không tạo được yêu cầu hoàn tiền.');
    } finally {
      setAction('');
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f6f6] text-slate-900">
      <Header keywords={keywords} />
      <main className="mx-auto w-full max-w-[1200px] space-y-4 px-3 py-5 md:px-4 md:py-7">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ee4d2d]">Tài chính cá nhân</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Ví eMall</h1>
            <p className="mt-1 text-sm text-slate-500">Theo dõi tiền hoàn và chuyển tiền hoàn về tài khoản ngân hàng của bạn.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || action !== ''}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#ee4d2d] hover:text-[#ee4d2d] disabled:opacity-50"
          >
            Làm mới
          </button>
        </header>
        {notice && (
          <div role="status" className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 shadow-sm">
            {notice}
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">Đang tải thông tin ví...</div>
        ) : (
          <>
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
                <div className="p-5 md:p-7">
                  <p className="text-sm font-medium text-slate-500">Số dư có thể chuyển</p>
                  <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">{money(wallet?.availableAmount ?? 0)}</p>
                  <p className="mt-2 max-w-xl text-xs leading-5 text-slate-500">
                    Đây là khoản hoàn tiền đã ghi nhận vào ví và sẵn sàng chuyển về ngân hàng.
                  </p>
                  <button
                    className="mt-5 rounded-lg bg-[#ee4d2d] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#d94324] disabled:cursor-not-allowed disabled:bg-slate-300"
                    disabled={action !== '' || !bank || bank.status !== 'ALLOWLISTED' || (wallet?.availableAmount ?? 0) <= 0}
                    onClick={() => void requestRefund()}
                  >
                    {action === 'payout' ? 'Đang gửi yêu cầu...' : 'Chuyển tiền hoàn về ngân hàng'}
                  </button>
                  {bank?.status !== 'ALLOWLISTED' ? (
                    <p className="mt-2 text-xs text-slate-500">Cần có tài khoản ngân hàng đã xác minh để sử dụng chức năng này.</p>
                  ) : null}
                </div>
                <div className="border-t border-slate-200 bg-slate-50/60 p-5 lg:border-l lg:border-t-0 md:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-800">Tài khoản nhận tiền</p>
                    {bank ? <StatusBadge label={bankStatusLabel(bank.status)} /> : null}
                  </div>
                  {bank ? (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                      <p className="font-semibold text-slate-900">{bank.bankCode}</p>
                      <p className="mt-2 text-lg tracking-[0.18em] text-slate-700">{bank.maskedAccountNumber.replace('****', '•••• ')}</p>
                      <p className="mt-3 truncate text-xs uppercase tracking-wide text-slate-500">{bank.accountHolderName}</p>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm leading-6 text-slate-500">
                      Bạn chưa thiết lập tài khoản nhận tiền.
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-3">
              <Card label="Có thể chuyển" value={money(wallet?.availableAmount ?? 0)} note="Sẵn sàng chuyển về ngân hàng" />
              <Card label="Đang chuyển" value={money(wallet?.payoutPendingAmount ?? 0)} note="Yêu cầu đang được xử lý" />
              <Card label="Đã chuyển" value={money(wallet?.totalPaidOut ?? 0)} note="Tổng tiền đã về ngân hàng" />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Thiết lập tài khoản nhận tiền</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Thông tin phải trùng khớp với tài khoản ngân hàng chính chủ.</p>
                <div className="mt-4 grid gap-3">
                  <input
                    className="h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-[#ee4d2d]"
                    placeholder="Mã ngân hàng, ví dụ VCB"
                    value={form.bankCode}
                    onChange={(e) => setForm({ ...form, bankCode: e.target.value.toUpperCase() })}
                  />
                  <input
                    className="h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-[#ee4d2d]"
                    placeholder={bank ? 'Nhập số tài khoản mới nếu muốn thay đổi' : 'Số tài khoản'}
                    value={form.accountNumber}
                    onChange={(e) => setForm({ ...form, accountNumber: e.target.value.replace(/\D/g, '') })}
                  />
                  <input
                    className="h-11 rounded-lg border border-slate-300 px-3 text-sm outline-none transition focus:border-[#ee4d2d]"
                    placeholder="Tên chủ tài khoản"
                    value={form.accountHolderName}
                    onChange={(e) => setForm({ ...form, accountHolderName: e.target.value.toUpperCase() })}
                  />
                  <button
                    className={`h-11 rounded-lg text-sm font-semibold transition ${
                      action !== '' || !form.bankCode || !form.accountNumber || !form.accountHolderName
                        ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                    disabled={action !== '' || !form.bankCode || !form.accountNumber || !form.accountHolderName}
                    onClick={() => void saveBank()}
                  >
                    {action === 'bank' ? 'Đang lưu...' : 'Lưu tài khoản'}
                  </button>
                </div>
              </div>
              <DataTable
                title="Yêu cầu chuyển tiền"
                empty="Chưa có yêu cầu."
                headers={['Thời gian', 'Số tiền', 'Trạng thái']}
                rows={payouts.map((p) => [date(p?.requestedAt), money(p?.amount), payoutStatusLabel(p?.status)])}
              />
            </section>
            <DataTable
              title="Lịch sử tiền hoàn"
              empty="Chưa có khoản hoàn tiền."
              headers={['Thời gian', 'Nội dung', 'Tham chiếu', 'Số tiền']}
              rows={transactions.map((t) => [date(t?.occurredAt), transactionLabel(t?.type), shortReference(t?.referenceId), money(t?.amount)])}
            />
          </>
        )}
      </main>
    </div>
  );
}

function Card({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{note}</p>
    </div>
  );
}

function DataTable({ title, empty, headers, rows }: { title: string; empty: string; headers: string[]; rows: (string | number)[][] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <h2 className="border-b border-slate-200 px-4 py-3 text-base font-semibold text-slate-900">{title}</h2>
      {rows.length === 0 ? (
        <p className="p-10 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {headers.map((header) => (
                  <th key={header} className="px-4 py-3 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, index) => (
                <tr key={index} className="hover:bg-slate-50/70">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="whitespace-nowrap px-4 py-3 text-slate-700">
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

function StatusBadge({ label }: { label: string }) {
  return <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">{label}</span>;
}

function bankStatusLabel(status: BuyerWalletBankAccount['status']): string {
  if (status === 'ALLOWLISTED') return 'Đã xác minh';
  if (status === 'DISABLED') return 'Đã khóa';
  return 'Chờ xác minh';
}

function payoutStatusLabel(status: BuyerRefundPayout['status'] | undefined): string {
  if (status === 'REQUESTED') return 'Đã tiếp nhận';
  if (status === 'PROCESSING') return 'Đang chuyển';
  if (status === 'SUCCEEDED') return 'Đã chuyển';
  if (status === 'FAILED') return 'Chuyển thất bại';
  if (status === 'CANCELLED') return 'Đã hủy';
  return '—';
}

function transactionLabel(type: string | undefined): string {
  const labels: Record<string, string> = {
    PAYMENT_REFUND: 'Hoàn tiền đơn hàng',
    PAYOUT_REQUESTED: 'Yêu cầu chuyển tiền',
    PAYOUT_SUCCEEDED: 'Đã chuyển về ngân hàng',
    PAYOUT_FAILED: 'Hoàn lại số dư'
  };
  return type ? (labels[type] ?? type) : '—';
}
