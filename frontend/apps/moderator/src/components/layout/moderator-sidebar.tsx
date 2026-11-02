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
  ActivityIcon
} from '@/components/ui/icons';

interface ModeratorSidebarProps {
  role?: string;
  productCount?: number;
  pendingVideoCount?: number;
  chatViolationCount?: number;
  walletAttentionCount?: number;
}

export function ModeratorSidebar({ role, productCount, pendingVideoCount, chatViolationCount, walletAttentionCount }: ModeratorSidebarProps) {
  const pathname = usePathname();
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';

  const isCurrent = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  return (
    <aside className="w-full space-y-3">
      {/* Navigation Card */}
      <div className="overflow-hidden rounded-lg border border-[#e8e8e8] bg-white p-2.5 shadow-sm">
        {/* Section 1: Core Moderation Queues */}
        <div className="px-2 pt-1 pb-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#757575]">Hàng đợi kiểm duyệt</p>
        </div>

        <nav className="space-y-0.5">
          <NavItem
            href="/"
            active={isCurrent('/')}
            icon={<PackageIcon size={17} />}
            label="Kiểm duyệt sản phẩm"
            badge={productCount !== undefined && productCount > 0 ? productCount : undefined}
          />

          <NavItem
            href="/videos/review"
            active={isCurrent('/videos/review')}
            icon={<VideoIcon size={17} />}
            label="Duyệt Video"
            badge={pendingVideoCount !== undefined && pendingVideoCount > 0 ? pendingVideoCount : undefined}
          />

          <NavItem
            href="/chat/violations"
            active={isCurrent('/chat/violations')}
            icon={<MessageIcon size={17} />}
            label="Vi phạm Chat"
            badge={chatViolationCount !== undefined && chatViolationCount > 0 ? chatViolationCount : undefined}
          />
        </nav>

        {/* Section 2: Operations & Finance */}
        {isAdmin && (
          <div className="mt-3 pt-2.5 border-t border-[#f0f0f0]">
            <div className="px-2 pb-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#757575]">Tài chính &amp; Ví</p>
            </div>
            <nav className="space-y-0.5">
              <NavItem
                href="/wallets"
                active={isCurrent('/wallets')}
                icon={<WalletIcon size={17} />}
                label="Quản lý ví eMall"
                badge={walletAttentionCount !== undefined && walletAttentionCount > 0 ? walletAttentionCount : undefined}
              />
            </nav>
          </div>
        )}

        {/* Section 3: Governance & Logs */}
        <div className="mt-3 pt-2.5 border-t border-[#f0f0f0]">
          <div className="px-2 pb-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#757575]">Chính sách &amp; Nhật ký</p>
          </div>
          <nav className="space-y-0.5">
            <NavItem
              href="/governance/reports"
              active={isCurrent('/governance/reports')}
              icon={<FileTextIcon size={17} />}
              label="Báo cáo & Thống kê"
            />
            <NavItem
              href="/governance/policies"
              active={isCurrent('/governance/policies')}
              icon={<ShieldCheckIcon size={17} />}
              label="Quy chế & Chính sách"
            />
            <NavItem href="/governance/audit" active={isCurrent('/governance/audit')} icon={<HistoryIcon size={17} />} label="Nhật ký thao tác" />
            <NavItem href="/governance/team" active={isCurrent('/governance/team')} icon={<UsersIcon size={17} />} label="Đội ngũ kiểm duyệt" />
            {isAdmin ? (
              <NavItem
                href="/governance/system-logs"
                active={isCurrent('/governance/system-logs')}
                icon={<ActivityIcon size={17} />}
                label="Nhật ký hệ thống"
              />
            ) : null}
          </nav>
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
  disabled = false
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: number | string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <div className="flex items-center justify-between rounded px-3 py-2 text-xs text-[#999999] cursor-not-allowed select-none">
        <div className="flex items-center gap-2.5">
          <span className="text-[#cccccc]">{icon}</span>
          <span>{label}</span>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-[#cccccc]">Sắp mở</span>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={`group flex items-center justify-between px-3 py-2 text-xs transition duration-150 ${
        active
          ? 'bg-[#fef6f5] text-[#ee4d2d] font-semibold border-l-4 border-[#ee4d2d] rounded-r'
          : 'text-[#333333] hover:bg-[#fafafa] hover:text-[#ee4d2d] rounded'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`shrink-0 transition-colors ${active ? 'text-[#ee4d2d]' : 'text-[#757575] group-hover:text-[#ee4d2d]'}`}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>

      {badge !== undefined ? (
        <span
          className={`ml-2 shrink-0 rounded-full px-2 py-0.2 text-[11px] font-bold ${
            active ? 'bg-[#ee4d2d] text-white' : 'bg-[#f5f5f5] text-[#757575] border border-[#e8e8e8]'
          }`}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
