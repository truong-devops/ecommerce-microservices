'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModeratorSidebar } from '@/components/layout/moderator-sidebar';
import { ModeratorTopbar } from '@/components/layout/moderator-topbar';
import { ActivityIcon, FileTextIcon, HistoryIcon, RefreshCwIcon, SearchIcon, ShieldCheckIcon, UsersIcon } from '@/components/ui/icons';
import { ModeratorApiClientError } from '@/lib/api/client';
import {
  createGovernancePolicy,
  getGovernanceSummary,
  listGovernanceActionLogs,
  listGovernancePolicies,
  listGovernanceSystemLogs,
  listGovernanceTeam,
  updateGovernancePolicy,
  updateGovernanceTeamMember
} from '@/lib/api/governance';
import { listChatViolations, listModerationProducts, listModerationVideos } from '@/lib/api/moderation';
import type { GovernanceActionLog, GovernancePolicy, GovernanceSummary, GovernanceSystemLog, GovernanceTeamMember } from '@/lib/api/types';
import { useAuth } from '@/providers/AppProvider';

type GovernanceSection = 'reports' | 'policies' | 'audit' | 'team' | 'system-logs';

const SECTION_META: Record<GovernanceSection, { title: string; description: string }> = {
  reports: { title: 'Báo cáo & Thống kê', description: 'Tổng hợp tình trạng kiểm duyệt, vi phạm và hoạt động vận hành.' },
  policies: { title: 'Quy chế & Chính sách', description: 'Quản lý nội dung, phiên bản và trạng thái áp dụng của chính sách nền tảng.' },
  audit: { title: 'Nhật ký thao tác', description: 'Theo dõi các quyết định kiểm duyệt và thay đổi cấu hình của đội ngũ.' },
  team: { title: 'Đội ngũ kiểm duyệt', description: 'Kiểm tra quyền truy cập, MFA và trạng thái tài khoản vận hành.' },
  'system-logs': { title: 'Nhật ký hệ thống', description: 'Tra cứu sự kiện xác thực và thông tin kỹ thuật phục vụ điều tra.' }
};

export default function GovernancePage() {
  const params = useParams<{ section: string }>();
  const router = useRouter();
  const { ready, user, accessToken, logout } = useAuth();
  const section = normalizeSection(params?.section);

  useEffect(() => {
    if (ready && (!user || !accessToken)) router.replace('/login');
  }, [accessToken, ready, router, user]);

  useEffect(() => {
    if (ready && section === 'system-logs' && user && !isAdminRole(user.role)) router.replace('/governance/audit');
  }, [ready, router, section, user]);

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  if (!ready) return <LoadingScreen />;
  if (!user || !accessToken) return null;

  const meta = SECTION_META[section];
  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#222222]">
      <ModeratorTopbar email={user.email} role={user.role} onLogout={handleLogout} />
      <div className="mx-auto w-full max-w-[1760px] px-3 py-4 sm:px-5 lg:px-6">
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="hidden lg:block">
            <ModeratorSidebar role={user.role} />
          </div>
          <main className="min-w-0 space-y-4">
            <section className="rounded-lg border border-[#e8e8e8] bg-white p-5 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#ee4d2d]">Governance Center</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">{meta.title}</h1>
              <p className="mt-1 text-sm text-[#757575]">{meta.description}</p>
            </section>
            {section === 'reports' ? <ReportsSection accessToken={accessToken} /> : null}
            {section === 'policies' ? <PoliciesSection accessToken={accessToken} canManage={isAdminRole(user.role)} /> : null}
            {section === 'audit' ? <AuditSection accessToken={accessToken} /> : null}
            {section === 'team' ? <TeamSection accessToken={accessToken} currentUserId={user.id} role={user.role} /> : null}
            {section === 'system-logs' ? <SystemLogsSection accessToken={accessToken} /> : null}
          </main>
        </div>
      </div>
    </div>
  );
}

function ReportsSection({ accessToken }: { accessToken: string }) {
  const [data, setData] = useState<ReportData | null>(null);
  const { loading, error, start, success, fail } = useAsyncState();
  const load = useCallback(async () => {
    start();
    try {
      const [summary, draft, active, hidden, archived, pendingVideos, publishedVideos, rejectedVideos, violations] = await Promise.all([
        getGovernanceSummary(accessToken),
        listModerationProducts({ accessToken, page: 1, pageSize: 1, status: 'DRAFT' }),
        listModerationProducts({ accessToken, page: 1, pageSize: 1, status: 'ACTIVE' }),
        listModerationProducts({ accessToken, page: 1, pageSize: 1, status: 'HIDDEN' }),
        listModerationProducts({ accessToken, page: 1, pageSize: 1, status: 'ARCHIVED' }),
        listModerationVideos({ accessToken, page: 1, pageSize: 1, status: 'review_pending' }),
        listModerationVideos({ accessToken, page: 1, pageSize: 1, status: 'published' }),
        listModerationVideos({ accessToken, page: 1, pageSize: 1, status: 'rejected' }),
        listChatViolations({ accessToken, page: 1, pageSize: 1 })
      ]);
      setData({
        summary,
        products: { draft: draft.totalItems, active: active.totalItems, hidden: hidden.totalItems, archived: archived.totalItems },
        videos: {
          pending: pendingVideos.pagination.totalItems,
          published: publishedVideos.pagination.totalItems,
          rejected: rejectedVideos.pagination.totalItems
        },
        chatViolations: violations.pagination.totalItems
      });
      success();
    } catch (error) {
      fail(errorMessage(error, 'Không tải được báo cáo vận hành.'));
    }
  }, [accessToken, fail, start, success]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = () => {
    if (!data) return;
    const rows = [
      ['Chỉ số', 'Giá trị'],
      ['Sản phẩm đang bán', data.products.active],
      ['Sản phẩm bản nháp', data.products.draft],
      ['Sản phẩm đã ẩn', data.products.hidden],
      ['Sản phẩm lưu trữ', data.products.archived],
      ['Video chờ duyệt', data.videos.pending],
      ['Video đã xuất bản', data.videos.published],
      ['Video bị từ chối', data.videos.rejected],
      ['Vi phạm chat', data.chatViolations],
      ['Thành viên đang hoạt động', data.summary.activeStaffMembers],
      ['Thao tác hôm nay', data.summary.actionsToday]
    ];
    downloadCsv('bao-cao-kiem-duyet.csv', rows);
  };

  return (
    <SectionCard
      title="Tổng quan vận hành"
      icon={<FileTextIcon size={18} />}
      actions={<ActionButtons loading={loading} onRefresh={load} onExport={exportCsv} />}
    >
      <Feedback error={error} />
      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Sản phẩm đang bán" value={data.products.active} note={`${data.products.hidden} sản phẩm đang ẩn`} />
            <Metric label="Video chờ duyệt" value={data.videos.pending} note={`${data.videos.published} video đã xuất bản`} />
            <Metric label="Tín hiệu vi phạm chat" value={data.chatViolations} note="Tổng bản ghi cần theo dõi" />
            <Metric
              label="Thao tác hôm nay"
              value={data.summary.actionsToday}
              note={`${data.summary.activeStaffMembers}/${data.summary.staffMembers} nhân sự hoạt động`}
            />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Breakdown
              title="Trạng thái sản phẩm"
              items={[
                ['Đang bán', data.products.active],
                ['Bản nháp', data.products.draft],
                ['Đã ẩn', data.products.hidden],
                ['Lưu trữ', data.products.archived]
              ]}
            />
            <Breakdown
              title="Trạng thái video"
              items={[
                ['Chờ duyệt', data.videos.pending],
                ['Đã xuất bản', data.videos.published],
                ['Bị từ chối', data.videos.rejected]
              ]}
            />
          </div>
        </>
      ) : (
        <LoadingBlock loading={loading} />
      )}
    </SectionCard>
  );
}

function PoliciesSection({ accessToken, canManage }: { accessToken: string; canManage: boolean }) {
  const [items, setItems] = useState<GovernancePolicy[]>([]);
  const [selected, setSelected] = useState<GovernancePolicy | null>(null);
  const [editing, setEditing] = useState(false);
  const { loading, error, start, success, fail } = useAsyncState();
  const load = useCallback(async () => {
    start();
    try {
      const page = await listGovernancePolicies({ accessToken, page: 1, pageSize: 100 });
      setItems(page.items);
      setSelected((current) => page.items.find((item) => item.id === current?.id) ?? page.items[0] ?? null);
      success();
    } catch (loadError) {
      fail(errorMessage(loadError, 'Không tải được danh sách chính sách.'));
    }
  }, [accessToken, fail, start, success]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SectionCard
      title="Danh mục chính sách"
      icon={<ShieldCheckIcon size={18} />}
      actions={
        <div className="flex gap-2">
          <RefreshButton loading={loading} onClick={load} />
          {canManage ? (
            <button
              onClick={() => {
                setSelected(null);
                setEditing(true);
              }}
              className="primary-button"
            >
              Tạo chính sách
            </button>
          ) : null}
        </div>
      }
    >
      <Feedback error={error} />
      <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-2">
          {items.map((policy) => (
            <button
              key={policy.id}
              onClick={() => {
                setSelected(policy);
                setEditing(false);
              }}
              className={`w-full rounded-lg border p-4 text-left transition ${selected?.id === policy.id ? 'border-[#ee4d2d] bg-[#fef6f5]' : 'border-[#e8e8e8] bg-white hover:border-[#f3a18f]'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">{policy.title}</p>
                <PolicyStatus status={policy.status} />
              </div>
              <p className="mt-1 text-xs text-[#757575]">
                {policy.code} · v{policy.version} · {scopeLabel(policy.scope)}
              </p>
            </button>
          ))}
          {!loading && items.length === 0 ? <Empty text="Chưa có chính sách nào." /> : null}
        </div>
        <div className="rounded-lg border border-[#e8e8e8] bg-[#fafafa] p-5">
          {editing ? (
            <PolicyForm
              accessToken={accessToken}
              policy={selected}
              onDone={async () => {
                setEditing(false);
                await load();
              }}
            />
          ) : selected ? (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[#ee4d2d]">
                    {selected.code} · Phiên bản {selected.version}
                  </p>
                  <h3 className="mt-1 text-xl font-bold">{selected.title}</h3>
                </div>
                {canManage ? (
                  <button onClick={() => setEditing(true)} className="secondary-button">
                    Chỉnh sửa
                  </button>
                ) : null}
              </div>
              <p className="mt-3 text-sm text-[#555555]">{selected.description}</p>
              <div className="mt-4 whitespace-pre-wrap rounded-lg border border-[#e8e8e8] bg-white p-4 text-sm leading-7 text-[#333333]">
                {selected.content}
              </div>
              <p className="mt-3 text-xs text-[#999999]">
                Cập nhật {formatDate(selected.updatedAt)}
                {selected.effectiveAt ? ` · Hiệu lực ${formatDate(selected.effectiveAt)}` : ''}
              </p>
            </div>
          ) : (
            <Empty text="Chọn một chính sách để xem nội dung." />
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function PolicyForm({ accessToken, policy, onDone }: { accessToken: string; policy: GovernancePolicy | null; onDone: () => Promise<void> }) {
  const [form, setForm] = useState({
    code: policy?.code ?? '',
    title: policy?.title ?? '',
    description: policy?.description ?? '',
    scope: policy?.scope ?? 'MARKETPLACE',
    status: policy?.status ?? 'DRAFT',
    content: policy?.content ?? '',
    effectiveAt: policy?.effectiveAt?.slice(0, 10) ?? ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, effectiveAt: form.effectiveAt ? new Date(`${form.effectiveAt}T00:00:00+07:00`).toISOString() : null };
      if (policy) await updateGovernancePolicy(accessToken, policy.id, payload);
      else
        await createGovernancePolicy(accessToken, {
          ...payload,
          effectiveAt: payload.effectiveAt,
          scope: form.scope as GovernancePolicy['scope'],
          status: form.status as GovernancePolicy['status']
        });
      await onDone();
    } catch (saveError) {
      setError(errorMessage(saveError, 'Không lưu được chính sách.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold">{policy ? 'Cập nhật chính sách' : 'Tạo chính sách mới'}</h3>
      <Feedback error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Mã chính sách">
          <input
            disabled={Boolean(policy)}
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            className="input"
          />
        </Field>
        <Field label="Phạm vi">
          <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as GovernancePolicy['scope'] })} className="input">
            <option value="MARKETPLACE">Toàn sàn</option>
            <option value="PRODUCT">Sản phẩm</option>
            <option value="VIDEO">Video & Live</option>
            <option value="CHAT">Chat</option>
            <option value="FINANCE">Tài chính</option>
            <option value="SECURITY">Bảo mật</option>
          </select>
        </Field>
      </div>
      <Field label="Tên chính sách">
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" />
      </Field>
      <Field label="Mô tả">
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" />
      </Field>
      <Field label="Nội dung">
        <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="input min-h-40" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Trạng thái">
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as GovernancePolicy['status'] })} className="input">
            <option value="DRAFT">Bản nháp</option>
            <option value="PUBLISHED">Đang áp dụng</option>
            <option value="ARCHIVED">Lưu trữ</option>
          </select>
        </Field>
        <Field label="Ngày hiệu lực">
          <input type="date" value={form.effectiveAt} onChange={(e) => setForm({ ...form, effectiveAt: e.target.value })} className="input" />
        </Field>
      </div>
      <button
        disabled={saving || !form.code || !form.title || form.content.length < 10}
        onClick={() => void save()}
        className="primary-button w-full disabled:opacity-50"
      >
        {saving ? 'Đang lưu...' : 'Lưu chính sách'}
      </button>
    </div>
  );
}

function AuditSection({ accessToken }: { accessToken: string }) {
  const [items, setItems] = useState<GovernanceActionLog[]>([]);
  const [search, setSearch] = useState('');
  const { loading, error, start, success, fail } = useAsyncState();
  const load = useCallback(async () => {
    start();
    try {
      const page = await listGovernanceActionLogs({ accessToken, page: 1, pageSize: 100, search: search || undefined });
      setItems(page.items);
      success();
    } catch (loadError) {
      fail(errorMessage(loadError, 'Không tải được nhật ký thao tác.'));
    }
  }, [accessToken, fail, search, start, success]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <LogCard
      title="Lịch sử thao tác"
      icon={<HistoryIcon size={18} />}
      search={search}
      setSearch={setSearch}
      load={load}
      loading={loading}
      error={error}
      rows={items.map((item) => [formatDate(item.createdAt), item.actorEmail, actionLabel(item.action), item.description, item.resourceId ?? '—'])}
      headers={['Thời gian', 'Người thực hiện', 'Hành động', 'Nội dung', 'Đối tượng']}
    />
  );
}

function SystemLogsSection({ accessToken }: { accessToken: string }) {
  const [items, setItems] = useState<GovernanceSystemLog[]>([]);
  const [action, setAction] = useState('');
  const { loading, error, start, success, fail } = useAsyncState();
  const load = useCallback(async () => {
    start();
    try {
      const page = await listGovernanceSystemLogs({ accessToken, page: 1, pageSize: 100, action: action || undefined });
      setItems(page.items);
      success();
    } catch (loadError) {
      fail(errorMessage(loadError, 'Không tải được nhật ký hệ thống.'));
    }
  }, [accessToken, action, fail, start, success]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <LogCard
      title="Sự kiện xác thực hệ thống"
      icon={<ActivityIcon size={18} />}
      search={action}
      setSearch={setAction}
      load={load}
      loading={loading}
      error={error}
      placeholder="Lọc theo hành động..."
      rows={items.map((item) => [
        formatDate(item.createdAt),
        item.userEmail ?? 'Hệ thống',
        actionLabel(item.action),
        item.ipAddress ?? '—',
        item.requestId ?? '—'
      ])}
      headers={['Thời gian', 'Tài khoản', 'Sự kiện', 'IP', 'Request ID']}
    />
  );
}

function TeamSection({ accessToken, currentUserId, role }: { accessToken: string; currentUserId: string; role: string }) {
  const [items, setItems] = useState<GovernanceTeamMember[]>([]);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const { loading, error, start, success, fail } = useAsyncState();
  const canManage = isAdminRole(role);
  const canManageRoles = role === 'SUPER_ADMIN';
  const load = useCallback(async () => {
    start();
    try {
      const page = await listGovernanceTeam({ accessToken, page: 1, pageSize: 100, search: search || undefined });
      setItems(page.items);
      success();
    } catch (loadError) {
      fail(errorMessage(loadError, 'Không tải được đội ngũ kiểm duyệt.'));
    }
  }, [accessToken, fail, search, start, success]);
  useEffect(() => {
    void load();
  }, [load]);
  const update = async (member: GovernanceTeamMember, payload: { role?: 'MODERATOR' | 'ADMIN'; isActive?: boolean }) => {
    setNotice('');
    try {
      await updateGovernanceTeamMember(accessToken, member.id, payload);
      setNotice(`Đã cập nhật ${member.email}.`);
      await load();
    } catch (updateError) {
      fail(errorMessage(updateError, 'Không cập nhật được thành viên.'));
    }
  };
  return (
    <SectionCard
      title="Danh sách nhân sự"
      icon={<UsersIcon size={18} />}
      actions={<SearchActions value={search} setValue={setSearch} load={load} loading={loading} />}
    >
      <Feedback error={error} notice={notice} />
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Thành viên</th>
              <th>Vai trò</th>
              <th>Bảo mật</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {items.map((member) => {
              const canManageMember = canManage && member.id !== currentUserId && (canManageRoles || member.role === 'MODERATOR');
              return (
                <tr key={member.id}>
                  <td>
                    <p className="font-semibold">{member.email}</p>
                    <p className="text-xs text-[#999999]">Tham gia {formatDate(member.createdAt)}</p>
                  </td>
                  <td>
                    {canManageRoles && member.id !== currentUserId && member.role !== 'SUPER_ADMIN' ? (
                      <select
                        value={member.role}
                        onChange={(e) => void update(member, { role: e.target.value as 'MODERATOR' | 'ADMIN' })}
                        className="input max-w-36"
                      >
                        <option value="MODERATOR">Moderator</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    ) : (
                      <RoleBadge role={member.role} />
                    )}
                  </td>
                  <td>
                    <span className={member.mfaEnabled ? 'text-emerald-700' : 'text-amber-700'}>
                      {member.mfaEnabled ? 'MFA đã bật' : 'Chưa bật MFA'}
                    </span>
                  </td>
                  <td>
                    <span className={member.isActive ? 'text-emerald-700' : 'text-rose-700'}>{member.isActive ? 'Đang hoạt động' : 'Đã khóa'}</span>
                  </td>
                  <td>
                    {canManageMember ? (
                      <button onClick={() => void update(member, { isActive: !member.isActive })} className="secondary-button">
                        {member.isActive ? 'Khóa truy cập' : 'Mở khóa'}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!loading && items.length === 0 ? <Empty text="Không tìm thấy thành viên." /> : null}
    </SectionCard>
  );
}

function LogCard({
  title,
  icon,
  search,
  setSearch,
  load,
  loading,
  error,
  rows,
  headers,
  placeholder = 'Tìm theo email...'
}: {
  title: string;
  icon: React.ReactNode;
  search: string;
  setSearch: (value: string) => void;
  load: () => Promise<void>;
  loading: boolean;
  error: string;
  rows: string[][];
  headers: string[];
  placeholder?: string;
}) {
  return (
    <SectionCard
      title={title}
      icon={icon}
      actions={<SearchActions value={search} setValue={setSearch} load={load} loading={loading} placeholder={placeholder} />}
    >
      <Feedback error={error} />
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row[0]}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 ? <Empty text="Chưa có dữ liệu nhật ký phù hợp." /> : null}
    </SectionCard>
  );
}

function SectionCard({
  title,
  icon,
  actions,
  children
}: {
  title: string;
  icon: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[#e8e8e8] bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[#333333]">
          <span className="text-[#ee4d2d]">{icon}</span>
          <h2 className="text-base font-bold">{title}</h2>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function SearchActions({
  value,
  setValue,
  load,
  loading,
  placeholder = 'Tìm theo email...'
}: {
  value: string;
  setValue: (value: string) => void;
  load: () => Promise<void>;
  loading: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex gap-2">
      <label className="relative">
        <SearchIcon size={15} className="absolute left-3 top-2.5 text-[#999999]" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void load();
          }}
          placeholder={placeholder}
          className="input w-64 pl-9"
        />
      </label>
      <RefreshButton loading={loading} onClick={load} />
    </div>
  );
}

function ActionButtons({ loading, onRefresh, onExport }: { loading: boolean; onRefresh: () => Promise<void>; onExport: () => void }) {
  return (
    <div className="flex gap-2">
      <button onClick={onExport} className="secondary-button">
        Xuất CSV
      </button>
      <RefreshButton loading={loading} onClick={onRefresh} />
    </div>
  );
}
function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => Promise<void> }) {
  return (
    <button onClick={() => void onClick()} disabled={loading} className="secondary-button inline-flex items-center gap-1.5">
      <RefreshCwIcon size={14} className={loading ? 'animate-spin' : ''} />
      Làm mới
    </button>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-[#555555]">
      {label}
      {children}
    </label>
  );
}
function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-lg border border-[#e8e8e8] border-t-2 border-t-[#ee4d2d] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#757575]">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-[#999999]">{note}</p>
    </div>
  );
}
function Breakdown({ title, items }: { title: string; items: Array<[string, number]> }) {
  const total = Math.max(
    1,
    items.reduce((sum, item) => sum + item[1], 0)
  );
  return (
    <div className="rounded-lg border border-[#e8e8e8] p-4">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.map(([label, value]) => (
          <div key={label}>
            <div className="flex justify-between text-xs">
              <span>{label}</span>
              <b>{value}</b>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#f0f0f0]">
              <div className="h-full rounded-full bg-[#ee4d2d]" style={{ width: `${Math.max(value ? 4 : 0, (value / total) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function PolicyStatus({ status }: { status: GovernancePolicy['status'] }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-[10px] font-bold ${status === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-700' : status === 'DRAFT' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}
    >
      {status === 'PUBLISHED' ? 'Đang áp dụng' : status === 'DRAFT' ? 'Bản nháp' : 'Lưu trữ'}
    </span>
  );
}
function RoleBadge({ role }: { role: string }) {
  return <span className="rounded-full border border-[#e8e8e8] bg-[#fafafa] px-2.5 py-1 text-xs font-semibold">{role}</span>;
}
function Feedback({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) return null;
  return (
    <div
      className={`mb-4 rounded-lg border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
    >
      {error || notice}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-[#dddddd] p-10 text-center text-sm text-[#757575]">{text}</div>;
}
function LoadingBlock({ loading }: { loading: boolean }) {
  return loading ? <div className="p-12 text-center text-sm text-[#757575]">Đang tải dữ liệu...</div> : null;
}
function LoadingScreen() {
  return <main className="flex min-h-screen items-center justify-center bg-[#f5f5f5] text-sm text-[#757575]">Đang kiểm tra phiên đăng nhập...</main>;
}

interface ReportData {
  summary: GovernanceSummary;
  products: { draft: number; active: number; hidden: number; archived: number };
  videos: { pending: number; published: number; rejected: number };
  chatViolations: number;
}

function useAsyncState() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const start = useCallback(() => {
    setLoading(true);
    setError('');
  }, []);
  const success = useCallback(() => setLoading(false), []);
  const fail = useCallback((message: string) => {
    setLoading(false);
    setError(message);
  }, []);
  return useMemo(() => ({ loading, error, start, success, fail }), [error, fail, loading, start, success]);
}

function normalizeSection(value: string | undefined): GovernanceSection {
  return value && value in SECTION_META ? (value as GovernanceSection) : 'reports';
}
function isAdminRole(role: string): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}
function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date) : '—';
}
function scopeLabel(scope: GovernancePolicy['scope']): string {
  return { MARKETPLACE: 'Toàn sàn', PRODUCT: 'Sản phẩm', VIDEO: 'Video & Live', CHAT: 'Chat', FINANCE: 'Tài chính', SECURITY: 'Bảo mật' }[scope];
}
function actionLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ModeratorApiClientError || error instanceof Error ? error.message : fallback;
}
function downloadCsv(fileName: string, rows: Array<Array<string | number>>) {
  const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
