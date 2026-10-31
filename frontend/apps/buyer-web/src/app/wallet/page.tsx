'use client';

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
import type {
  BuyerRefundPayout,
  BuyerWalletBalance,
  BuyerWalletBankAccount,
  BuyerWalletTransaction
} from '@/lib/api/types';

const keywords = ['Ví eMall', 'Hoàn tiền', 'Đơn mua', 'Shopee Video', 'Khuyến mãi'];

const bankOptions = [
  ['VCB', 'Vietcombank'],
  ['TCB', 'Techcombank'],
  ['MB', 'MB Bank'],
  ['ACB', 'ACB'],
  ['BIDV', 'BIDV'],
  ['VTB', 'VietinBank'],
  ['VPB', 'VPBank'],
  ['TPB', 'TPBank'],
  ['STB', 'Sacombank'],
  ['VIB', 'VIB'],
  ['MSB', 'MSB'],
  ['OCB', 'OCB'],
  ['SHB', 'SHB']
] as const;

function bankDisplayName(code: string): string {
  const map: Record<string, string> = {
    VCB: 'Vietcombank',
    TCB: 'Techcombank',
    MB: 'MB Bank',
    ACB: 'ACB',
    BIDV: 'BIDV',
    VTB: 'VietinBank',
    VPB: 'VPBank',
    TPB: 'TPBank',
    STB: 'Sacombank',
    VIB: 'VIB',
    MSB: 'MSB',
    OCB: 'OCB',
    SHB: 'SHB'
  };
  return map[code.toUpperCase()] || code;
}

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(
    Number.isFinite(Number(value)) ? Number(value) : 0
  );

const date = (value: string | null | undefined) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(parsed);
};

const shortReference = (value: string | null | undefined) =>
  typeof value === 'string' && value ? (value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value) : '—';

const itemsOf = <T,>(page: { items?: T[] } | null | undefined): T[] => (Array.isArray(page?.items) ? page.items : []);

function payoutStatusBadge(status: string) {
  switch (status) {
    case 'SUCCEEDED':
      return { label: 'Thành công', className: 'border border-slate-200 bg-slate-50 text-slate-800' };
    case 'PROCESSING':
      return { label: 'Đang chuyển', className: 'border border-[#fed7aa] bg-[#fffaf5] text-[#c2410c]' };
    case 'FAILED':
      return { label: 'Thất bại', className: 'border border-rose-200 bg-rose-50 text-rose-700' };
    case 'CANCELLED':
      return { label: 'Đã hủy', className: 'border border-slate-200 bg-slate-50 text-slate-500' };
    case 'REQUESTED':
    default:
      return { label: 'Đã tiếp nhận', className: 'border border-[#fcdcd7] bg-[#fef6f5] text-[#ee4d2d]' };
  }
}

function transactionTypeLabel(type: string) {
  switch (type) {
    case 'PAYMENT_REFUND':
      return 'Hoàn tiền đơn hàng';
    case 'PAYOUT_REQUESTED':
      return 'Yêu cầu rút tiền';
    case 'PAYOUT_SUCCEEDED':
      return 'Rút tiền thành công';
    case 'PAYOUT_FAILED':
      return 'Hoàn lại tiền rút';
    case 'FUNDS_RELEASED':
      return 'Tiền khả dụng';
    default:
      return type;
  }
}

export default function BuyerWalletPage() {
  const router = useRouter();
  const { ready, user, accessToken } = useAuth();
  const [wallet, setWallet] = useState<BuyerWalletBalance | null>(null);
  const [bank, setBank] = useState<BuyerWalletBankAccount | null>(null);
  const [transactions, setTransactions] = useState<BuyerWalletTransaction[]>([]);
  const [payouts, setPayouts] = useState<BuyerRefundPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeTab, setActiveTab] = useState<'payouts' | 'transactions'>('payouts');

  // Bank Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ bankCode: '', accountNumber: '', accountHolderName: '' });

  // Custom withdraw amount state
  const [withdrawAmount, setWithdrawAmount] = useState('');

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

  const openBankDialog = () => {
    setForm({
      bankCode: bank?.bankCode ?? '',
      accountNumber: '',
      accountHolderName: bank?.accountHolderName ?? user?.name?.toUpperCase() ?? ''
    });
    setError('');
    setNotice('');
    setDialogOpen(true);
  };

  const handleSaveBank = async (event: FormEvent) => {
    event.preventDefault();
    if (!accessToken) return;
    const bankCode = form.bankCode.trim().toUpperCase();
    const accountNumber = form.accountNumber.replace(/\D/g, '');
    const accountHolderName = form.accountHolderName.trim().toUpperCase();

    if (!bankCode) {
      setError('Vui lòng chọn ngân hàng nhận tiền.');
      return;
    }
    if (accountNumber.length < 6 || accountNumber.length > 20) {
      setError('Số tài khoản phải gồm 6–20 chữ số.');
      return;
    }
    if (accountHolderName.length < 2) {
      setError('Vui lòng nhập tên chủ tài khoản.');
      return;
    }

    setAction('bank');
    setError('');
    setNotice('');
    try {
      const account = await updateBuyerWalletBankAccount(accessToken, { bankCode, accountNumber, accountHolderName });
      setBank(account);
      setDialogOpen(false);
      setNotice('Đã lưu tài khoản ngân hàng. Tài khoản sẽ được kiểm tra để đảm bảo an toàn khi rút tiền.');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Không lưu được tài khoản.');
    } finally {
      setAction('');
    }
  };

  const handleRequestRefund = async () => {
    if (!accessToken || !wallet || wallet.availableAmount <= 0) return;
    const amountToWithdraw = withdrawAmount ? Number(withdrawAmount) : wallet.availableAmount;

    if (amountToWithdraw <= 0 || amountToWithdraw > wallet.availableAmount) {
      setError('Số tiền rút không hợp lệ.');
      return;
    }

    setAction('payout');
    setError('');
    setNotice('');
    try {
      await createBuyerRefundPayout(accessToken, amountToWithdraw);
      setNotice(`Đã tạo yêu cầu rút ${money(amountToWithdraw)}. Tiền sẽ được chuyển thẳng về tài khoản ngân hàng.`);
      setWithdrawAmount('');
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không tạo được yêu cầu rút tiền.');
    } finally {
      setAction('');
    }
  };

  const canWithdraw = Boolean(
    bank &&
      bank.status === 'ALLOWLISTED' &&
      wallet &&
      wallet.availableAmount > 0 &&
      action === ''
  );

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#222222]">
      <Header keywords={keywords} />

      <main className="mx-auto w-full max-w-[1200px] px-3 pb-12 pt-4 md:px-4 md:pt-5 space-y-4">
        {/* Breadcrumb & Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Link href="/" className="hover:text-[#ee4d2d] transition">Trang chủ</Link>
              <span>›</span>
              <Link href="/account" className="hover:text-[#ee4d2d] transition">Tài khoản</Link>
              <span>›</span>
              <span className="text-slate-800 font-medium">Ví eMall</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Ví eMall &amp; Hoàn Tiền</h1>
            <p className="mt-1 text-xs text-slate-500">
              Quản lý số dư hoàn tiền từ các đơn hàng đã hủy và rút tiền an toàn về tài khoản ngân hàng của bạn.
            </p>
          </div>
          {bank && (
            <button
              type="button"
              onClick={openBankDialog}
              className="rounded-xs border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-[#ee4d2d] hover:text-[#ee4d2d] transition shadow-xs"
            >
              Cập nhật tài khoản ngân hàng
            </button>
          )}
        </div>

        {notice && (
          <div className="rounded-xs border border-green-200 bg-green-50 p-3 text-xs font-medium text-green-700 flex items-center gap-2 shadow-xs">
            <span className="text-sm">✓</span>
            <span>{notice}</span>
          </div>
        )}
        {error && (
          <div className="rounded-xs border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-center gap-2 shadow-xs">
            <span className="text-sm">✕</span>
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="rounded-xs border border-slate-200 bg-white p-16 text-center text-xs text-slate-500 shadow-xs">
            <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#ee4d2d] border-t-transparent" />
            <p className="mt-2">Đang tải thông tin ví...</p>
          </div>
        ) : (
          <>
            {/* Top 3 Stat Cards */}
            <section className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xs border border-[#fcdcd7] bg-[#fef6f5] p-4 shadow-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#ee4d2d]" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Số dư có thể rút</p>
                </div>
                <p className="mt-2 text-2xl font-bold text-[#ee4d2d]">{money(wallet?.availableAmount ?? 0)}</p>
                <p className="mt-1 text-xs text-slate-500">Sẵn sàng tạo lệnh rút về ngân hàng</p>
              </div>

              <div className="rounded-xs border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Đang chuyển về ngân hàng</p>
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900">{money(wallet?.payoutPendingAmount ?? 0)}</p>
                <p className="mt-1 text-xs text-slate-500">Admin đang xử lý chuyển khoản</p>
              </div>

              <div className="rounded-xs border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Đã nhận thành công</p>
                </div>
                <p className="mt-2 text-2xl font-bold text-slate-900">{money(wallet?.totalPaidOut ?? 0)}</p>
                <p className="mt-1 text-xs text-slate-500">Tổng số tiền đã rút về tài khoản</p>
              </div>
            </section>

            {/* Main Section: Bank Card (Left) & Withdraw Action (Right) */}
            <section className="grid gap-4 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
              {/* Left Column: Authentic Bank Card */}
              <div className="space-y-3">
                {bank ? (
                  <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                    <div className="relative overflow-hidden bg-gradient-to-br from-slate-700 via-slate-850 to-slate-950 p-6 text-white shadow-inner">
                      <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full border border-white/10 pointer-events-none" />
                      <div className="absolute right-8 top-10 h-24 w-24 rounded-full bg-white/5 pointer-events-none" />

                      <div className="relative flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.2em] text-white/60 font-semibold">Tài khoản nhận tiền hoàn</p>
                          <p className="mt-1 text-2xl font-bold tracking-wide">{bankDisplayName(bank.bankCode)}</p>
                        </div>
                        <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold tracking-wider uppercase border border-white/20">
                          {bank.bankCode}
                        </span>
                      </div>

                      <p className="relative mt-7 text-2xl font-mono font-medium tracking-[0.25em] text-white/95">
                        {bank.maskedAccountNumber.replace('****', '•••• ')}
                      </p>

                      <div className="relative mt-6 flex items-end justify-between gap-3 pt-3 border-t border-white/10">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.16em] text-white/60">Chủ tài khoản</p>
                          <p className="mt-0.5 text-sm font-bold tracking-wider uppercase">{bank.accountHolderName}</p>
                        </div>
                        <div>
                          {bank.status === 'ALLOWLISTED' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#fef6f5] border border-[#fcdcd7] px-2.5 py-0.5 text-xs font-bold text-[#ee4d2d]">
                              <span>✓</span> Đã xác minh
                            </span>
                          ) : bank.status === 'DISABLED' ? (
                            <span className="inline-flex rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
                              Đã vô hiệu hóa
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-[#fffaf5] border border-[#fed7aa] px-2.5 py-0.5 text-xs font-bold text-[#c2410c]">
                              Chờ xác minh
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="px-5 py-3.5 bg-white flex items-center justify-between border-t border-slate-100 text-xs">
                      <span className="text-slate-500">Tài khoản mặc định nhận hoàn tiền</span>
                      <button
                        type="button"
                        onClick={openBankDialog}
                        className="font-semibold text-[#ee4d2d] hover:text-[#d73211] hover:underline"
                      >
                        Đổi tài khoản
                      </button>
                    </div>
                  </article>
                ) : (
                  <button
                    type="button"
                    onClick={openBankDialog}
                    className="flex min-h-[220px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center transition hover:border-[#ee4d2d] hover:bg-[#fffcfb] shadow-xs"
                  >
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-[#fef6f5] text-2xl text-[#ee4d2d] border border-[#fcdcd7]">
                      +
                    </span>
                    <span className="mt-3 text-sm font-bold text-slate-800">Thêm tài khoản ngân hàng</span>
                    <span className="mt-1 text-xs text-slate-500 max-w-xs leading-5">
                      Liên kết tài khoản ngân hàng của bạn để rút tiền hoàn từ các đơn hàng trực tuyến đã hủy.
                    </span>
                  </button>
                )}

                <div className="rounded-xs border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold text-slate-800">
                    <svg className="w-4 h-4 text-[#ee4d2d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Lưu ý rút tiền hoàn</span>
                  </div>
                  <p className="leading-relaxed">
                    • Tiền hoàn sẽ được chuyển đến số tài khoản đã xác minh trong vòng 24 giờ làm việc.
                  </p>
                  <p className="leading-relaxed">
                    • eMall không thu bất kỳ khoản phí nào khi bạn thực hiện rút tiền hoàn về ngân hàng.
                  </p>
                </div>
              </div>

              {/* Right Column: Rút tiền & Bảo mật Panel */}
              <div className="space-y-4">
                <article className="rounded-xs border border-slate-200 bg-white p-5 shadow-xs">
                  <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">Rút tiền về ngân hàng</h2>

                  <div className="mt-4 space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-slate-600">Số tiền muốn rút:</span>
                        <span className="text-slate-500">
                          Khả dụng: <strong className="text-[#ee4d2d]">{money(wallet?.availableAmount ?? 0)}</strong>
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          placeholder={wallet?.availableAmount ? String(wallet.availableAmount) : '0'}
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                          className="h-11 w-full rounded-xs border border-slate-300 px-3 pr-20 text-sm font-semibold text-slate-900 outline-none focus:border-[#ee4d2d] transition"
                        />
                        <button
                          type="button"
                          onClick={() => setWithdrawAmount(String(wallet?.availableAmount ?? 0))}
                          className="absolute right-2 top-2 rounded-xs bg-slate-100 px-2.5 py-1 text-xs font-semibold text-[#ee4d2d] hover:bg-[#fef6f5] transition"
                        >
                          Tối đa
                        </button>
                      </div>
                    </div>

                    {!bank ? (
                      <div className="rounded-xs bg-[#fef6f5] border border-[#fcdcd7] p-3 text-xs text-[#ee4d2d]">
                        Vui lòng thêm tài khoản ngân hàng trước khi tạo yêu cầu rút tiền.
                      </div>
                    ) : bank.status !== 'ALLOWLISTED' ? (
                      <div className="rounded-xs bg-[#fffaf5] border border-[#fed7aa] p-3 text-xs text-[#c2410c]">
                        Tài khoản ngân hàng của bạn đang được duyệt. Vui lòng chờ trước khi gửi yêu cầu rút.
                      </div>
                    ) : (wallet?.availableAmount ?? 0) <= 0 ? (
                      <div className="rounded-xs bg-slate-50 border border-slate-200 p-3 text-xs text-slate-500">
                        Số dư khả dụng hiện tại là 0đ. Khi đơn hàng hủy được duyệt, tiền hoàn sẽ được ghi nhận tại đây.
                      </div>
                    ) : null}

                    <button
                      type="button"
                      disabled={!canWithdraw}
                      onClick={() => void handleRequestRefund()}
                      className="w-full h-11 rounded-xs bg-[#ee4d2d] text-sm font-bold text-white shadow-xs transition hover:bg-[#d73211] disabled:cursor-not-allowed disabled:bg-[#f5f5f5] disabled:text-[#999999] disabled:border disabled:border-[#e8e8e8]"
                    >
                      {action === 'payout'
                        ? 'Đang xử lý yêu cầu...'
                        : `Yêu cầu rút ${withdrawAmount ? money(Number(withdrawAmount)) : money(wallet?.availableAmount ?? 0)}`}
                    </button>
                  </div>
                </article>

                <article className="rounded-xs border border-slate-200 bg-white p-5 shadow-xs">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#fef6f5] text-[#ee4d2d] border border-[#fcdcd7]">
                      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2">
                        <path d="M12 3 5 6v5c0 4.7 2.7 8.2 7 10 4.3-1.8 7-5.3 7-10V6l-7-3Z" />
                        <path d="m9 12 2 2 4-4" />
                      </svg>
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Bảo mật thông tin tài khoản</h3>
                      <p className="text-xs text-slate-500">eMall cam kết an toàn tuyệt đối cho tài khoản của bạn.</p>
                    </div>
                  </div>
                  <ul className="mt-3.5 space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                    <li className="flex items-start gap-2">
                      <span className="text-[#ee4d2d] font-bold">✓</span>
                      <span>Số tài khoản được mã hóa và bảo mật theo chuẩn ngân hàng.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#ee4d2d] font-bold">✓</span>
                      <span>Tự động đối soát chuyển tiền nhanh chóng qua hệ thống VietQR / SePay.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#ee4d2d] font-bold">✓</span>
                      <span>Hỗ trợ tra soát 24/7 khi có bất kỳ thắc mắc nào về dòng tiền hoàn.</span>
                    </li>
                  </ul>
                </article>
              </div>
            </section>

            {/* Bottom Tabbed Tables */}
            <section className="overflow-hidden rounded-xs border border-slate-200 bg-white shadow-xs">
              <div className="flex border-b border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setActiveTab('payouts')}
                  className={`px-5 py-3 text-sm font-semibold transition border-b-2 ${
                    activeTab === 'payouts'
                      ? 'border-[#ee4d2d] text-[#ee4d2d]'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Lịch sử yêu cầu rút tiền ({payouts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('transactions')}
                  className={`px-5 py-3 text-sm font-semibold transition border-b-2 ${
                    activeTab === 'transactions'
                      ? 'border-[#ee4d2d] text-[#ee4d2d]'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Biến động số dư ví ({transactions.length})
                </button>
              </div>

              {activeTab === 'payouts' ? (
                payouts.length === 0 ? (
                  <div className="p-12 text-center text-xs text-slate-500">
                    <p className="text-sm font-medium text-slate-700">Chưa có yêu cầu rút tiền nào.</p>
                    <p className="mt-1">Khi bạn tạo yêu cầu rút tiền về ngân hàng, lịch sử sẽ hiển thị tại đây.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-left text-xs">
                      <thead className="bg-[#fcfcfc] text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                        <tr>
                          <th className="px-4 py-3">Thời gian</th>
                          <th className="px-4 py-3">Mã yêu cầu</th>
                          <th className="px-4 py-3">Ngân hàng nhận</th>
                          <th className="px-4 py-3 text-right">Số tiền rút</th>
                          <th className="px-4 py-3 text-center">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {payouts.map((p) => {
                          const badge = payoutStatusBadge(p.status);
                          return (
                            <tr key={p.id} className="hover:bg-slate-50/70 transition">
                              <td className="px-4 py-3 text-slate-600">{date(p.requestedAt)}</td>
                              <td className="px-4 py-3 font-mono text-slate-500">{p.id.slice(0, 8).toUpperCase()}</td>
                              <td className="px-4 py-3 text-slate-800">
                                <span className="font-semibold">{bankDisplayName(p.bankCode)}</span>
                                <span className="text-slate-400 ml-1.5 font-mono">{p.maskedAccountNumber}</span>
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-slate-900">{money(p.amount)}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                                  {badge.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : transactions.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-500">
                  <p className="text-sm font-medium text-slate-700">Chưa có biến động số dư.</p>
                  <p className="mt-1">Các khoản hoàn tiền đơn hàng hoặc rút tiền sẽ được ghi nhận tại đây.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-left text-xs">
                    <thead className="bg-[#fcfcfc] text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                      <tr>
                        <th className="px-4 py-3">Thời gian</th>
                        <th className="px-4 py-3">Nghiệp vụ</th>
                        <th className="px-4 py-3">Mã tham chiếu</th>
                        <th className="px-4 py-3 text-right">Biến động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {transactions.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50/70 transition">
                          <td className="px-4 py-3 text-slate-600">{date(t.occurredAt)}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">{transactionTypeLabel(t.type)}</td>
                          <td className="px-4 py-3 font-mono text-slate-500">{shortReference(t.referenceId)}</td>
                          <td
                            className={`px-4 py-3 text-right font-bold ${
                              t.amount > 0 ? 'text-[#ee4d2d]' : t.amount < 0 ? 'text-slate-800' : 'text-slate-500'
                            }`}
                          >
                            {t.amount > 0 ? '+' : ''}
                            {money(t.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {/* Modal: Thêm / Cập nhật tài khoản ngân hàng */}
        {dialogOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
            role="presentation"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target && action === '') setDialogOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-md overflow-hidden rounded-xs bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <h2 className="text-base font-bold text-slate-900">
                  {bank ? 'Cập nhật tài khoản ngân hàng' : 'Thêm tài khoản nhận tiền hoàn'}
                </h2>
                <button
                  type="button"
                  aria-label="Đóng"
                  disabled={action !== ''}
                  onClick={() => setDialogOpen(false)}
                  className="rounded p-1 text-slate-400 hover:text-slate-700 transition text-lg leading-none"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveBank} className="p-5 space-y-4 text-xs">
                {error && <div className="rounded border border-rose-200 bg-rose-50 p-2.5 text-rose-700">{error}</div>}

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">Ngân hàng</label>
                  <select
                    value={form.bankCode}
                    onChange={(e) => setForm((old) => ({ ...old, bankCode: e.target.value }))}
                    required
                    className="h-10 w-full rounded-xs border border-slate-300 bg-white px-3 text-xs outline-none focus:border-[#ee4d2d] transition"
                  >
                    <option value="">Chọn ngân hàng nhận tiền</option>
                    {bankOptions.map(([code, name]) => (
                      <option key={code} value={code}>
                        {name} ({code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">Số tài khoản</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.accountNumber}
                    onChange={(e) => setForm((old) => ({ ...old, accountNumber: e.target.value.replace(/\D/g, '').slice(0, 20) }))}
                    placeholder="Nhập 6–20 chữ số"
                    required
                    className="h-10 w-full rounded-xs border border-slate-300 px-3 text-xs outline-none focus:border-[#ee4d2d] transition"
                  />
                  {bank && (
                    <p className="mt-1 text-[11px] text-slate-400">Vì lý do bảo mật, vui lòng nhập lại số tài khoản đầy đủ.</p>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">Tên chủ tài khoản (Viết in hoa, không dấu)</label>
                  <input
                    type="text"
                    value={form.accountHolderName}
                    onChange={(e) => setForm((old) => ({ ...old, accountHolderName: e.target.value.toUpperCase().slice(0, 100) }))}
                    placeholder="NGUYEN VAN A"
                    required
                    className="h-10 w-full rounded-xs border border-slate-300 px-3 text-xs uppercase outline-none focus:border-[#ee4d2d] transition font-medium"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Tên chủ tài khoản cần khớp chính xác với thông tin tại ngân hàng.</p>
                </div>

                <div className="flex justify-end gap-2.5 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    disabled={action !== ''}
                    onClick={() => setDialogOpen(false)}
                    className="h-9 rounded-xs border border-slate-300 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={action !== ''}
                    className="h-9 rounded-xs bg-[#ee4d2d] px-5 text-xs font-bold text-white shadow-xs hover:bg-[#d73211] transition disabled:opacity-60"
                  >
                    {action === 'bank' ? 'Đang lưu...' : 'Lưu tài khoản'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
