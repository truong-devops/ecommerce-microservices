'use client';

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FinanceAlert, FinanceEmptyState, FinanceLoadingRows, FinancePageShell } from '@/components/finance/finance-page-shell';
import { SellerApiClientError } from '@/lib/api/client';
import type {
  SellerBankAccount,
  SellerPayout,
  SellerPayoutListOutput,
  SellerWalletBalance,
  SellerWalletTransaction,
  SellerWalletTransactionListOutput,
  SellerWalletTransactionType
} from '@/lib/api/types';
import { createSellerPayout, getSellerBankAccount, getSellerWallet, listSellerPayouts, listSellerWalletTransactions } from '@/lib/api/wallet';
import { bankDisplayName, formatDateTime, formatVnd, payoutStatus, transactionDescription, transactionLabel } from '@/lib/finance-format';

const transactionTypes: SellerWalletTransactionType[] = [
  'PAYMENT_HELD',
  'FUNDS_RELEASED',
  'PAYMENT_REFUND',
  'CHARGEBACK',
  'PAYOUT_REQUESTED',
  'PAYOUT_SUCCEEDED',
  'PAYOUT_FAILED'
];
type CashflowFilter = 'ALL' | 'IN' | 'OUT';

export default function FinanceBalancePage() {
  return <FinancePageShell current="Số dư eMall">{({ accessToken }) => <BalanceContent accessToken={accessToken} />}</FinancePageShell>;
}

function BalanceContent({ accessToken }: { accessToken: string }) {
  const [wallet, setWallet] = useState<SellerWalletBalance | null>(null);
  const [bankAccount, setBankAccount] = useState<SellerBankAccount | null>(null);
  const [transactions, setTransactions] = useState<SellerWalletTransactionListOutput>(emptyTransactions());
  const [payouts, setPayouts] = useState<SellerPayoutListOutput>(emptyPayouts());
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [cashflow, setCashflow] = useState<CashflowFilter>('ALL');
  const [selectedTypes, setSelectedTypes] = useState<Set<SellerWalletTransactionType>>(() => new Set(transactionTypes));
  const [search, setSearch] = useState('');
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [submittingPayout, setSubmittingPayout] = useState(false);
  const idempotencyKeyRef = useRef('');

  const loadData = useCallback(
    async (quiet = false) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      setError('');
      try {
        const bankPromise = getSellerBankAccount(accessToken).catch((loadError: unknown) => {
          if (loadError instanceof SellerApiClientError && loadError.code === 'BANK_ACCOUNT_NOT_FOUND') return null;
          throw loadError;
        });
        const [nextWallet, nextBank, nextTransactions, nextPayouts] = await Promise.all([
          getSellerWallet(accessToken),
          bankPromise,
          listSellerWalletTransactions(accessToken, { page, pageSize: 20 }),
          listSellerPayouts(accessToken, { page: 1, pageSize: 5 })
        ]);
        setWallet(nextWallet);
        setBankAccount(nextBank);
        setTransactions(nextTransactions);
        setPayouts(nextPayouts);
      } catch (loadError) {
        setError(toMessage(loadError, 'Không thể tải dữ liệu số dư.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken, page]
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!payouts.items.some((item) => item.status === 'REQUESTED' || item.status === 'PROCESSING')) return;
    const interval = window.setInterval(() => {
      void loadData(true);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [payouts.items, loadData]);

  const filteredTransactions = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return transactions.items.filter((item) => {
      if (!selectedTypes.has(item.type)) return false;
      if (cashflow === 'IN' && item.amount <= 0) return false;
      if (cashflow === 'OUT' && item.amount >= 0) return false;
      if (needle && !`${transactionLabel(item.type)} ${item.referenceId}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [cashflow, search, selectedTypes, transactions.items]);

  const openPayout = () => {
    setMessage('');
    setError('');
    setPayoutAmount('');
    idempotencyKeyRef.current = '';
    setPayoutDialogOpen(true);
  };

  const submitPayout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!wallet || !bankAccount) return;
    const amount = Number(payoutAmount);
    if (!Number.isSafeInteger(amount) || amount < 10_000) {
      setError('Số tiền rút tối thiểu là 10.000 ₫.');
      return;
    }
    if (amount > wallet.availableAmount) {
      setError('Số tiền rút vượt quá số dư khả dụng.');
      return;
    }
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = createIdempotencyKey();

    setSubmittingPayout(true);
    setError('');
    try {
      const payout = await createSellerPayout(accessToken, { amount, currency: 'VND' }, idempotencyKeyRef.current);
      setPayoutDialogOpen(false);
      setPayoutAmount('');
      idempotencyKeyRef.current = '';
      setMessage(`Đã tiếp nhận yêu cầu rút ${formatVnd(payout.amount)}. Trạng thái sẽ tự động cập nhật.`);
      setPage(1);
      await loadData(true);
    } catch (submitError) {
      setError(toMessage(submitError, 'Không thể gửi yêu cầu rút tiền. Bạn có thể thử lại an toàn.'));
    } finally {
      setSubmittingPayout(false);
    }
  };

  const canPayout = Boolean(wallet && bankAccount && bankAccount.status !== 'DISABLED' && !wallet.isFrozen && wallet.availableAmount >= 10_000);

  return (
    <section className="space-y-3 text-sm">
      {error && !payoutDialogOpen ? (
        <FinanceAlert tone="error">
          {error}{' '}
          <button type="button" className="ml-2 font-semibold underline" onClick={() => void loadData()}>
            Thử lại
          </button>
        </FinanceAlert>
      ) : null}
      {message ? <FinanceAlert tone="success">{message}</FinanceAlert> : null}
      {wallet?.isFrozen ? (
        <FinanceAlert tone="error">
          <strong>Ví đang bị khóa.</strong> Shop hiện có khoản điều chỉnh âm hoặc cần đối soát. Yêu cầu rút tiền mới tạm thời không khả dụng.
        </FinanceAlert>
      ) : null}

      <article className="overflow-hidden rounded-md border border-slate-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 lg:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ee4d2d]">Tài chính shop</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">Số dư eMall</h1>
            <p className="mt-1 text-sm text-slate-500">Theo dõi tiền đang giữ, tiền có thể rút và lịch sử thanh toán.</p>
          </div>
          <button
            type="button"
            disabled={refreshing}
            onClick={() => void loadData(true)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-60"
          >
            {refreshing ? 'Đang cập nhật...' : 'Làm mới'}
          </button>
        </div>

        {loading && !wallet ? (
          <div className="h-52 animate-pulse bg-slate-50" />
        ) : (
          <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
            <div className="bg-gradient-to-br from-[#fff8f5] to-white p-5 lg:p-6">
              <p className="text-sm font-medium text-slate-500">Có thể rút</p>
              <p
                className={`mt-2 text-4xl font-semibold tracking-tight ${wallet && wallet.availableAmount < 0 ? 'text-rose-600' : 'text-slate-900'}`}
              >
                {formatVnd(wallet?.availableAmount ?? 0)}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={openPayout}
                  disabled={!canPayout}
                  className="rounded-md bg-[#ee4d2d] px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-[#db4729] disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Yêu cầu rút tiền
                </button>
                {!bankAccount ? (
                  <Link href="/finance/bank-account" className="font-medium text-[#2563eb] hover:underline">
                    Thêm tài khoản ngân hàng →
                  </Link>
                ) : null}
                {wallet && wallet.availableAmount > 0 && wallet.availableAmount < 10_000 ? (
                  <span className="text-xs text-amber-700">Tối thiểu 10.000 ₫ để rút</span>
                ) : null}
              </div>
            </div>
            <div className="border-t border-slate-200 p-5 lg:border-l lg:border-t-0 lg:p-6">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-slate-800">Tài khoản nhận tiền</p>
                <Link href="/finance/bank-account" className="text-xs font-medium text-[#2563eb] hover:underline">
                  Quản lý
                </Link>
              </div>
              {bankAccount ? (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="font-semibold text-slate-800">{bankDisplayName(bankAccount.bankCode)}</p>
                  <p className="mt-1 text-lg tracking-[0.18em] text-slate-700">{bankAccount.maskedAccountNumber.replace('****', '•••• ')}</p>
                  <p className="mt-2 truncate text-xs uppercase tracking-wide text-slate-500">{bankAccount.accountHolderName}</p>
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-xs leading-5 text-slate-500">
                  Chưa có tài khoản ngân hàng. Hãy thêm tài khoản để mở chức năng rút tiền.
                </div>
              )}
            </div>
          </div>
        )}
      </article>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <BalanceCard label="Đang tạm giữ" value={wallet?.heldAmount ?? 0} note="Chờ đơn giao và hết thời gian giữ" tone="amber" />
        <BalanceCard label="Có thể rút" value={wallet?.availableAmount ?? 0} note="Sẵn sàng tạo yêu cầu rút" tone="green" />
        <BalanceCard label="Đang chuyển" value={wallet?.payoutPendingAmount ?? 0} note="Đối tác thanh toán đang xử lý" tone="blue" />
        <BalanceCard label="Đã thanh toán" value={wallet?.totalPaidOut ?? 0} note="Tổng tiền đã rút thành công" tone="slate" />
      </div>

      <article className="rounded-md border border-slate-200 bg-white p-4 lg:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Yêu cầu rút gần đây</h2>
            <p className="mt-1 text-xs text-slate-500">Tự động cập nhật mỗi 5 giây khi có yêu cầu đang xử lý.</p>
          </div>
          <Link href="/finance/revenue" className="text-sm font-medium text-[#2563eb] hover:underline">
            Xem báo cáo tài chính →
          </Link>
        </div>
        <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Thời gian</th>
                  <th className="px-4 py-3 font-medium">Tài khoản</th>
                  <th className="px-4 py-3 text-right font-medium">Số tiền</th>
                  <th className="px-4 py-3 text-center font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4}>
                      <FinanceLoadingRows rows={3} />
                    </td>
                  </tr>
                ) : payouts.items.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <FinanceEmptyState title="Chưa có yêu cầu rút tiền" description="Yêu cầu đầu tiên sẽ xuất hiện tại đây sau khi bạn gửi." />
                    </td>
                  </tr>
                ) : (
                  payouts.items.map((item) => <PayoutRow key={item.id} payout={item} />)
                )}
              </tbody>
            </table>
          </div>
        </div>
      </article>

      <article className="rounded-md border border-slate-200 bg-white p-4 lg:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Lịch sử số dư</h2>
            <p className="mt-1 text-xs text-slate-500">Mỗi dòng tương ứng với một nghiệp vụ đã được ghi vào sổ cái.</p>
          </div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo mã tham chiếu"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#ee4d2d] sm:w-64"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <FilterButton active={cashflow === 'ALL'} onClick={() => setCashflow('ALL')}>
            Tất cả
          </FilterButton>
          <FilterButton active={cashflow === 'IN'} onClick={() => setCashflow('IN')}>
            Tiền vào
          </FilterButton>
          <FilterButton active={cashflow === 'OUT'} onClick={() => setCashflow('OUT')}>
            Tiền ra
          </FilterButton>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-b border-slate-100 pb-4">
          {transactionTypes.map((type) => (
            <label key={type} className="inline-flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#ee4d2d]"
                checked={selectedTypes.has(type)}
                onChange={(event) =>
                  setSelectedTypes((old) => {
                    const next = new Set(old);
                    if (event.target.checked) next.add(type);
                    else next.delete(type);
                    return next;
                  })
                }
              />
              {transactionLabel(type)}
            </label>
          ))}
        </div>
        <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Thời gian</th>
                  <th className="px-4 py-3 font-medium">Nghiệp vụ</th>
                  <th className="px-4 py-3 font-medium">Tham chiếu</th>
                  <th className="px-4 py-3 text-right font-medium">Biến động</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4}>
                      <FinanceLoadingRows />
                    </td>
                  </tr>
                ) : filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <FinanceEmptyState
                        title="Không có giao dịch phù hợp"
                        description="Thử thay đổi bộ lọc hoặc chờ hệ thống ghi nhận doanh thu mới."
                      />
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((item) => <TransactionRow key={item.id} item={item} />)
                )}
              </tbody>
            </table>
          </div>
        </div>
        <Pagination page={transactions.pagination.page} totalPages={transactions.pagination.totalPages} onPage={setPage} />
      </article>

      {payoutDialogOpen && wallet && bankAccount ? (
        <PayoutDialog
          wallet={wallet}
          bankAccount={bankAccount}
          amount={payoutAmount}
          setAmount={(value) => {
            setPayoutAmount(value);
            setError('');
            idempotencyKeyRef.current = '';
          }}
          submitting={submittingPayout}
          error={error}
          onClose={() => {
            if (!submittingPayout) {
              setPayoutDialogOpen(false);
              setError('');
            }
          }}
          onSubmit={submitPayout}
        />
      ) : null}
    </section>
  );
}

function BalanceCard({ label, value, note, tone }: { label: string; value: number; note: string; tone: 'amber' | 'green' | 'blue' | 'slate' }) {
  const dot = { amber: 'bg-amber-400', green: 'bg-emerald-500', blue: 'bg-sky-500', slate: 'bg-slate-500' }[tone];
  return (
    <article className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <p className="text-sm font-medium text-slate-600">{label}</p>
      </div>
      <p className={`mt-3 text-2xl font-semibold ${value < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{formatVnd(value)}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{note}</p>
    </article>
  );
}

function PayoutRow({ payout }: { payout: SellerPayout }) {
  const status = payoutStatus(payout.status);
  return (
    <tr className="border-t border-slate-100 text-sm text-slate-700">
      <td className="px-4 py-3">{formatDateTime(payout.requestedAt)}</td>
      <td className="px-4 py-3">
        <p className="font-medium">
          {payout.bankCode} · {payout.maskedAccountNumber}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">{payout.id.slice(0, 8).toUpperCase()}</p>
      </td>
      <td className="px-4 py-3 text-right font-semibold">{formatVnd(payout.amount)}</td>
      <td className="px-4 py-3 text-center">
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
        {payout.failureMessage ? <p className="mt-1 text-xs text-rose-600">{payout.failureMessage}</p> : null}
      </td>
    </tr>
  );
}

function TransactionRow({ item }: { item: SellerWalletTransaction }) {
  return (
    <tr className="border-t border-slate-100 text-sm text-slate-700">
      <td className="px-4 py-3">{formatDateTime(item.occurredAt)}</td>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-800">{transactionLabel(item.type)}</p>
        <p className="mt-0.5 text-xs text-slate-400">{transactionDescription(item.type)}</p>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-slate-500">
        {item.referenceId.length > 24 ? `${item.referenceId.slice(0, 12)}…${item.referenceId.slice(-8)}` : item.referenceId}
      </td>
      <td
        className={`px-4 py-3 text-right font-semibold ${item.amount > 0 ? 'text-emerald-600' : item.amount < 0 ? 'text-rose-600' : 'text-slate-700'}`}
      >
        {item.amount > 0 ? '+' : ''}
        {formatVnd(item.amount)}
      </td>
    </tr>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${active ? 'border-[#ee4d2d] bg-[#fff5f2] text-[#ee4d2d]' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
    >
      {children}
    </button>
  );
}

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-2">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
      >
        Trước
      </button>
      <span className="text-xs text-slate-500">
        Trang {page}/{totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
      >
        Sau
      </button>
    </div>
  );
}

function PayoutDialog({
  wallet,
  bankAccount,
  amount,
  setAmount,
  submitting,
  error,
  onClose,
  onSubmit
}: {
  wallet: SellerWalletBalance;
  bankAccount: SellerBankAccount;
  amount: string;
  setAmount: (value: string) => void;
  submitting: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payout-dialog-title"
        className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="payout-dialog-title" className="text-lg font-semibold text-slate-900">
              Yêu cầu rút tiền
            </h2>
            <p className="mt-1 text-xs text-slate-500">Hệ thống sẽ tự động xử lý sau khi gửi.</p>
          </div>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md p-1 text-xl text-slate-400 hover:bg-slate-100"
          >
            ×
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          {error ? <FinanceAlert tone="error">{error}</FinanceAlert> : null}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Số dư khả dụng</span>
              <strong className="text-slate-900">{formatVnd(wallet.availableAmount)}</strong>
            </div>
            <div className="mt-2 flex justify-between gap-3">
              <span className="text-slate-500">Nhận tại</span>
              <span className="text-right font-medium">
                {bankDisplayName(bankAccount.bankCode)} · {bankAccount.maskedAccountNumber}
              </span>
            </div>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Số tiền muốn rút
            <input
              type="number"
              min={10000}
              max={Math.max(10000, wallet.availableAmount)}
              step={1000}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Tối thiểu 10.000"
              required
              autoFocus
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-3 text-lg font-semibold outline-none focus:border-[#ee4d2d]"
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[0.25, 0.5, 1].map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => setAmount(String(Math.floor((wallet.availableAmount * ratio) / 1000) * 1000))}
                className="rounded-md border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-600 hover:border-[#ee4d2d] hover:text-[#ee4d2d]"
              >
                {ratio === 1 ? 'Toàn bộ' : `${ratio * 100}%`}
              </button>
            ))}
          </div>
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
            Sau khi xác nhận, tiền được chuyển sang trạng thái đang xử lý. Nếu đối tác thanh toán từ chối, hệ thống tự hoàn lại vào số dư khả dụng.
          </p>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-md border border-slate-300 px-4 py-2 font-semibold text-slate-700"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-[#ee4d2d] px-5 py-2 font-semibold text-white hover:bg-[#db4729] disabled:opacity-60"
            >
              {submitting ? 'Đang gửi...' : 'Xác nhận rút'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function createIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `seller-payout-${crypto.randomUUID()}`
    : `seller-payout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function emptyTransactions(): SellerWalletTransactionListOutput {
  return { items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } };
}
function emptyPayouts(): SellerPayoutListOutput {
  return { items: [], pagination: { page: 1, pageSize: 5, totalItems: 0, totalPages: 0 } };
}
function toMessage(error: unknown, fallback: string): string {
  return error instanceof SellerApiClientError ? translateWalletError(error.code, error.message) : fallback;
}
function translateWalletError(code: string, message: string): string {
  const messages: Record<string, string> = {
    PAYOUT_DISABLED: 'Hệ thống đang tạm dừng rút tiền.',
    WALLET_FROZEN: 'Ví đang bị khóa để đối soát.',
    INSUFFICIENT_AVAILABLE_BALANCE: 'Số dư khả dụng không đủ.',
    BANK_ACCOUNT_NOT_FOUND: 'Bạn cần thêm tài khoản ngân hàng trước.',
    IDEMPOTENCY_CONFLICT: 'Yêu cầu này đã được dùng với số tiền khác.'
  };
  return messages[code] ?? message;
}
