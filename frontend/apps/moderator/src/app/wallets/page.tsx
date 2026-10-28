'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModeratorTopbar } from '@/components/layout/moderator-topbar';
import { ModeratorSidebar } from '@/components/layout/moderator-sidebar';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  WalletIcon,
  SearchIcon,
  RefreshCwIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  CopyIcon,
  Building2Icon,
  CreditCardIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LockIcon,
  UnlockIcon,
  QrCodeIcon,
  ClockIcon,
  SparklesIcon,
  ChevronRightIcon as ArrowRightIcon
} from '@/components/ui/icons';
import { ModeratorApiClientError } from '@/lib/api/client';
import type {
  AdminPayout,
  AdminPayoutTransfer,
  AdminWallet,
  AdminWalletSummary,
  BankAccountStatus,
  WalletAuditLog,
  WalletTransaction
} from '@/lib/api/types';
import {
  getAdminWallet,
  completeManualPayout,
  getWalletSummary,
  listAdminPayouts,
  listAdminWallets,
  listWalletAuditLogs,
  listWalletTransactions,
  prepareManualPayout,
  updateBankAccountStatus,
  updateWalletFrozen
} from '@/lib/api/wallets';
import { useAuth } from '@/providers/AppProvider';

const EMPTY_SUMMARY: AdminWalletSummary = {
  totalWallets: 0,
  frozenWallets: 0,
  unverifiedBankAccounts: 0,
  disabledBankAccounts: 0,
  pendingPayouts: 0,
  heldAmount: 0,
  availableAmount: 0,
  payoutPendingAmount: 0,
  totalPaidOut: 0
};

export default function WalletAdministrationPage() {
  const router = useRouter();
  const { ready, user, accessToken, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [wallets, setWallets] = useState<AdminWallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<AdminWallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [payouts, setPayouts] = useState<AdminPayout[]>([]);
  const [auditLogs, setAuditLogs] = useState<WalletAuditLog[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<'' | 'ACTIVE' | 'FROZEN'>('');
  const [bankFilter, setBankFilter] = useState<'' | BankAccountStatus | 'MISSING'>('');
  const [ownerTypeFilter, setOwnerTypeFilter] = useState<'' | 'SELLER' | 'CUSTOMER'>('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [payoutTransfer, setPayoutTransfer] = useState<AdminPayoutTransfer | null>(null);
  const [bankReference, setBankReference] = useState('');
  const [payoutReason, setPayoutReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const activePayoutId = payoutTransfer?.payoutId ?? '';
  const hasProcessingPayouts = payouts.some((payout) => payout.status === 'PROCESSING');

  const copyToClipboard = (text: string, key: string) => {
    void navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const loadOverview = useCallback(async () => {
    if (!accessToken || !isAdmin) return;
    setLoading(true);
    setError('');
    try {
      const [nextSummary, list] = await Promise.all([
        getWalletSummary(accessToken),
        listAdminWallets({
          accessToken,
          page,
          pageSize: 20,
          search,
          state: stateFilter,
          bankStatus: bankFilter,
          ownerType: ownerTypeFilter
        })
      ]);
      setSummary(nextSummary);
      setWallets(list.items);
      setTotalItems(list.pagination.totalItems);
      setTotalPages(Math.max(1, list.pagination.totalPages));
      setSelectedWallet((current) => {
        if (!current) return list.items[0] ?? null;
        return list.items.find((item) => item.id === current.id) ?? list.items[0] ?? null;
      });
    } catch (loadError) {
      setError(toMessage(loadError, 'Không tải được dữ liệu quản lý ví.'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, bankFilter, isAdmin, ownerTypeFilter, page, search, stateFilter]);

  const loadWalletDetail = useCallback(
    async (walletId: string) => {
      if (!accessToken || !isAdmin) return;
      setDetailLoading(true);
      setError('');
      try {
        const [wallet, transactionPage, payoutPage, auditPage] = await Promise.all([
          getAdminWallet(accessToken, walletId),
          listWalletTransactions(accessToken, walletId),
          listAdminPayouts(accessToken, walletId),
          listWalletAuditLogs(accessToken, walletId)
        ]);
        setSelectedWallet(wallet);
        setTransactions(transactionPage.items);
        setPayouts(payoutPage.items);
        setAuditLogs(auditPage.items);
      } catch (loadError) {
        setError(toMessage(loadError, 'Không tải được chi tiết ví.'));
      } finally {
        setDetailLoading(false);
      }
    },
    [accessToken, isAdmin]
  );

  useEffect(() => {
    if (ready && (!user || !accessToken)) router.replace('/login');
  }, [accessToken, ready, router, user]);

  useEffect(() => {
    if (ready && accessToken && isAdmin) void loadOverview();
  }, [accessToken, isAdmin, loadOverview, ready]);

  useEffect(() => {
    if (selectedWallet?.id && accessToken && isAdmin) void loadWalletDetail(selectedWallet.id);
  }, [accessToken, isAdmin, loadWalletDetail, selectedWallet?.id]);

  useEffect(() => {
    if (!accessToken || !isAdmin || !selectedWallet?.id || (!activePayoutId && !hasProcessingPayouts)) return;
    let stopped = false;
    const pollPayouts = async () => {
      try {
        const page = await listAdminPayouts(accessToken, selectedWallet.id);
        if (stopped) return;
        setPayouts(page.items);
        if (!activePayoutId) return;
        const current = page.items.find((item) => item.id === activePayoutId);
        if (current?.status === 'SUCCEEDED') {
          setNotice('SePay đã xác nhận giao dịch tiền ra thành công. Yêu cầu rút tiền đã được hoàn tất tự động.');
          setPayoutTransfer(null);
          setBankReference('');
          setPayoutReason('');
          await Promise.all([loadOverview(), loadWalletDetail(selectedWallet.id)]);
        } else if (current && ['FAILED', 'CANCELLED'].includes(current.status)) {
          setNotice(`Yêu cầu rút đã chuyển sang trạng thái ${current.status}.`);
          setPayoutTransfer(null);
        }
      } catch {
        // Keep the dialog usable when a transient polling request fails.
      }
    };
    void pollPayouts();
    const timer = window.setInterval(() => void pollPayouts(), 4000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [accessToken, activePayoutId, hasProcessingPayouts, isAdmin, loadOverview, loadWalletDetail, selectedWallet?.id]);

  const runWalletAction = useCallback(
    async (action: 'freeze' | 'unfreeze' | BankAccountStatus) => {
      if (!accessToken || !selectedWallet) return;
      const labels: Record<typeof action, string> = {
        freeze: 'đóng băng ví',
        unfreeze: 'mở khóa ví',
        ALLOWLISTED: 'xác minh tài khoản ngân hàng',
        DISABLED: 'khóa tài khoản ngân hàng',
        UNVERIFIED: 'đưa tài khoản về chờ xác minh'
      };
      const reason = window.prompt(`Nhập lý do ${labels[action]} (bắt buộc):`)?.trim() ?? '';
      if (reason.length < 3) {
        setError('Lý do phải có ít nhất 3 ký tự.');
        return;
      }
      setActionLoading(action);
      setError('');
      setNotice('');
      try {
        if (action === 'freeze' || action === 'unfreeze') {
          await updateWalletFrozen(accessToken, selectedWallet.id, action === 'freeze', reason);
        } else {
          await updateBankAccountStatus(accessToken, selectedWallet.id, action, reason);
        }
        setNotice(`Đã ${labels[action]} thành công.`);
        await Promise.all([loadOverview(), loadWalletDetail(selectedWallet.id)]);
      } catch (actionError) {
        setError(toMessage(actionError, `Không thể ${labels[action]}.`));
      } finally {
        setActionLoading('');
      }
    },
    [accessToken, loadOverview, loadWalletDetail, selectedWallet]
  );

  const openManualPayout = useCallback(
    async (payout: AdminPayout) => {
      if (!accessToken) return;
      setActionLoading(`prepare:${payout.id}`);
      setError('');
      setNotice('');
      try {
        const transfer = await prepareManualPayout(accessToken, payout.id);
        setPayoutTransfer(transfer);
        setBankReference('');
        setPayoutReason('');
        if (selectedWallet) await loadWalletDetail(selectedWallet.id);
      } catch (actionError) {
        setError(toMessage(actionError, 'Không thể chuẩn bị lệnh chuyển khoản.'));
      } finally {
        setActionLoading('');
      }
    },
    [accessToken, loadWalletDetail, selectedWallet]
  );

  const finishManualPayout = useCallback(
    async (action: 'CONFIRM' | 'REJECT') => {
      if (!accessToken || !payoutTransfer || !selectedWallet) return;
      const reason =
        action === 'REJECT' && payoutReason.trim().length < 3
          ? (window.prompt('Nhập lý do từ chối và hoàn số dư về ví của chủ tài khoản:')?.trim() ?? '')
          : payoutReason.trim();
      const providerReference = bankReference.trim();
      if (reason.length < 3) {
        setError('Vui lòng nhập lý do hoặc ghi chú có ít nhất 3 ký tự.');
        return;
      }
      if (action === 'CONFIRM' && providerReference.length < 3) {
        setError('Vui lòng nhập mã giao dịch ngân hàng để xác nhận đã chuyển tiền.');
        return;
      }
      setActionLoading(`complete:${payoutTransfer.payoutId}`);
      setError('');
      try {
        await completeManualPayout(accessToken, payoutTransfer.payoutId, { action, providerReference, reason });
        setNotice(action === 'CONFIRM' ? 'Đã xác nhận chuyển khoản thành công.' : 'Đã từ chối yêu cầu và hoàn tiền về số dư khả dụng.');
        setPayoutTransfer(null);
        setBankReference('');
        setPayoutReason('');
        await Promise.all([loadOverview(), loadWalletDetail(selectedWallet.id)]);
      } catch (actionError) {
        setError(toMessage(actionError, 'Không thể cập nhật yêu cầu rút tiền.'));
      } finally {
        setActionLoading('');
      }
    },
    [accessToken, bankReference, loadOverview, loadWalletDetail, payoutReason, payoutTransfer, selectedWallet]
  );

  const bankStatusCounts = useMemo(
    () => ({
      attention: summary.unverifiedBankAccounts + summary.disabledBankAccounts + summary.pendingPayouts,
      operational: Math.max(0, summary.totalWallets - summary.frozenWallets)
    }),
    [summary]
  );

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-medium text-slate-500">
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <span>Đang kiểm tra phiên đăng nhập...</span>
        </div>
      </main>
    );
  }

  if (!user || !accessToken) return null;

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900">
      <ModeratorTopbar email={user.email} role={user.role} onLogout={handleLogout} />

      <div className="mx-auto w-full max-w-[1760px] px-3 py-5 sm:px-5 lg:px-6">
        <div className="grid gap-5 lg:grid-cols-[256px_minmax(0,1fr)]">
          {/* Sidebar */}
          <div className="hidden lg:block">
            <ModeratorSidebar
              role={user.role}
              walletAttentionCount={bankStatusCounts.attention}
            />
          </div>

          <main className="min-w-0 space-y-4">
            {!isAdmin ? (
              <section className="rounded-2xl border border-rose-200 bg-white p-12 text-center shadow-card">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-600">
                  <LockIcon size={28} />
                </div>
                <h1 className="mt-4 text-lg font-bold text-slate-950">Không có quyền truy cập</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Chức năng quản lý ví và tài chính chỉ dành riêng cho tài khoản quản trị ADMIN và SUPER_ADMIN.
                </p>
                <Link
                  href="/"
                  className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-subtle hover:bg-slate-800"
                >
                  Quay lại Dashboard
                </Link>
              </section>
            ) : (
              <>
                {/* Header & Overview */}
                <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-brand-700">
                          Financial Operations
                        </span>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-xs font-semibold text-slate-500">
                          Đối soát chuyển tiền &amp; Quản trị rủi ro số dư
                        </span>
                      </div>
                      <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                        Quản lý ví eMall
                      </h1>
                      <p className="mt-1 text-sm text-slate-500 max-w-2xl leading-relaxed">
                        Theo dõi tài khoản ví Seller và khách hàng hoàn tiền, duyệt xác minh tài khoản ngân hàng và đối soát VietQR / SePay.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void loadOverview()}
                      disabled={loading}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-subtle transition hover:bg-slate-800 active:scale-95 disabled:opacity-60"
                    >
                      <RefreshCwIcon size={13} className={loading ? 'animate-spin' : ''} />
                      <span>{loading ? 'Đang tải...' : 'Làm mới dữ liệu'}</span>
                    </button>
                  </div>

                  {/* 5 High-Impact Stat Cards */}
                  <div className="mt-5 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
                    <StatCard
                      label="Tổng số ví"
                      value={String(summary.totalWallets)}
                      hint={`${bankStatusCounts.operational} ví đang hoạt động`}
                      icon={<WalletIcon size={18} />}
                      tone="default"
                    />
                    <StatCard
                      label="Đang tạm giữ"
                      value={formatMoney(summary.heldAmount)}
                      hint="Chờ đơn hàng hoàn tất"
                      icon={<ClockIcon size={18} />}
                      tone="amber"
                    />
                    <StatCard
                      label="Có thể rút"
                      value={formatMoney(summary.availableAmount)}
                      hint="Tổng số dư khả dụng"
                      icon={<CheckCircle2Icon size={18} />}
                      tone="emerald"
                    />
                    <StatCard
                      label="Đang rút (Payout)"
                      value={formatMoney(summary.payoutPendingAmount)}
                      hint={`${summary.pendingPayouts} yêu cầu đang chờ`}
                      icon={<CreditCardIcon size={18} />}
                      tone="indigo"
                    />
                    <StatCard
                      label="Đã chi trả"
                      value={formatMoney(summary.totalPaidOut)}
                      hint={`${summary.frozenWallets} ví bị đóng băng`}
                      icon={<SparklesIcon size={18} />}
                      tone="rose"
                    />
                  </div>
                </section>

                {/* Notifications */}
                {notice ? (
                  <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-xs font-semibold text-emerald-800 shadow-2xs">
                    <CheckCircle2Icon size={16} className="text-emerald-600 shrink-0" />
                    <span>{notice}</span>
                  </div>
                ) : null}

                {error ? (
                  <div className="flex items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-xs font-semibold text-rose-800 shadow-2xs">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-rose-200 text-rose-700 shrink-0 font-bold">
                      !
                    </span>
                    <span>{error}</span>
                  </div>
                ) : null}

                {/* Wallets List Section */}
                <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
                  {/* Filter Toolbar */}
                  <div className="border-b border-slate-100 bg-slate-50/60 p-4">
                    <div className="grid gap-2.5 md:grid-cols-[minmax(240px,1.2fr)_150px_160px_170px_auto]">
                      <div className="relative">
                        <SearchIcon
                          size={15}
                          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          value={searchInput}
                          onChange={(event) => setSearchInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              setSearch(searchInput.trim());
                              setPage(1);
                            }
                          }}
                          placeholder="Owner ID, tên chủ tài khoản hoặc 4 số cuối..."
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-xs font-medium text-slate-900 shadow-2xs outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
                        />
                      </div>

                      <select
                        value={ownerTypeFilter}
                        onChange={(event) => {
                          setOwnerTypeFilter(event.target.value as typeof ownerTypeFilter);
                          setPage(1);
                        }}
                        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs outline-none transition hover:border-slate-300 focus:border-brand-500"
                      >
                        <option value="">Tất cả loại ví</option>
                        <option value="SELLER">Ví Người bán</option>
                        <option value="CUSTOMER">Ví Khách hàng</option>
                      </select>

                      <select
                        value={stateFilter}
                        onChange={(event) => {
                          setStateFilter(event.target.value as typeof stateFilter);
                          setPage(1);
                        }}
                        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs outline-none transition hover:border-slate-300 focus:border-brand-500"
                      >
                        <option value="">Trạng thái ví</option>
                        <option value="ACTIVE">Đang hoạt động</option>
                        <option value="FROZEN">Đã đóng băng</option>
                      </select>

                      <select
                        value={bankFilter}
                        onChange={(event) => {
                          setBankFilter(event.target.value as typeof bankFilter);
                          setPage(1);
                        }}
                        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs outline-none transition hover:border-slate-300 focus:border-brand-500"
                      >
                        <option value="">Trạng thái ngân hàng</option>
                        <option value="UNVERIFIED">Chờ xác minh</option>
                        <option value="ALLOWLISTED">Đã xác minh</option>
                        <option value="DISABLED">Đã khóa</option>
                        <option value="MISSING">Chưa thiết lập</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => {
                          setSearch(searchInput.trim());
                          setPage(1);
                        }}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-brand-600 px-4 text-xs font-bold text-white shadow-subtle transition hover:bg-brand-700 active:scale-95"
                      >
                        Áp dụng
                      </button>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
                      <thead className="bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-4 py-3.5">Chủ ví / Loại</th>
                          <th className="px-4 py-3.5">Số dư khả dụng</th>
                          <th className="px-4 py-3.5">Tài khoản nhận tiền</th>
                          <th className="px-4 py-3.5">Trạng thái</th>
                          <th className="px-4 py-3.5 text-right">Chi tiết</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {wallets.map((wallet) => {
                          const isSelected = selectedWallet?.id === wallet.id;
                          return (
                            <tr
                              key={wallet.id}
                              onClick={() => setSelectedWallet(wallet)}
                              className={`group cursor-pointer transition-colors duration-150 ${
                                isSelected ? 'bg-orange-50/50' : 'hover:bg-slate-50/70'
                              }`}
                            >
                              <td className="px-4 py-3.5 max-w-[280px]">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyToClipboard(wallet.ownerId, `owner-${wallet.id}`);
                                    }}
                                    className="font-mono text-xs font-bold text-slate-900 hover:text-brand-600 flex items-center gap-1"
                                    title="Sao chép Owner ID"
                                  >
                                    <span>{shortId(wallet.ownerId)}</span>
                                    {copiedKey === `owner-${wallet.id}` ? (
                                      <CheckCircle2Icon size={12} className="text-emerald-600" />
                                    ) : (
                                      <CopyIcon size={11} className="text-slate-400 group-hover:text-slate-600" />
                                    )}
                                  </button>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
                                      wallet.ownerType === 'CUSTOMER'
                                        ? 'bg-sky-50 text-sky-700 border border-sky-200/60'
                                        : 'bg-indigo-50 text-indigo-700 border border-indigo-200/60'
                                    }`}
                                  >
                                    {wallet.ownerType === 'CUSTOMER' ? 'Khách hàng' : 'Seller'}
                                  </span>
                                </div>
                                <p className="mt-1 font-mono text-[11px] text-slate-400 truncate">
                                  {wallet.id}
                                </p>
                              </td>

                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <p className="font-extrabold text-emerald-700">
                                  {formatMoney(wallet.availableAmount)}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-500 font-medium">
                                  Tạm giữ: {formatMoney(wallet.heldAmount)}
                                </p>
                              </td>

                              <td className="px-4 py-3.5 whitespace-nowrap">
                                {wallet.bankAccount ? (
                                  <div className="flex items-center gap-2">
                                    <div className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-slate-700 font-bold text-[10px]">
                                      {wallet.bankAccount.bankCode.slice(0, 3)}
                                    </div>
                                    <div>
                                      <p className="text-xs font-bold text-slate-900">
                                        {wallet.bankAccount.bankCode} · {wallet.bankAccount.maskedAccountNumber}
                                      </p>
                                      <p className="text-[11px] text-slate-500 font-medium uppercase">
                                        {wallet.bankAccount.accountHolderName}
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-400 italic">Chưa liên kết</span>
                                )}
                              </td>

                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <StatusBadge status={wallet.isFrozen ? 'FROZEN' : 'ACTIVE'} size="sm" />
                                  <StatusBadge status={wallet.bankAccount?.status ?? 'MISSING'} size="sm" />
                                </div>
                              </td>

                              <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedWallet(wallet);
                                  }}
                                  className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition shadow-2xs ${
                                    isSelected
                                      ? 'bg-brand-600 text-white shadow-subtle'
                                      : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                                  }`}
                                >
                                  <span>Chi tiết</span>
                                  <ArrowRightIcon size={12} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}

                        {!loading && wallets.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                              <WalletIcon size={32} className="mx-auto text-slate-300 mb-2" />
                              Không tìm thấy ví nào phù hợp với bộ lọc hiện tại.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-xs text-slate-500">
                    <span>
                      Tổng cộng <strong className="text-slate-800">{totalItems}</strong> ví · Trang{' '}
                      <strong className="text-slate-800">{page}</strong>/{totalPages}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => setPage((v) => v - 1)}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ChevronLeftIcon size={13} />
                        <span>Trước</span>
                      </button>
                      <button
                        type="button"
                        disabled={page >= totalPages}
                        onClick={() => setPage((v) => v + 1)}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <span>Sau</span>
                        <ChevronRightIcon size={13} />
                      </button>
                    </div>
                  </div>
                </section>

                {/* Selected Wallet Details */}
                {selectedWallet ? (
                  <WalletDetail
                    wallet={selectedWallet}
                    transactions={transactions}
                    payouts={payouts}
                    auditLogs={auditLogs}
                    loading={detailLoading}
                    actionLoading={actionLoading}
                    onAction={runWalletAction}
                    onOpenPayout={openManualPayout}
                  />
                ) : null}
              </>
            )}
          </main>
        </div>
      </div>

      {/* Manual Payout Modal */}
      {payoutTransfer ? (
        <ManualPayoutDialog
          transfer={payoutTransfer}
          bankReference={bankReference}
          reason={payoutReason}
          error={error}
          loading={actionLoading.startsWith('complete:')}
          onBankReferenceChange={setBankReference}
          onReasonChange={setPayoutReason}
          onClose={() => {
            setPayoutTransfer(null);
            setError('');
          }}
          onComplete={finishManualPayout}
        />
      ) : null}
    </div>
  );
}

function WalletDetail({
  wallet,
  transactions,
  payouts,
  auditLogs,
  loading,
  actionLoading,
  onAction,
  onOpenPayout
}: {
  wallet: AdminWallet;
  transactions: WalletTransaction[];
  payouts: AdminPayout[];
  auditLogs: WalletAuditLog[];
  loading: boolean;
  actionLoading: string;
  onAction: (action: 'freeze' | 'unfreeze' | BankAccountStatus) => Promise<void>;
  onOpenPayout: (payout: AdminPayout) => Promise<void>;
}) {
  const bank = wallet.bankAccount;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
      {/* Top Header of Detail */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-700">
              Chi tiết tài khoản ví
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs font-semibold text-slate-600">
              {wallet.ownerType === 'CUSTOMER' ? 'Khách hàng hoàn tiền' : 'Người bán (Seller)'}
            </span>
          </div>
          <h2 className="mt-1 text-xl font-black text-slate-950 flex items-center gap-2">
            <span>{shortId(wallet.ownerId)}</span>
            <span className="text-xs font-normal text-slate-400">({wallet.id})</span>
          </h2>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={Boolean(actionLoading)}
            onClick={() => void onAction(wallet.isFrozen ? 'unfreeze' : 'freeze')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition shadow-subtle ${
              wallet.isFrozen
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
            }`}
          >
            {wallet.isFrozen ? <UnlockIcon size={14} /> : <LockIcon size={14} />}
            <span>{wallet.isFrozen ? 'Mở khóa ví' : 'Đóng băng ví'}</span>
          </button>

          {bank && bank.status !== 'ALLOWLISTED' && (
            <button
              type="button"
              disabled={Boolean(actionLoading)}
              onClick={() => void onAction('ALLOWLISTED')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-subtle hover:bg-emerald-700"
            >
              <CheckCircle2Icon size={14} />
              <span>Xác minh ngân hàng</span>
            </button>
          )}

          {bank && bank.status !== 'DISABLED' && (
            <button
              type="button"
              disabled={Boolean(actionLoading)}
              onClick={() => void onAction('DISABLED')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 shadow-2xs"
            >
              <AlertTriangleIcon size={14} />
              <span>Khóa tài khoản nhận</span>
            </button>
          )}

          {bank && bank.status === 'ALLOWLISTED' && (
            <button
              type="button"
              disabled={Boolean(actionLoading)}
              onClick={() => void onAction('UNVERIFIED')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs"
            >
              <span>Yêu cầu xác minh lại</span>
            </button>
          )}
        </div>
      </div>

      {/* Balance Metrics */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-b from-amber-50/40 to-white p-4 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Tạm giữ</p>
          <p className="mt-1 text-xl font-black text-slate-950">{formatMoney(wallet.heldAmount)}</p>
          <p className="mt-0.5 text-xs text-slate-500">Chờ hoàn tất đơn hàng</p>
        </div>
        <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-b from-emerald-50/40 to-white p-4 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Khả dụng</p>
          <p className="mt-1 text-xl font-black text-emerald-700">{formatMoney(wallet.availableAmount)}</p>
          <p className="mt-0.5 text-xs text-slate-500">Số dư sẵn sàng rút</p>
        </div>
        <div className="rounded-2xl border border-indigo-200/70 bg-gradient-to-b from-indigo-50/40 to-white p-4 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Đang payout</p>
          <p className="mt-1 text-xl font-black text-slate-950">{formatMoney(wallet.payoutPendingAmount)}</p>
          <p className="mt-0.5 text-xs text-slate-500">Lệnh rút đang xử lý</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Đã chi trả</p>
          <p className="mt-1 text-xl font-black text-slate-950">{formatMoney(wallet.totalPaidOut)}</p>
          <p className="mt-0.5 text-xs text-slate-500">Tổng tiền đã hoàn tất</p>
        </div>
      </div>

      {/* Bank Account & Payouts Grid */}
      <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
        {/* Bank Account Card */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Building2Icon size={16} className="text-slate-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Tài khoản ngân hàng thụ hưởng
            </h3>
          </div>

          {bank ? (
            <div className="mt-3 space-y-3 text-xs">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-400">Ngân hàng</span>
                <span className="font-bold text-slate-900">{bank.bankCode}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-400">Số tài khoản</span>
                <span className="font-mono font-bold text-slate-900">{bank.maskedAccountNumber}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-400">Chủ tài khoản</span>
                <span className="font-bold uppercase text-slate-900">{bank.accountHolderName}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-400">Trạng thái xác minh</span>
                <StatusBadge status={bank.status} size="sm" />
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Cập nhật lần cuối</span>
                <span className="text-slate-600">{formatDate(bank.updatedAt)}</span>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-slate-400">
              Chủ ví chưa liên kết tài khoản ngân hàng nào.
            </div>
          )}
        </div>

        {/* Payouts Table */}
        <DataTable
          title={wallet.ownerType === 'CUSTOMER' ? 'Yêu cầu hoàn tiền ngân hàng' : 'Yêu cầu rút tiền (Payout)'}
          empty="Chưa có yêu cầu rút tiền nào."
          loading={loading}
          headers={['Thời gian', 'Loại', 'Số tiền', 'Ngân hàng', 'Trạng thái', 'Hành động']}
          rows={payouts.map((item) => [
            formatDate(item.requestedAt),
            item.payoutType === 'CUSTOMER_REFUND' ? 'Hoàn khách' : 'Rút Seller',
            <strong key={item.id} className="text-slate-950 font-bold">
              {formatMoney(item.amount)}
            </strong>,
            `${item.bankCode} ${item.maskedAccountNumber}`,
            <StatusBadge key={`badge-${item.id}`} status={item.status} size="sm" />,
            item.status === 'REQUESTED' || item.status === 'PROCESSING' ? (
              <button
                key={`btn-${item.id}`}
                type="button"
                disabled={Boolean(actionLoading)}
                onClick={() => void onOpenPayout(item)}
                className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-3 py-1 text-xs font-bold text-white shadow-2xs hover:bg-brand-700 disabled:opacity-50"
              >
                <QrCodeIcon size={12} />
                <span>{actionLoading === `prepare:${item.id}` ? 'Đang mở...' : 'Chuyển tiền'}</span>
              </button>
            ) : (
              <span key={`done-${item.id}`} className="text-xs text-slate-400 font-medium">
                Hoàn tất
              </span>
            )
          ])}
        />
      </div>

      {/* Transactions & Audit Logs */}
      <div className="grid gap-4 xl:grid-cols-2">
        <DataTable
          title="Lịch sử giao dịch ví"
          empty="Chưa có giao dịch biến động số dư."
          loading={loading}
          headers={['Thời gian', 'Loại giao dịch', 'Mã tham chiếu', 'Số tiền']}
          rows={transactions.map((item) => [
            formatDate(item.occurredAt),
            <span key={item.id} className="font-semibold text-slate-800">
              {item.type}
            </span>,
            <span key={`ref-${item.id}`} className="font-mono text-slate-500">
              {shortId(item.referenceId)}
            </span>,
            <span
              key={`amt-${item.id}`}
              className={`font-bold ${item.amount >= 0 ? 'text-emerald-700' : 'text-slate-900'}`}
            >
              {formatSignedMoney(item.amount)}
            </span>
          ])}
        />

        <DataTable
          title="Nhật ký quản trị (Audit Trail)"
          empty="Chưa có thao tác quản trị nào."
          loading={loading}
          headers={['Thời gian', 'Hành động', 'Quản trị viên', 'Lý do']}
          rows={auditLogs.map((item) => [
            formatDate(item.createdAt),
            <span key={item.id} className="font-semibold text-slate-900">
              {item.action}
              {item.newStatus ? ` → ${item.newStatus}` : ''}
            </span>,
            item.actorEmail,
            <span key={`r-${item.id}`} className="italic text-slate-600">
              {item.reason}
            </span>
          ])}
        />
      </div>
    </section>
  );
}

function ManualPayoutDialog({
  transfer,
  bankReference,
  reason,
  error,
  loading,
  onBankReferenceChange,
  onReasonChange,
  onClose,
  onComplete
}: {
  transfer: AdminPayoutTransfer;
  bankReference: string;
  reason: string;
  error: string;
  loading: boolean;
  onBankReferenceChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onComplete: (action: 'CONFIRM' | 'REJECT') => Promise<void>;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyValue = (value: string, key: string) => {
    void navigator.clipboard?.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[95vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-dialog border border-slate-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 p-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-brand-700">
                VietQR Payout · SePay Reconciliation
              </span>
            </div>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {transfer.payoutType === 'CUSTOMER_REFUND'
                ? 'Hoàn tiền cho khách hàng'
                : 'Chuyển tiền rút cho Seller'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Quét mã VietQR bằng app ngân hàng quản trị. Sau khi giao dịch hoàn tất, SePay sẽ tự động đối soát và xác nhận.
            </p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Đóng
          </button>
        </div>

        {/* Content */}
        <div className="grid gap-6 p-6 md:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.1fr)]">
          {/* VietQR Card */}
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-5 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={transfer.qrCodeUrl}
              alt={`VietQR chuyển ${formatMoney(transfer.amount)}`}
              className="mx-auto w-full max-w-[320px] rounded-2xl bg-white p-2 shadow-card"
            />
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Sử dụng ứng dụng ngân hàng quét mã QR trên để chuyển khoản tự động kèm nội dung chính xác.
            </p>
          </div>

          {/* Details & Manual fallback */}
          <div className="space-y-4">
            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {error}
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                Thông tin chuyển khoản ngân hàng
              </h3>
              <div className="space-y-2.5 text-xs">
                <TransferRow label="Ngân hàng thụ hưởng" value={transfer.bankCode} />
                <TransferRow label="Chủ tài khoản" value={transfer.accountHolderName} />
                <TransferRow
                  label="Số tài khoản"
                  value={transfer.accountNumber}
                  onCopy={() => copyValue(transfer.accountNumber, 'acc')}
                  isCopied={copiedKey === 'acc'}
                />
                <TransferRow
                  label="Số tiền"
                  value={formatMoney(transfer.amount)}
                  emphasize
                  onCopy={() => copyValue(String(transfer.amount), 'amount')}
                  isCopied={copiedKey === 'amount'}
                />
                <TransferRow
                  label="Nội dung chuyển tiền"
                  value={transfer.transferContent}
                  onCopy={() => copyValue(transfer.transferContent, 'content')}
                  isCopied={copiedKey === 'content'}
                />
              </div>
            </div>

            {/* Live SePay status */}
            <div className="flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50/80 p-3.5 text-xs text-sky-900">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-sky-500" />
              </span>
              <div>
                <p className="font-bold">Đang chờ SePay đối soát giao dịch tiền ra</p>
                <p className="text-slate-600 mt-0.5">
                  Hệ thống tự động kiểm tra mỗi 4 giây. Bạn không cần xác nhận thủ công nếu SePay đã nhận webhook.
                </p>
              </div>
            </div>

            {/* Fallback Accordion */}
            <details className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <summary className="cursor-pointer font-bold text-slate-700 select-none">
                Xác nhận thủ công dự phòng (Khi SePay quá tải)
              </summary>
              <div className="mt-3 space-y-3 pt-2 border-t border-slate-200">
                <label className="block">
                  <span className="font-semibold text-slate-700">Mã giao dịch ngân hàng</span>
                  <input
                    value={bankReference}
                    onChange={(e) => onBankReferenceChange(e.target.value)}
                    placeholder="Ví dụ: FT26300123456789"
                    className="mt-1 h-9 w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-xs"
                  />
                </label>
                <label className="block">
                  <span className="font-semibold text-slate-700">Ghi chú xác thực</span>
                  <textarea
                    value={reason}
                    onChange={(e) => onReasonChange(e.target.value)}
                    placeholder="Đã đối chiếu sao kê ngân hàng thành công..."
                    rows={2}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs"
                  />
                </label>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void onComplete('CONFIRM')}
                  className="w-full rounded-xl bg-amber-600 py-2 text-xs font-bold text-white shadow-subtle hover:bg-amber-700 disabled:opacity-50"
                >
                  {loading ? 'Đang cập nhật...' : 'Xác nhận chuyển tiền thủ công'}
                </button>
              </div>
            </details>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => void onComplete('REJECT')}
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
              >
                Từ chối &amp; Hoàn số dư
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={onClose}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TransferRow({
  label,
  value,
  onCopy,
  isCopied = false,
  emphasize = false
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  isCopied?: boolean;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
      <span className="text-slate-500">{label}</span>
      <div className="flex items-center gap-1.5 text-right">
        <strong className={emphasize ? 'text-base font-black text-brand-700' : 'font-bold text-slate-950'}>
          {value}
        </strong>
        {onCopy ? (
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100"
          >
            {isCopied ? <CheckCircle2Icon size={11} className="text-emerald-600" /> : <CopyIcon size={10} />}
            <span>{isCopied ? 'Đã chép' : 'Chép'}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function DataTable({
  title,
  headers,
  rows,
  empty,
  loading
}: {
  title: string;
  headers: string[];
  rows: ReactNode[][];
  empty: string;
  loading: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
      <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">{title}</h3>
      </div>
      <div className="max-h-[340px] overflow-auto">
        <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 shadow-2xs">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-3.5 py-2.5 font-bold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {rows.map((row, index) => (
              <tr key={index} className="hover:bg-slate-50/60 transition-colors">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="max-w-[220px] px-3.5 py-2.5 align-middle">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={headers.length} className="px-3 py-8 text-center text-slate-400">
                  {empty}
                </td>
              </tr>
            ) : null}
            {loading ? (
              <tr>
                <td colSpan={headers.length} className="px-3 py-8 text-center text-slate-500">
                  <div className="flex items-center justify-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                    <span>Đang tải...</span>
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(
    value
  );
}

function formatSignedMoney(value: number) {
  return `${value > 0 ? '+' : ''}${formatMoney(value)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function shortId(value: string) {
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function toMessage(error: unknown, fallback: string) {
  return error instanceof ModeratorApiClientError ? error.message : fallback;
}
