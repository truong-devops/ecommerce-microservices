'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModeratorTopbar } from '@/components/layout/moderator-topbar';
import { ModeratorSidebar } from '@/components/layout/moderator-sidebar';
import { StatCard } from '@/components/ui/stat-card';
import {
  MessageIcon,
  SearchIcon,
  FilterIcon,
  CopyIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  UsersIcon,
  PackageIcon
} from '@/components/ui/icons';
import { ModeratorApiClientError } from '@/lib/api/client';
import { listChatViolations } from '@/lib/api/moderation';
import type { ChatViolation } from '@/lib/api/types';
import { useAuth } from '@/providers/AppProvider';

const RULE_OPTIONS = [
  { label: 'Tất cả vi phạm', value: '' },
  { label: 'Số điện thoại', value: 'phone_number' },
  { label: 'Địa chỉ Email', value: 'email' },
  { label: 'Liên kết ngoài', value: 'external_link' },
  { label: 'Nền tảng liên hệ khác', value: 'external_contact_platform' },
  { label: 'Ý định liên hệ ngoài sàn', value: 'external_contact_intent' },
  { label: 'Thanh toán ngoài sàn', value: 'off_platform_payment' },
  { label: 'Trao đổi địa chỉ giao hàng', value: 'address_exchange' },
  { label: 'Cố tình lách từ khóa', value: 'obfuscated_contact' }
];

export default function ChatViolationsPage() {
  const router = useRouter();
  const { ready, user, accessToken, logout } = useAuth();
  const [items, setItems] = useState<ChatViolation[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [senderFilter, setSenderFilter] = useState('');
  const [conversationFilter, setConversationFilter] = useState('');
  const [ruleFilter, setRuleFilter] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    void navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const loadViolations = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await listChatViolations({
        accessToken,
        page,
        pageSize,
        senderId: senderFilter.trim() || undefined,
        conversationId: conversationFilter.trim() || undefined,
        ruleId: ruleFilter || undefined,
        createdFrom: toIsoTime(createdFrom),
        createdTo: toIsoTime(createdTo)
      });
      setItems(response.items ?? []);
      setTotalItems(response.pagination.totalItems);
      setTotalPages(response.pagination.totalPages);
    } catch (loadError) {
      setError(loadError instanceof ModeratorApiClientError ? loadError.message : 'Không tải được danh sách vi phạm chat.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, conversationFilter, createdFrom, createdTo, page, pageSize, ruleFilter, senderFilter]);

  useEffect(() => {
    if (!ready || !accessToken) {
      return;
    }
    void loadViolations();
  }, [accessToken, loadViolations, ready]);

  useEffect(() => {
    if (ready && (!user || !accessToken)) {
      router.replace('/login');
    }
  }, [accessToken, ready, router, user]);

  const stats = useMemo(() => {
    const uniqueSenders = new Set(items.map((item) => item.senderId));
    const highRisk = items.filter((item) => item.score >= 90).length;
    return { uniqueSenders: uniqueSenders.size, highRisk };
  }, [items]);

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

  if (!user || !accessToken) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900">
      <ModeratorTopbar email={user.email} role={user.role} onLogout={handleLogout} />

      <div className="mx-auto w-full max-w-[1760px] px-3 py-5 sm:px-5 lg:px-6">
        <div className="grid gap-5 lg:grid-cols-[256px_minmax(0,1fr)]">
          {/* Sidebar */}
          <div className="hidden lg:block">
            <ModeratorSidebar role={user.role} chatViolationCount={totalItems} />
          </div>

          <main className="min-w-0 space-y-4">
            {/* Header */}
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-rose-700">
                      Chat Security &amp; Policy
                    </span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs font-semibold text-slate-500">
                      Tổng {totalItems} tin nhắn bị chặn
                    </span>
                  </div>
                  <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                    Vi phạm tin nhắn (Chat Violations)
                  </h1>
                  <p className="mt-1 text-sm text-slate-500 max-w-2xl leading-relaxed">
                    Theo dõi và kiểm tra các tin nhắn trò chuyện bị chặn tự động do trao đổi số điện thoại, mạng xã hội, hoặc rủ rê giao dịch ngoài sàn.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
                  >
                    <PackageIcon size={14} className="text-brand-600" />
                    <span>Product Queue</span>
                  </Link>
                </div>
              </div>

              {/* Stats */}
              <div className="mt-5 grid gap-3.5 sm:grid-cols-3">
                <StatCard
                  label="Đang hiển thị"
                  value={items.length}
                  hint={`Trên trang ${page}`}
                  icon={<MessageIcon size={18} />}
                  tone="default"
                />
                <StatCard
                  label="Người gửi vi phạm"
                  value={stats.uniqueSenders}
                  hint="Tài khoản có tin nhắn bị chặn"
                  icon={<UsersIcon size={18} />}
                  tone="amber"
                />
                <StatCard
                  label="Mức rủi ro cao (≥ 90)"
                  value={stats.highRisk}
                  hint="Cần xem xét khóa chat"
                  icon={<AlertTriangleIcon size={18} />}
                  tone="rose"
                />
              </div>

              {/* Filter Toolbar */}
              <div className="mt-5 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3.5 space-y-3">
                <div className="grid gap-2.5 lg:grid-cols-[200px_130px_1fr_1fr_auto]">
                  <select
                    value={ruleFilter}
                    onChange={(event) => {
                      setRuleFilter(event.target.value);
                      setPage(1);
                    }}
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs outline-none focus:border-brand-500"
                  >
                    {RULE_OPTIONS.map((option) => (
                      <option key={option.value || 'all'} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={String(pageSize)}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setPage(1);
                    }}
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs outline-none focus:border-brand-500"
                  >
                    <option value="20">20 / trang</option>
                    <option value="50">50 / trang</option>
                    <option value="100">100 / trang</option>
                  </select>

                  <div className="relative">
                    <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={senderFilter}
                      onChange={(event) => setSenderFilter(event.target.value)}
                      placeholder="Lọc theo Sender ID..."
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-medium text-slate-900 shadow-2xs outline-none focus:border-brand-500"
                    />
                  </div>

                  <div className="relative">
                    <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={conversationFilter}
                      onChange={(event) => setConversationFilter(event.target.value)}
                      placeholder="Lọc theo Conversation ID..."
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-medium text-slate-900 shadow-2xs outline-none focus:border-brand-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setPage(1);
                      void loadViolations();
                    }}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 text-xs font-bold text-white shadow-subtle hover:bg-brand-700 active:scale-95"
                  >
                    <FilterIcon size={13} />
                    <span>Lọc</span>
                  </button>
                </div>

                {/* Date range */}
                <div className="grid gap-3 pt-2 border-t border-slate-200/60 md:grid-cols-2 text-xs">
                  <label className="font-semibold text-slate-600">
                    Từ ngày
                    <input
                      type="datetime-local"
                      value={createdFrom}
                      onChange={(event) => {
                        setCreatedFrom(event.target.value);
                        setPage(1);
                      }}
                      className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal text-slate-800 shadow-2xs outline-none"
                    />
                  </label>
                  <label className="font-semibold text-slate-600">
                    Đến ngày
                    <input
                      type="datetime-local"
                      value={createdTo}
                      onChange={(event) => {
                        setCreatedTo(event.target.value);
                        setPage(1);
                      }}
                      className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 font-normal text-slate-800 shadow-2xs outline-none"
                    />
                  </label>
                </div>
              </div>
            </section>

            {/* Error */}
            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-xs font-semibold text-rose-800 shadow-2xs">
                {error}
              </div>
            ) : null}

            {/* Table */}
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
                  <thead className="bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3.5">Thời gian</th>
                      <th className="px-4 py-3.5">Người gửi</th>
                      <th className="px-4 py-3.5">Quy tắc vi phạm</th>
                      <th className="px-4 py-3.5">Điểm rủi ro</th>
                      <th className="px-4 py-3.5">Nội dung bị ẩn</th>
                      <th className="px-4 py-3.5">Hội thoại</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-xs text-slate-500">
                          <div className="flex items-center justify-center gap-2">
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                            <span>Đang tải danh sách vi phạm...</span>
                          </div>
                        </td>
                      </tr>
                    ) : null}

                    {!loading && items.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-xs">
                          Chưa ghi nhận vi phạm nào trong khoảng thời gian đã chọn.
                        </td>
                      </tr>
                    ) : null}

                    {!loading
                      ? items.map((item) => {
                          const isHighRisk = item.score >= 90;
                          const isMediumRisk = item.score >= 70;
                          return (
                            <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-500">
                                {formatDate(item.createdAt)}
                              </td>

                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <p className="font-bold text-slate-900 text-xs">
                                  {item.senderName?.trim() || formatSenderRole(item.senderRole)}
                                </p>
                                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                                  <span>{formatSenderRole(item.senderRole)}</span>
                                  <span>·</span>
                                  <button
                                    type="button"
                                    onClick={() => copyToClipboard(item.senderId, `sender-${item.id}`)}
                                    className="font-mono text-slate-500 hover:text-brand-600 inline-flex items-center gap-1"
                                    title="Sao chép Sender ID"
                                  >
                                    <span>{shortId(item.senderId)}</span>
                                    {copiedKey === `sender-${item.id}` ? (
                                      <CheckCircle2Icon size={11} className="text-emerald-600" />
                                    ) : (
                                      <CopyIcon size={10} />
                                    )}
                                  </button>
                                </div>
                              </td>

                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs">
                                  {formatRule(item.ruleId)}
                                </span>
                              </td>

                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-black border ${
                                    isHighRisk
                                      ? 'border-rose-200 bg-rose-50 text-rose-700'
                                      : isMediumRisk
                                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                                        : 'border-slate-200 bg-slate-50 text-slate-700'
                                  }`}
                                >
                                  {item.score}
                                </span>
                              </td>

                              <td className="max-w-md px-4 py-3.5">
                                <p className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-2 text-xs font-medium text-slate-800 line-clamp-2 italic">
                                  &ldquo;{item.textPreview || 'Tin nhắn không có nội dung văn bản'}&rdquo;
                                </p>
                              </td>

                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(item.conversationId, `conv-${item.id}`)}
                                  className="font-mono text-xs text-slate-500 hover:text-brand-600 inline-flex items-center gap-1"
                                  title="Sao chép Conversation ID"
                                >
                                  <span>{shortId(item.conversationId)}</span>
                                  {copiedKey === `conv-${item.id}` ? (
                                    <CheckCircle2Icon size={11} className="text-emerald-600" />
                                  ) : (
                                    <CopyIcon size={10} />
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      : null}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-xs text-slate-500">
                <span>
                  Trang <strong className="text-slate-800">{page}</strong> trên{' '}
                  <strong className="text-slate-800">{Math.max(1, totalPages)}</strong> ({totalItems} vi phạm)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((c) => Math.max(1, c - 1))}
                    disabled={page <= 1}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeftIcon size={13} />
                    <span>Trước</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((c) => c + 1)}
                    disabled={page >= totalPages}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>Sau</span>
                    <ChevronRightIcon size={13} />
                  </button>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

function formatRule(ruleId: string): string {
  return RULE_OPTIONS.find((item) => item.value === ruleId)?.label ?? ruleId;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'medium'
  }).format(date);
}

function toIsoTime(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function formatSenderRole(role: string): string {
  const normalized = role.trim().toUpperCase();
  if (normalized === 'SELLER') return 'Người bán';
  if (normalized === 'CUSTOMER' || normalized === 'BUYER') return 'Khách hàng';
  if (normalized === 'ADMIN' || normalized === 'SUPER_ADMIN') return 'Quản trị viên';
  if (normalized === 'SUPPORT') return 'Hỗ trợ';
  return role || 'Không xác định';
}

function shortId(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 16 ? `${trimmed.slice(0, 8)}...${trimmed.slice(-6)}` : trimmed;
}
