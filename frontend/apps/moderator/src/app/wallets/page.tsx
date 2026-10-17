'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModeratorTopbar } from '@/components/layout/moderator-topbar';
import { ModeratorApiClientError } from '@/lib/api/client';
import type {
  AdminPayout,
  AdminWallet,
  AdminWalletSummary,
  BankAccountStatus,
  WalletAuditLog,
  WalletTransaction
} from '@/lib/api/types';
import {
  getAdminWallet,
  getWalletSummary,
  listAdminPayouts,
  listAdminWallets,
  listWalletAuditLogs,
  listWalletTransactions,
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
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadOverview = useCallback(async () => {
    if (!accessToken || !isAdmin) return;
    setLoading(true);
    setError('');
    try {
      const [nextSummary, list] = await Promise.all([
        getWalletSummary(accessToken),
        listAdminWallets({ accessToken, page, pageSize: 20, search, state: stateFilter, bankStatus: bankFilter })
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
  }, [accessToken, bankFilter, isAdmin, page, search, stateFilter]);

  const loadWalletDetail = useCallback(async (walletId: string) => {
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
  }, [accessToken, isAdmin]);

  useEffect(() => {
    if (ready && (!user || !accessToken)) router.replace('/login');
  }, [accessToken, ready, router, user]);

  useEffect(() => {
    if (ready && accessToken && isAdmin) void loadOverview();
  }, [accessToken, isAdmin, loadOverview, ready]);

  useEffect(() => {
    if (selectedWallet?.id && accessToken && isAdmin) void loadWalletDetail(selectedWallet.id);
  }, [accessToken, isAdmin, loadWalletDetail, selectedWallet?.id]);

  const runWalletAction = useCallback(async (action: 'freeze' | 'unfreeze' | BankAccountStatus) => {
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
  }, [accessToken, loadOverview, loadWalletDetail, selectedWallet]);

  const bankStatusCounts = useMemo(() => ({
    attention: summary.unverifiedBankAccounts + summary.disabledBankAccounts,
    operational: Math.max(0, summary.totalWallets - summary.frozenWallets)
  }), [summary]);

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  if (!ready) return <main className="flex min-h-screen items-center justify-center text-sm text-slate-600">Đang kiểm tra phiên đăng nhập...</main>;
  if (!user || !accessToken) return null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <ModeratorTopbar email={user.email} role={user.role} onLogout={handleLogout} />
      <div className="mx-auto grid w-full max-w-[1760px] gap-4 px-3 py-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-4">
        <aside className="hidden h-fit rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:block">
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Workspace</p>
          <nav className="space-y-1">
            <SidebarLink href="/" label="Product Queue" />
            <SidebarLink href="/videos/review" label="Video Review Queue" />
            <SidebarLink href="/chat/violations" label="Chat Violations" />
            <SidebarLink href="/wallets" label="Wallet Operations" active />
          </nav>
          <div className="mt-4 rounded-lg border border-orange-100 bg-orange-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-700">Cần xử lý</p>
            <p className="mt-1 text-3xl font-semibold text-slate-950">{bankStatusCounts.attention}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">Tài khoản ngân hàng chờ xác minh hoặc đã bị khóa.</p>
          </div>
        </aside>

        <main className="min-w-0 space-y-4">
          {!isAdmin ? (
            <section className="rounded-xl border border-rose-200 bg-white p-8 text-center shadow-sm">
              <h1 className="text-xl font-semibold">Không có quyền quản lý ví</h1>
              <p className="mt-2 text-sm text-slate-600">Chức năng này chỉ dành cho ADMIN và SUPER_ADMIN.</p>
              <Link href="/" className="mt-5 inline-flex rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Quay lại Dashboard</Link>
            </section>
          ) : (
            <>
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">Financial operations</p>
                    <h1 className="mt-1 text-2xl font-semibold text-slate-950">Quản lý ví Seller</h1>
                    <p className="mt-1 text-sm text-slate-500">Kiểm soát số dư, xác minh tài khoản nhận tiền, payout và lịch sử thao tác.</p>
                  </div>
                  <button type="button" onClick={() => void loadOverview()} disabled={loading} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    {loading ? 'Đang tải...' : 'Làm mới dữ liệu'}
                  </button>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <MetricCard label="Tổng ví" value={String(summary.totalWallets)} hint={`${bankStatusCounts.operational} đang hoạt động`} />
                  <MetricCard label="Đang tạm giữ" value={formatMoney(summary.heldAmount)} hint="Chờ đơn đủ điều kiện" />
                  <MetricCard label="Có thể rút" value={formatMoney(summary.availableAmount)} hint="Tổng số dư khả dụng" />
                  <MetricCard label="Đang rút" value={formatMoney(summary.payoutPendingAmount)} hint={`${summary.pendingPayouts} yêu cầu`} />
                  <MetricCard label="Đã chi trả" value={formatMoney(summary.totalPaidOut)} hint={`${summary.frozenWallets} ví đóng băng`} />
                </div>
              </section>

              {notice ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}
              {error ? <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

              <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 p-4">
                  <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_180px_220px_auto]">
                    <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Seller ID, chủ tài khoản hoặc 4 số cuối" className="h-10 rounded-md border border-slate-300 px-3 text-sm" />
                    <select value={stateFilter} onChange={(event) => { setStateFilter(event.target.value as typeof stateFilter); setPage(1); }} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
                      <option value="">Tất cả trạng thái ví</option><option value="ACTIVE">Đang hoạt động</option><option value="FROZEN">Đã đóng băng</option>
                    </select>
                    <select value={bankFilter} onChange={(event) => { setBankFilter(event.target.value as typeof bankFilter); setPage(1); }} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
                      <option value="">Tất cả tài khoản</option><option value="UNVERIFIED">Chờ xác minh</option><option value="ALLOWLISTED">Đã xác minh</option><option value="DISABLED">Đã khóa</option><option value="MISSING">Chưa thiết lập</option>
                    </select>
                    <button type="button" onClick={() => { setSearch(searchInput.trim()); setPage(1); }} className="h-10 rounded-md bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">Áp dụng</button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Seller / Ví</th><th className="px-4 py-3">Số dư</th><th className="px-4 py-3">Tài khoản nhận tiền</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3 text-right">Thao tác</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {wallets.map((wallet) => (
                        <tr key={wallet.id} className={selectedWallet?.id === wallet.id ? 'bg-orange-50/60' : 'hover:bg-slate-50'}>
                          <td className="px-4 py-3"><p className="font-semibold text-slate-900">{shortId(wallet.sellerId)}</p><p className="mt-1 font-mono text-[11px] text-slate-500">{wallet.id}</p></td>
                          <td className="px-4 py-3"><p className="font-semibold text-emerald-700">{formatMoney(wallet.availableAmount)}</p><p className="mt-1 text-xs text-slate-500">Giữ: {formatMoney(wallet.heldAmount)}</p></td>
                          <td className="px-4 py-3">{wallet.bankAccount ? <><p className="font-medium">{wallet.bankAccount.bankCode} · {wallet.bankAccount.maskedAccountNumber}</p><p className="mt-1 text-xs text-slate-500">{wallet.bankAccount.accountHolderName}</p></> : <span className="text-slate-400">Chưa thiết lập</span>}</td>
                          <td className="px-4 py-3"><div className="flex flex-wrap gap-1.5"><StatusBadge value={wallet.isFrozen ? 'FROZEN' : 'ACTIVE'} /><StatusBadge value={wallet.bankAccount?.status ?? 'MISSING'} /></div></td>
                          <td className="px-4 py-3 text-right"><button type="button" onClick={() => setSelectedWallet(wallet)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:border-brand-300 hover:text-brand-700">Chi tiết</button></td>
                        </tr>
                      ))}
                      {!loading && wallets.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Không tìm thấy ví phù hợp.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm"><span className="text-slate-500">{totalItems} ví · Trang {page}/{totalPages}</span><div className="flex gap-2"><PageButton disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Trước</PageButton><PageButton disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Sau</PageButton></div></div>
              </section>

              {selectedWallet ? (
                <WalletDetail
                  wallet={selectedWallet}
                  transactions={transactions}
                  payouts={payouts}
                  auditLogs={auditLogs}
                  loading={detailLoading}
                  actionLoading={actionLoading}
                  onAction={runWalletAction}
                />
              ) : null}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function WalletDetail({ wallet, transactions, payouts, auditLogs, loading, actionLoading, onAction }: {
  wallet: AdminWallet;
  transactions: WalletTransaction[];
  payouts: AdminPayout[];
  auditLogs: WalletAuditLog[];
  loading: boolean;
  actionLoading: string;
  onAction: (action: 'freeze' | 'unfreeze' | BankAccountStatus) => Promise<void>;
}) {
  const bank = wallet.bankAccount;
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Chi tiết ví</p><h2 className="mt-1 text-lg font-semibold">Seller {shortId(wallet.sellerId)}</h2><p className="mt-1 break-all font-mono text-xs text-slate-500">{wallet.id}</p></div>
        <div className="flex flex-wrap gap-2">
          <ActionButton disabled={Boolean(actionLoading)} tone={wallet.isFrozen ? 'neutral' : 'danger'} onClick={() => void onAction(wallet.isFrozen ? 'unfreeze' : 'freeze')}>{wallet.isFrozen ? 'Mở khóa ví' : 'Đóng băng ví'}</ActionButton>
          {bank && bank.status !== 'ALLOWLISTED' ? <ActionButton disabled={Boolean(actionLoading)} tone="success" onClick={() => void onAction('ALLOWLISTED')}>Xác minh ngân hàng</ActionButton> : null}
          {bank && bank.status !== 'DISABLED' ? <ActionButton disabled={Boolean(actionLoading)} tone="danger" onClick={() => void onAction('DISABLED')}>Khóa ngân hàng</ActionButton> : null}
          {bank && bank.status === 'ALLOWLISTED' ? <ActionButton disabled={Boolean(actionLoading)} tone="neutral" onClick={() => void onAction('UNVERIFIED')}>Yêu cầu xác minh lại</ActionButton> : null}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><MetricCard label="Tạm giữ" value={formatMoney(wallet.heldAmount)} /><MetricCard label="Khả dụng" value={formatMoney(wallet.availableAmount)} /><MetricCard label="Đang payout" value={formatMoney(wallet.payoutPendingAmount)} /><MetricCard label="Đã payout" value={formatMoney(wallet.totalPaidOut)} /></div>
      <div className="grid gap-4 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
        <div className="rounded-lg border border-slate-200 p-4"><h3 className="font-semibold">Tài khoản nhận tiền</h3>{bank ? <div className="mt-3 space-y-2 text-sm"><InfoRow label="Ngân hàng" value={bank.bankCode} /><InfoRow label="Số tài khoản" value={bank.maskedAccountNumber} /><InfoRow label="Chủ tài khoản" value={bank.accountHolderName} /><InfoRow label="Trạng thái" value={<StatusBadge value={bank.status} />} /><InfoRow label="Cập nhật" value={formatDate(bank.updatedAt)} /></div> : <p className="mt-3 text-sm text-slate-500">Seller chưa thiết lập tài khoản ngân hàng.</p>}</div>
        <DataTable title="Yêu cầu rút tiền" empty="Chưa có payout." loading={loading} headers={['Thời gian', 'Số tiền', 'Ngân hàng', 'Trạng thái']} rows={payouts.map((item) => [formatDate(item.requestedAt), formatMoney(item.amount), `${item.bankCode} ${item.maskedAccountNumber}`, <StatusBadge key={item.id} value={item.status} />])} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <DataTable title="Giao dịch ví" empty="Chưa có giao dịch." loading={loading} headers={['Thời gian', 'Loại', 'Tham chiếu', 'Số tiền']} rows={transactions.map((item) => [formatDate(item.occurredAt), item.type, shortId(item.referenceId), formatSignedMoney(item.amount)])} />
        <DataTable title="Nhật ký quản trị" empty="Chưa có thao tác quản trị." loading={loading} headers={['Thời gian', 'Thao tác', 'Admin', 'Lý do']} rows={auditLogs.map((item) => [formatDate(item.createdAt), `${item.action}${item.newStatus ? ` → ${item.newStatus}` : ''}`, item.actorEmail, item.reason])} />
      </div>
    </section>
  );
}

function SidebarLink({ href, label, active = false }: { href: string; label: string; active?: boolean }) { return <Link href={href} className={`block rounded-md px-2.5 py-2 text-sm ${active ? 'border-l-2 border-brand-600 bg-brand-50 font-semibold text-brand-700' : 'text-slate-700 hover:bg-slate-50'}`}>{label}</Link>; }
function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) { return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>{hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}</div>; }
function InfoRow({ label, value }: { label: string; value: ReactNode }) { return <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2"><span className="text-slate-500">{label}</span><span className="text-right font-medium">{value}</span></div>; }
function PageButton({ children, disabled, onClick }: { children: ReactNode; disabled: boolean; onClick: () => void }) { return <button type="button" disabled={disabled} onClick={onClick} className="rounded-md border border-slate-300 px-3 py-1.5 font-medium disabled:cursor-not-allowed disabled:opacity-40">{children}</button>; }
function ActionButton({ children, disabled, tone, onClick }: { children: ReactNode; disabled: boolean; tone: 'success' | 'danger' | 'neutral'; onClick: () => void }) { const style = tone === 'success' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : tone === 'danger' ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-300 bg-white text-slate-700'; return <button type="button" disabled={disabled} onClick={onClick} className={`rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-50 ${style}`}>{children}</button>; }
function StatusBadge({ value }: { value: string }) { const success = ['ACTIVE', 'ALLOWLISTED', 'SUCCEEDED'].includes(value); const danger = ['FROZEN', 'DISABLED', 'FAILED', 'CANCELLED'].includes(value); const label: Record<string, string> = { ACTIVE: 'Hoạt động', FROZEN: 'Đóng băng', ALLOWLISTED: 'Đã xác minh', UNVERIFIED: 'Chờ xác minh', DISABLED: 'Đã khóa', MISSING: 'Chưa thiết lập', REQUESTED: 'Đã yêu cầu', PROCESSING: 'Đang xử lý', SUCCEEDED: 'Thành công', FAILED: 'Thất bại', CANCELLED: 'Đã hủy' }; return <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${success ? 'bg-emerald-100 text-emerald-700' : danger ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{label[value] ?? value}</span>; }
function DataTable({ title, headers, rows, empty, loading }: { title: string; headers: string[]; rows: ReactNode[][]; empty: string; loading: boolean }) { return <div className="overflow-hidden rounded-lg border border-slate-200"><div className="border-b border-slate-200 px-4 py-3"><h3 className="font-semibold">{title}</h3></div><div className="max-h-[340px] overflow-auto"><table className="min-w-full divide-y divide-slate-200 text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr>{headers.map((header) => <th key={header} className="px-3 py-2 font-semibold">{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="max-w-[220px] px-3 py-2 align-top text-slate-700">{cell}</td>)}</tr>)}{!loading && rows.length === 0 ? <tr><td colSpan={headers.length} className="px-3 py-8 text-center text-slate-500">{empty}</td></tr> : null}{loading ? <tr><td colSpan={headers.length} className="px-3 py-8 text-center text-slate-500">Đang tải...</td></tr> : null}</tbody></table></div></div>; }
function formatMoney(value: number) { return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value); }
function formatSignedMoney(value: number) { return `${value > 0 ? '+' : ''}${formatMoney(value)}`; }
function formatDate(value: string) { return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
function shortId(value: string) { return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value; }
function toMessage(error: unknown, fallback: string) { return error instanceof ModeratorApiClientError ? error.message : fallback; }
