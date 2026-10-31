'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FinanceAlert, FinanceEmptyState, FinanceLoadingRows, FinancePageShell } from '@/components/finance/finance-page-shell';
import { SellerApiClientError } from '@/lib/api/client';
import type { SellerBankAccount, SellerPayout, SellerPayoutSummary, SellerWalletBalance, SellerWalletTransaction } from '@/lib/api/types';
import { getSellerBankAccount, getSellerPayoutSummary, getSellerWallet, listSellerPayouts, listSellerWalletTransactions } from '@/lib/api/wallet';
import { bankDisplayName, formatDateTime, formatVnd, payoutStatus, transactionDescription, transactionLabel } from '@/lib/finance-format';

type DetailTab = 'ledger' | 'payouts';

export default function FinanceRevenuePage() {
  return <FinancePageShell current="Doanh thu">{({ accessToken }) => <RevenueContent accessToken={accessToken} />}</FinancePageShell>;
}

function RevenueContent({ accessToken }: { accessToken: string }) {
  const [wallet, setWallet] = useState<SellerWalletBalance | null>(null);
  const [bank, setBank] = useState<SellerBankAccount | null>(null);
  const [transactions, setTransactions] = useState<SellerWalletTransaction[]>([]);
  const [payouts, setPayouts] = useState<SellerPayout[]>([]);
  const [summary, setSummary] = useState<SellerPayoutSummary | null>(null);
  const [tab, setTab] = useState<DetailTab>('ledger');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const bankPromise = getSellerBankAccount(accessToken).catch((loadError: unknown) => {
        if (loadError instanceof SellerApiClientError && loadError.code === 'BANK_ACCOUNT_NOT_FOUND') return null;
        throw loadError;
      });
      const [nextWallet, nextBank, transactionResult, payoutResult, nextSummary] = await Promise.all([
        getSellerWallet(accessToken),
        bankPromise,
        listSellerWalletTransactions(accessToken, { page: 1, pageSize: 100 }),
        listSellerPayouts(accessToken, { page: 1, pageSize: 100 }),
        getSellerPayoutSummary(accessToken, startOfWeek(), startOfMonth())
      ]);
      setWallet(nextWallet);
      setBank(nextBank);
      setTransactions(transactionResult.items);
      setPayouts(payoutResult.items);
      setSummary(nextSummary);
    } catch (loadError) {
      setError(loadError instanceof SellerApiClientError ? loadError.message : 'Không thể tải báo cáo doanh thu.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleTransactions = useMemo(
    () =>
      transactions.filter((item) => !normalizedQuery || `${transactionLabel(item.type)} ${item.referenceId}`.toLowerCase().includes(normalizedQuery)),
    [normalizedQuery, transactions]
  );
  const visiblePayouts = useMemo(
    () =>
      payouts.filter((item) => !normalizedQuery || `${item.id} ${item.bankCode} ${item.maskedAccountNumber}`.toLowerCase().includes(normalizedQuery)),
    [normalizedQuery, payouts]
  );

  return (
    <section className="space-y-3 text-sm">
      {error ? (
        <FinanceAlert tone="error">
          {error}{' '}
          <button type="button" onClick={() => void load()} className="ml-2 font-semibold underline">
            Thử lại
          </button>
        </FinanceAlert>
      ) : null}

      <article className="rounded-md border border-slate-200 bg-white p-4 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ee4d2d]">Báo cáo tài chính</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">Doanh thu của shop</h1>
            <p className="mt-1 text-sm text-slate-500">Số liệu lấy trực tiếp từ sổ giao dịch ví, không bao gồm dữ liệu ước tính.</p>
          </div>
          <button
            type="button"
            disabled={loading || transactions.length === 0}
            onClick={() => exportTransactions(transactions)}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#ee4d2d] hover:text-[#ee4d2d] disabled:opacity-40"
          >
            Xuất CSV
          </button>
        </div>

        {loading && !wallet ? (
          <div className="mt-4 h-40 animate-pulse rounded-lg bg-slate-100" />
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Đang tạm giữ" value={wallet?.heldAmount ?? 0} hint="Chờ đủ điều kiện giải ngân" />
            <SummaryCard label="Sẵn sàng rút" value={wallet?.availableAmount ?? 0} hint="Đang nằm trong số dư khả dụng" />
            <SummaryCard label="Đang chuyển về ngân hàng" value={wallet?.payoutPendingAmount ?? 0} hint="Yêu cầu đang được xử lý" />
            <SummaryCard label="Đã chuyển về ngân hàng" value={wallet?.totalPaidOut ?? 0} hint="Tổng tiền đã rút thành công" />
          </div>
        )}
      </article>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <article className="rounded-md border border-slate-200 bg-white p-4 lg:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Tiền đã chuyển về ngân hàng</h2>
              <p className="mt-1 text-xs text-slate-500">Tổng hợp từ các yêu cầu rút tiền thành công.</p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">Dữ liệu thực</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <PaidMetric label="Tuần này" value={summary?.paidThisWeek ?? 0} />
            <PaidMetric label="Tháng này" value={summary?.paidThisMonth ?? 0} />
            <PaidMetric label="Tổng cộng" value={summary?.totalPaidOut ?? wallet?.totalPaidOut ?? 0} />
          </div>
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500">Tài khoản nhận tiền</p>
                {bank ? (
                  <p className="mt-1 font-semibold text-slate-800">
                    {bankDisplayName(bank.bankCode)} · {bank.maskedAccountNumber}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-amber-700">Chưa thiết lập</p>
                )}
              </div>
              <Link href={bank ? '/finance/balance' : '/finance/bank-account'} className="font-medium text-[#2563eb] hover:underline">
                {bank ? 'Đi đến số dư →' : 'Thiết lập ngay →'}
              </Link>
            </div>
          </div>
        </article>

        <article className="rounded-md border border-slate-200 bg-white p-4 lg:p-5">
          <h2 className="text-lg font-semibold text-slate-900">Chu kỳ dòng tiền</h2>
          <ol className="mt-4 space-y-4">
            <FlowStep number="1" title="Khách thanh toán" text="Doanh thu được ghi nhận vào tiền đang tạm giữ." />
            <FlowStep number="2" title="Đơn được giao" text="Hệ thống bắt đầu tính thời gian giữ tiền." />
            <FlowStep number="3" title="Tiền khả dụng" text="Shop có thể tạo yêu cầu rút về ngân hàng." />
            <FlowStep number="4" title="Chuyển về ngân hàng" text="Hoàn tất giao dịch hoặc tự hoàn số dư nếu thất bại." />
          </ol>
        </article>
      </div>

      <article className="rounded-md border border-slate-200 bg-white p-4 lg:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex gap-5">
            <TabButton active={tab === 'ledger'} onClick={() => setTab('ledger')}>
              Biến động doanh thu
            </TabButton>
            <TabButton active={tab === 'payouts'} onClick={() => setTab('payouts')}>
              Lịch sử rút tiền
            </TabButton>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === 'ledger' ? 'Tìm mã tham chiếu' : 'Tìm mã rút tiền / ngân hàng'}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#ee4d2d] sm:w-64"
          />
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
          <div className="overflow-x-auto">
            {tab === 'ledger' ? (
              <LedgerTable loading={loading} items={visibleTransactions} />
            ) : (
              <PayoutTable loading={loading} items={visiblePayouts} />
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400">Hiển thị tối đa 100 bản ghi mới nhất. Số liệu được cập nhật khi tải lại trang.</p>
      </article>
    </section>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-md border border-slate-200 border-t-2 border-t-[#ee4d2d] p-4">
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${value < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{formatVnd(value)}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{hint}</p>
    </div>
  );
}

function PaidMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-900">{formatVnd(value)}</p>
    </div>
  );
}
function FlowStep({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#fff0eb] text-xs font-bold text-[#ee4d2d]">{number}</span>
      <div>
        <p className="font-semibold text-slate-800">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{text}</p>
      </div>
    </li>
  );
}
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-[3px] pb-2 text-sm font-semibold ${active ? 'border-[#ee4d2d] text-[#ee4d2d]' : 'border-transparent text-slate-600'}`}
    >
      {children}
    </button>
  );
}

function LedgerTable({ loading, items }: { loading: boolean; items: SellerWalletTransaction[] }) {
  return (
    <table className="w-full min-w-[850px] text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th className="px-4 py-3 font-medium">Ngày ghi nhận</th>
          <th className="px-4 py-3 font-medium">Nghiệp vụ</th>
          <th className="px-4 py-3 font-medium">Tham chiếu</th>
          <th className="px-4 py-3 text-right font-medium">Số tiền</th>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr>
            <td colSpan={4}>
              <FinanceLoadingRows />
            </td>
          </tr>
        ) : items.length === 0 ? (
          <tr>
            <td colSpan={4}>
              <FinanceEmptyState title="Chưa có biến động doanh thu" description="Dữ liệu sẽ xuất hiện khi khoản thanh toán được ghi nhận vào ví." />
            </td>
          </tr>
        ) : (
          items.map((item) => (
            <tr key={item.id} className="border-t border-slate-100">
              <td className="px-4 py-3 text-slate-600">{formatDateTime(item.occurredAt)}</td>
              <td className="px-4 py-3">
                <p className="font-medium text-slate-800">{transactionLabel(item.type)}</p>
                <p className="mt-0.5 text-xs text-slate-400">{transactionDescription(item.type)}</p>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-500">{shortId(item.referenceId)}</td>
              <td
                className={`px-4 py-3 text-right font-semibold ${
                  item.amount > 0 ? 'text-emerald-600' : item.amount < 0 ? 'text-rose-600' : 'text-slate-500'
                }`}
              >
                {item.amount > 0 ? '+' : ''}
                {formatVnd(item.amount)}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function PayoutTable({ loading, items }: { loading: boolean; items: SellerPayout[] }) {
  return (
    <table className="w-full min-w-[900px] text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th className="px-4 py-3 font-medium">Yêu cầu lúc</th>
          <th className="px-4 py-3 font-medium">Mã rút tiền</th>
          <th className="px-4 py-3 font-medium">Tài khoản nhận</th>
          <th className="px-4 py-3 text-right font-medium">Số tiền</th>
          <th className="px-4 py-3 text-center font-medium">Trạng thái</th>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr>
            <td colSpan={5}>
              <FinanceLoadingRows />
            </td>
          </tr>
        ) : items.length === 0 ? (
          <tr>
            <td colSpan={5}>
              <FinanceEmptyState title="Chưa có lịch sử rút tiền" description="Các yêu cầu rút tiền sẽ được theo dõi tại đây." />
            </td>
          </tr>
        ) : (
          items.map((item) => {
            const status = payoutStatus(item.status);
            return (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-4 py-3 text-slate-600">{formatDateTime(item.requestedAt)}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{item.id.slice(0, 8).toUpperCase()}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{bankDisplayName(item.bankCode)}</p>
                  <p className="text-xs text-slate-400">{item.maskedAccountNumber}</p>
                </td>
                <td className="px-4 py-3 text-right font-semibold">{formatVnd(item.amount)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

function startOfWeek(): Date {
  const now = new Date();
  const day = now.getDay() || 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
}
function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
function shortId(value: string): string {
  return value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;
}

function exportTransactions(items: SellerWalletTransaction[]) {
  const rows = [
    ['Thời gian', 'Nghiệp vụ', 'Loại', 'Mã tham chiếu', 'Số tiền', 'Tiền tệ'],
    ...items.map((item) => [item.occurredAt, transactionLabel(item.type), item.type, item.referenceId, String(item.amount), item.currency])
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `bao-cao-doanh-thu-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
