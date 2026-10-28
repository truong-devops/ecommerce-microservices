'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModeratorTopbar } from '@/components/layout/moderator-topbar';
import { ModeratorSidebar } from '@/components/layout/moderator-sidebar';
import { ProductModerationBoard } from '@/components/moderation/product-moderation-board';
import { StatCard } from '@/components/ui/stat-card';
import {
  SearchIcon,
  RefreshCwIcon,
  VideoIcon,
  MessageIcon,
  CheckCircle2Icon,
  EyeOffIcon,
  Edit3Icon,
  ArchiveIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FilterIcon
} from '@/components/ui/icons';
import { ModeratorApiClientError } from '@/lib/api/client';
import { listModerationProducts, updateModerationProductStatus } from '@/lib/api/moderation';
import type { ModerationProduct, ModerationProductStatus } from '@/lib/api/types';
import { useAuth } from '@/providers/AppProvider';

const STATUS_TABS: Array<{ label: string; value: '' | ModerationProductStatus }> = [
  { label: 'Tất cả trạng thái', value: '' },
  { label: 'Đang bán (Active)', value: 'ACTIVE' },
  { label: 'Bản nháp (Draft)', value: 'DRAFT' },
  { label: 'Đã ẩn (Hidden)', value: 'HIDDEN' },
  { label: 'Lưu trữ (Archived)', value: 'ARCHIVED' }
];

export default function ModeratorDashboardPage() {
  const router = useRouter();
  const { ready, user, accessToken, logout } = useAuth();

  const [items, setItems] = useState<ModerationProduct[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
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
    async (productId: string, status: ModerationProductStatus, reason?: string) => {
      if (!accessToken) {
        return;
      }

      setNotice('');
      setError('');

      try {
        const updated = await updateModerationProductStatus(accessToken, productId, {
          status,
          reason: reason || undefined
        });

        setItems((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));
        setNotice(`Đã chuyển sản phẩm "${updated.name}" sang trạng thái ${updated.status}.`);
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
    <div className="min-h-screen bg-[#f5f5f5] text-[#222222]">
      <ModeratorTopbar email={user.email} role={user.role} onLogout={handleLogout} />

      <div className="mx-auto w-full max-w-[1760px] px-3 py-4 sm:px-5 lg:px-6">
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          {/* Unified Sidebar */}
          <div className="hidden lg:block">
            <ModeratorSidebar role={user.role} productCount={totalItems} />
          </div>

          {/* Main Content Area */}
          <main className="min-w-0 space-y-3.5">
            {/* Page Header Card */}
            <section className="rounded-lg border border-[#e8e8e8] bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-[#fef6f5] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#ee4d2d] border border-[#fcdcd7]">
                      Listing Compliance
                    </span>
                    <span className="text-xs text-[#999999]">·</span>
                    <span className="text-xs font-medium text-[#757575]">
                      Tổng {totalItems} sản phẩm trong hàng đợi
                    </span>
                  </div>
                  <h1 className="mt-1 text-xl font-bold tracking-tight text-[#222222]">
                    Kiểm duyệt sản phẩm
                  </h1>
                  <p className="mt-1 text-xs text-[#757575] max-w-2xl leading-relaxed">
                    Xem xét danh sách đăng bán từ người bán, xác minh nội dung, hình ảnh và phân loại trước khi hiển thị cho người mua.
                  </p>
                </div>

                {/* Quick actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="/videos/review"
                    className="inline-flex items-center gap-1.5 rounded border border-[#e8e8e8] bg-white px-3 py-1.5 text-xs font-semibold text-[#555555] transition hover:border-[#ee4d2d] hover:text-[#ee4d2d]"
                  >
                    <VideoIcon size={14} className="text-[#ee4d2d]" />
                    <span>Video Review</span>
                  </Link>

                  <Link
                    href="/chat/violations"
                    className="inline-flex items-center gap-1.5 rounded border border-[#e8e8e8] bg-white px-3 py-1.5 text-xs font-semibold text-[#555555] transition hover:border-[#ee4d2d] hover:text-[#ee4d2d]"
                  >
                    <MessageIcon size={14} className="text-[#555555]" />
                    <span>Chat Violations</span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => void loadProducts()}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 rounded bg-[#ee4d2d] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#d73211] active:scale-95 disabled:opacity-60"
                  >
                    <RefreshCwIcon size={13} className={loading ? 'animate-spin' : ''} />
                    <span>{loading ? 'Đang tải...' : 'Làm mới'}</span>
                  </button>
                </div>
              </div>

              {/* Metric Stat Cards */}
              <div className="mt-4 grid gap-3 grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Bản nháp"
                  value={stats.draft}
                  hint="Sản phẩm đang soạn thảo"
                  icon={<Edit3Icon size={18} />}
                  active={statusFilter === 'DRAFT'}
                  onClick={() => {
                    setStatusFilter(statusFilter === 'DRAFT' ? '' : 'DRAFT');
                    setPage(1);
                  }}
                />
                <StatCard
                  label="Đang bán"
                  value={stats.active}
                  hint="Hiển thị trên sàn eMall"
                  icon={<CheckCircle2Icon size={18} />}
                  active={statusFilter === 'ACTIVE'}
                  onClick={() => {
                    setStatusFilter(statusFilter === 'ACTIVE' ? '' : 'ACTIVE');
                    setPage(1);
                  }}
                />
                <StatCard
                  label="Đã ẩn"
                  value={stats.hidden}
                  hint="Tạm khóa hoặc vi phạm"
                  icon={<EyeOffIcon size={18} />}
                  active={statusFilter === 'HIDDEN'}
                  onClick={() => {
                    setStatusFilter(statusFilter === 'HIDDEN' ? '' : 'HIDDEN');
                    setPage(1);
                  }}
                />
                <StatCard
                  label="Lưu trữ"
                  value={stats.archived}
                  hint="Ngưng kinh doanh"
                  icon={<ArchiveIcon size={18} />}
                  active={statusFilter === 'ARCHIVED'}
                  onClick={() => {
                    setStatusFilter(statusFilter === 'ARCHIVED' ? '' : 'ARCHIVED');
                    setPage(1);
                  }}
                />
              </div>

              {/* Status Filter Tabs & Search Bar */}
              <div className="mt-4 rounded-lg border border-[#e8e8e8] bg-[#fafafa] p-3">
                {/* Tabs */}
                <div className="flex flex-wrap items-center gap-1 border-b border-[#e8e8e8] pb-2.5">
                  {STATUS_TABS.map((tab) => {
                    const isActive = statusFilter === tab.value;
                    return (
                      <button
                        key={tab.label}
                        type="button"
                        onClick={() => {
                          setStatusFilter(tab.value);
                          setPage(1);
                        }}
                        className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
                          isActive
                            ? 'bg-[#ee4d2d] text-white shadow-xs'
                            : 'text-[#555555] hover:bg-white hover:text-[#ee4d2d]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Filter inputs */}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[240px]">
                    <SearchIcon
                      size={15}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999999]"
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
                      placeholder="Tìm theo tên sản phẩm, slug, hoặc mã SKU..."
                      className="h-9 w-full rounded border border-[#e8e8e8] bg-white pl-9 pr-3 text-xs text-[#222222] outline-none transition placeholder:text-[#999999] focus:border-[#ee4d2d]"
                    />
                  </div>

                  <select
                    value={String(pageSize)}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setPage(1);
                    }}
                    className="h-9 rounded border border-[#e8e8e8] bg-white px-2.5 text-xs font-medium text-[#555555] outline-none transition hover:border-[#cccccc] focus:border-[#ee4d2d]"
                  >
                    <option value="20">20 / trang</option>
                    <option value="50">50 / trang</option>
                    <option value="100">100 / trang</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      setSearch(searchInput.trim());
                      setPage(1);
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded bg-[#ee4d2d] px-3.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#d73211] active:scale-95"
                  >
                    <FilterIcon size={13} />
                    <span>Áp dụng lọc</span>
                  </button>

                  {(search || statusFilter) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('');
                        setSearchInput('');
                        setStatusFilter('');
                        setPage(1);
                      }}
                      className="inline-flex h-9 items-center rounded border border-[#e8e8e8] bg-white px-3 text-xs font-medium text-[#555555] transition hover:bg-[#fafafa] hover:text-[#222222]"
                    >
                      Đặt lại
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* Notification & Alerts */}
            {notice ? (
              <section className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-xs font-semibold text-emerald-800 shadow-2xs">
                <CheckCircle2Icon size={16} className="text-emerald-600 shrink-0" />
                <span>{notice}</span>
              </section>
            ) : null}

            {error ? (
              <section className="flex items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-xs font-semibold text-rose-800 shadow-2xs">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-rose-200 text-rose-700 shrink-0 font-bold">
                  !
                </span>
                <span>{error}</span>
              </section>
            ) : null}

            {/* Product Moderation Table */}
            <ProductModerationBoard
              items={items}
              loading={loading}
              onUpdateStatus={handleUpdateStatus}
            />

            {/* Pagination Controls */}
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e8e8e8] bg-white px-4 py-3 shadow-xs">
              <p className="text-xs font-medium text-[#757575]">
                Hiển thị trang <strong className="text-[#222222]">{page}</strong> trên{' '}
                <strong className="text-[#222222]">{Math.max(1, totalPages)}</strong> ({totalItems} sản phẩm)
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1 || loading}
                  className="inline-flex items-center gap-1 rounded border border-[#e8e8e8] bg-white px-3 py-1.5 text-xs font-medium text-[#555555] transition hover:border-[#ee4d2d] hover:text-[#ee4d2d] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeftIcon size={14} />
                  <span>Trang trước</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={!hasNext || loading}
                  className="inline-flex items-center gap-1 rounded border border-[#e8e8e8] bg-white px-3 py-1.5 text-xs font-medium text-[#555555] transition hover:border-[#ee4d2d] hover:text-[#ee4d2d] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>Trang sau</span>
                  <ChevronRightIcon size={14} />
                </button>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
