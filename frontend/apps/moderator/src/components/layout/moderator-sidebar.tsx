'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  PackageIcon,
  VideoIcon,
  MessageIcon,
  WalletIcon,
  FileTextIcon,
  ShieldCheckIcon,
  HistoryIcon,
  UsersIcon,
  ActivityIcon,
  SparklesIcon
} from '@/components/ui/icons';

interface ModeratorSidebarProps {
  role?: string;
  productCount?: number;
  pendingVideoCount?: number;
  chatViolationCount?: number;
  walletAttentionCount?: number;
}

export function ModeratorSidebar({
  role,
  productCount,
  pendingVideoCount,
  chatViolationCount,
  walletAttentionCount
}: ModeratorSidebarProps) {
  const pathname = usePathname();
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';

  const isCurrent = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  return (
    <aside className="w-full space-y-4">
      {/* Navigation Card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-3 shadow-card">
        {/* Section 1: Core Moderation Queues */}
        <div className="px-2 pt-1 pb-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Hàng đợi kiểm duyệt
          </p>
        </div>

        <nav className="space-y-1">
          <NavItem
            href="/"
            active={isCurrent('/')}
            icon={<PackageIcon size={18} />}
            label="Product Queue"
            badge={productCount !== undefined && productCount > 0 ? productCount : undefined}
            badgeTone="brand"
          />

          <NavItem
            href="/videos/review"
            active={isCurrent('/videos/review')}
            icon={<VideoIcon size={18} />}
            label="Video Review"
            badge={pendingVideoCount !== undefined && pendingVideoCount > 0 ? pendingVideoCount : undefined}
            badgeTone="amber"
          />

          <NavItem
            href="/chat/violations"
            active={isCurrent('/chat/violations')}
            icon={<MessageIcon size={18} />}
            label="Chat Violations"
            badge={chatViolationCount !== undefined && chatViolationCount > 0 ? chatViolationCount : undefined}
            badgeTone="rose"
          />
        </nav>

        {/* Section 2: Operations & Finance */}
        {isAdmin && (
          <div className="mt-4 pt-3 border-t border-slate-100">
            <div className="px-2 pb-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Tài chính & Ví
              </p>
            </div>
            <nav className="space-y-1">
              <NavItem
                href="/wallets"
                active={isCurrent('/wallets')}
                icon={<WalletIcon size={18} />}
                label="Wallet Operations"
                badge={walletAttentionCount !== undefined && walletAttentionCount > 0 ? walletAttentionCount : undefined}
                badgeTone="rose"
              />
            </nav>
          </div>
        )}

        {/* Section 3: Governance & Logs */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="px-2 pb-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Chính sách & Nhật ký
            </p>
          </div>
          <nav className="space-y-1">
            <NavItem
              href="#reports"
              active={false}
              icon={<FileTextIcon size={18} />}
              label="Reports & Analytics"
              disabled
            />
            <NavItem
              href="#policy"
              active={false}
              icon={<ShieldCheckIcon size={18} />}
              label="Policy & Rules"
              disabled
            />
            <NavItem
              href="#audit"
              active={false}
              icon={<HistoryIcon size={18} />}
              label="Audit Trail"
              disabled
            />
            <NavItem
              href="#moderators"
              active={false}
              icon={<UsersIcon size={18} />}
              label="Moderator Team"
              disabled
            />
            <NavItem
              href="#logs"
              active={false}
              icon={<ActivityIcon size={18} />}
              label="System Logs"
              disabled
            />
          </nav>
        </div>
      </div>

      {/* Trust & Ops Badge Card */}
      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-900 to-slate-950 p-4 text-white shadow-card">
        <div className="flex items-center gap-2">
          <div className="relative flex h-2.5 w-2.5 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <span className="text-xs font-semibold tracking-wide text-slate-300">Live Console</span>
        </div>
        <p className="mt-2 text-xs font-medium text-slate-400">
          Hệ thống kiểm duyệt tự động đang hoạt động. Quy chế sàn được giám sát liên tục.
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2.5 text-[11px] text-slate-400">
          <span>Phiên bản v2.6.4</span>
          <span className="flex items-center gap-1 text-emerald-400">
            <SparklesIcon size={13} />
            Đã đồng bộ
          </span>
        </div>
      </div>
    </aside>
  );
}

function NavItem({
  href,
  active,
  icon,
  label,
  badge,
  badgeTone = 'brand',
  disabled = false
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: number | string;
  badgeTone?: 'brand' | 'amber' | 'rose' | 'emerald';
  disabled?: boolean;
}) {
  const badgeClasses = {
    brand: 'bg-brand-50 text-brand-700 border-brand-200/60 font-semibold',
    amber: 'bg-amber-50 text-amber-700 border-amber-200/60 font-semibold',
    rose: 'bg-rose-50 text-rose-700 border-rose-200/60 font-semibold',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200/60 font-semibold'
  }[badgeTone];

  if (disabled) {
    return (
      <div className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-400 hover:text-slate-500 cursor-not-allowed select-none">
        <div className="flex items-center gap-3">
          <span className="text-slate-300">{icon}</span>
          <span>{label}</span>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-300">Soon</span>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
        active
          ? 'bg-brand-50/90 text-brand-900 font-semibold shadow-xs'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`shrink-0 transition-colors ${
            active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'
          }`}
        >
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>

      {badge !== undefined ? (
        <span
          className={`ml-2 shrink-0 rounded-full border px-2 py-0.5 text-xs ${badgeClasses}`}
        >
          {badge}
        </span>
      ) : active ? (
        <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
      ) : null}
    </Link>
  );
}
