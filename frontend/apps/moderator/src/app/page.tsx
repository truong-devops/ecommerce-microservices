'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModeratorTopbar } from '@/components/layout/moderator-topbar';
import { ProductModerationBoard } from '@/components/moderation/product-moderation-board';
import { ModeratorApiClientError } from '@/lib/api/client';
import { listModerationProducts, updateModerationProductStatus } from '@/lib/api/moderation';
import type { ModerationProduct, ModerationProductStatus } from '@/lib/api/types';
import { useAuth } from '@/providers/AppProvider';

const STATUS_FILTER_OPTIONS: Array<{ label: string; value: '' | ModerationProductStatus }> = [
  { label: 'All Status', value: '' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Hidden', value: 'HIDDEN' },
  { label: 'Archived', value: 'ARCHIVED' }
];

const SIDEBAR_ITEMS = ['Moderation Queue', 'Reports', 'Policy Rules', 'Audit Trail', 'Moderators', 'System Logs'];

export default function ModeratorDashboardPage() {
  const router = useRouter();
  const { ready, user, accessToken, logout } = useAuth();

  const [items, setItems] = useState<ModerationProduct[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [hasNext, setHasNext] = useState(false);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'' | ModerationProductStatus>('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadProducts = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await listModerationProducts({
        accessToken,
        page,
        pageSize,
        status: statusFilter || undefined,
        search: search || undefined
      });

      setItems(response.items);
      setHasNext(response.hasNext);
      setTotalItems(response.totalItems);
      setTotalPages(response.totalPages);
    } catch (loadError) {
      if (loadError instanceof ModeratorApiClientError) {
        setError(loadError.message);
      } else {
        setError('Không tải được danh sách sản phẩm.');
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, page, pageSize, search, statusFilter]);

  useEffect(() => {
    if (!ready || !accessToken) {
      return;
    }

    void loadProducts();
  }, [ready, accessToken, loadProducts]);

  useEffect(() => {
    if (ready && (!user || !accessToken)) {
      router.replace('/login');
    }
  }, [accessToken, ready, router, user]);

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  const handleUpdateStatus = useCallback(
    async (productId: string, status: ModerationProductStatus) => {
      if (!accessToken) {
        return;
      }

      setNotice('');
      const reason = window.prompt(`Nhập lý do đổi trạng thái -> ${status} (optional):`) ?? '';

      try {
        const updated = await updateModerationProductStatus(accessToken, productId, {
          status,
          reason: reason.trim() || undefined
        });

        setItems((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));
        setNotice(`Đã cập nhật sản phẩm ${updated.name} -> ${updated.status}`);
      } catch (updateError) {
        if (updateError instanceof ModeratorApiClientError) {
          setError(updateError.message);
        } else {
          setError('Cập nhật trạng thái thất bại.');
        }
      }
    },
    [accessToken]
  );

  const stats = useMemo(() => {
    let draft = 0;
    let active = 0;
    let hidden = 0;
    let archived = 0;

    for (const item of items) {
      if (item.status === 'DRAFT') {
        draft += 1;
      } else if (item.status === 'ACTIVE') {
        active += 1;
      } else if (item.status === 'HIDDEN') {
        hidden += 1;
      } else if (item.status === 'ARCHIVED') {
        archived += 1;
      }
    }

    return { draft, active, hidden, archived };
  }, [items]);

  if (!ready) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-slate-600">Đang kiểm tra phiên đăng nhập...</main>;
  }

  if (!user || !accessToken) {
    return null;
  }

  return (
    <div className="min-h-screen text-slate-900">
      <ModeratorTopbar email={user.email} role={user.role} onLogout={handleLogout} />

      <div className="mx-auto w-full max-w-[1660px] px-3 py-3 lg:px-4">
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:block">
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Workspace</p>
            <nav className="space-y-1">
              {SIDEBAR_ITEMS.map((item, index) => (
                <button
                  key={item}
                  type="button"
                    className={[
                      'w-full rounded-md px-2.5 py-2 text-left text-sm transition',
                      index === 0 ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-50'
                    ].join(' ')}
                  >
                    {item}
                </button>
              ))}
            </nav>
          </aside>

          <main className="min-w-0 space-y-3">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-semibold text-slate-900">Moderator Dashboard</h1>
                  <p className="text-sm text-slate-500">Back-office panel for listing review, enforcement action, and policy compliance.</p>
                </div>
                <span className="rounded-md bg-brand-600 px-3 py-1 text-xs font-semibold text-white">Open Queue: {totalItems}</span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Draft" value={stats.draft} />
                <MetricCard label="Active" value={stats.active} />
                <MetricCard label="Hidden" value={stats.hidden} />
                <MetricCard label="Archived" value={stats.archived} />
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="grid gap-3 md:grid-cols-[220px_180px_1fr_auto]">
                  <select
                    value={statusFilter}
                    onChange={(event) => {
                      setStatusFilter(event.target.value as '' | ModerationProductStatus);
                      setPage(1);
                    }}
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                  >
                    {STATUS_FILTER_OPTIONS.map((option) => (
                      <option key={option.label} value={option.value}>
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
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search by product name, slug, SKU"
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      setSearch(searchInput.trim());
                      setPage(1);
                    }}
                    className="h-10 rounded-md bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </section>

            {notice ? <section className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</section> : null}
            {error ? <section className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</section> : null}

            <ProductModerationBoard items={items} loading={loading} onUpdateStatus={handleUpdateStatus} />

            <section className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
              <p className="text-slate-600">
                Page {page}/{Math.max(1, totalPages)}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1 || loading}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={!hasNext || loading}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-800">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </article>
  );
}
