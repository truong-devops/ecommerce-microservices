'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModeratorTopbar } from '@/components/layout/moderator-topbar';
import { ModeratorApiClientError } from '@/lib/api/client';
import { listChatViolations } from '@/lib/api/moderation';
import type { ChatViolation } from '@/lib/api/types';
import { useAuth } from '@/providers/AppProvider';

const RULE_OPTIONS = [
  { label: 'Tất cả rule', value: '' },
  { label: 'Số điện thoại', value: 'phone_number' },
  { label: 'Email', value: 'email' },
  { label: 'Link ngoài', value: 'external_link' },
  { label: 'Nền tảng liên hệ', value: 'external_contact_platform' },
  { label: 'Rủ liên hệ ngoài', value: 'external_contact_intent' },
  { label: 'Thanh toán ngoài sàn', value: 'off_platform_payment' },
  { label: 'Trao đổi địa chỉ', value: 'address_exchange' },
  { label: 'Cố tình lách', value: 'obfuscated_contact' }
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
    return <main className="flex min-h-screen items-center justify-center text-sm text-slate-600">Đang kiểm tra phiên đăng nhập...</main>;
  }

  if (!user || !accessToken) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <ModeratorTopbar email={user.email} role={user.role} onLogout={handleLogout} />

      <div className="mx-auto grid w-full max-w-[1660px] gap-4 px-3 py-3 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-4">
        <aside className="hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:block">
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Workspace</p>
          <nav className="space-y-1">
            <Link href="/" className="block rounded-md px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-50">
              Product Queue
            </Link>
            <Link href="/videos/review" className="block rounded-md px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-50">
              Video Review Queue
            </Link>
            <Link href="/chat/violations" className="block rounded-md border-l-2 border-brand-600 bg-brand-50 px-2.5 py-2 text-sm font-semibold text-brand-700">
              Chat Violations
            </Link>
          </nav>
        </aside>

        <main className="min-w-0 space-y-3">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold">Chat Violations</h1>
                <p className="text-sm text-slate-500">Theo dõi các tin nhắn bị chặn do trao đổi thông tin liên hệ hoặc giao dịch ngoài sàn.</p>
              </div>
              <span className="rounded-md bg-brand-600 px-3 py-1 text-xs font-semibold text-white">Total: {totalItems}</span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <MetricCard label="Đang hiển thị" value={items.length} />
              <MetricCard label="Người gửi" value={stats.uniqueSenders} />
              <MetricCard label="Rủi ro cao" value={stats.highRisk} />
            </div>

            <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[180px_160px_1fr_1fr_auto]">
              <select
                value={ruleFilter}
                onChange={(event) => {
                  setRuleFilter(event.target.value);
                  setPage(1);
                }}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
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
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="20">20 / page</option>
                <option value="50">50 / page</option>
                <option value="100">100 / page</option>
              </select>
              <input
                value={senderFilter}
                onChange={(event) => setSenderFilter(event.target.value)}
                placeholder="Lọc theo senderId"
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
              />
              <input
                value={conversationFilter}
                onChange={(event) => setConversationFilter(event.target.value)}
                placeholder="Lọc theo conversationId"
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  setPage(1);
                  void loadViolations();
                }}
                className="h-10 rounded-md bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Lọc
              </button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-xs font-medium uppercase text-slate-500">
                Từ thời điểm
                <input
                  type="datetime-local"
                  value={createdFrom}
                  onChange={(event) => {
                    setCreatedFrom(event.target.value);
                    setPage(1);
                  }}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900"
                />
              </label>
              <label className="text-xs font-medium uppercase text-slate-500">
                Đến thời điểm
                <input
                  type="datetime-local"
                  value={createdTo}
                  onChange={(event) => {
                    setCreatedTo(event.target.value);
                    setPage(1);
                  }}
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900"
                />
              </label>
            </div>
          </section>

          {error ? <section className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</section> : null}

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Thời gian</th>
                    <th className="px-4 py-3">Người gửi</th>
                    <th className="px-4 py-3">Rule</th>
                    <th className="px-4 py-3">Điểm</th>
                    <th className="px-4 py-3">Nội dung đã ẩn</th>
                    <th className="px-4 py-3">Conversation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                        Đang tải...
                      </td>
                    </tr>
                  ) : null}
                  {!loading && items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                        Chưa có vi phạm chat.
                      </td>
                    </tr>
                  ) : null}
                  {!loading
                    ? items.map((item) => (
                        <tr key={item.id} className="align-top">
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(item.createdAt)}</td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">{item.senderRole}</p>
                            <p className="font-mono text-xs text-slate-500">{item.senderId}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{formatRule(item.ruleId)}</span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-brand-700">{item.score}</td>
                          <td className="max-w-xl px-4 py-3 text-slate-700">{item.textPreview || '-'}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">{item.conversationId}</td>
                        </tr>
                      ))
                    : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
            <p className="text-slate-600">
              Page {page}/{Math.max(1, totalPages)}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="rounded-md border border-slate-200 px-3 py-1.5 font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => current + 1)}
                disabled={page >= totalPages}
                className="rounded-md border border-slate-200 px-3 py-1.5 font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value.toLocaleString('vi-VN')}</p>
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
