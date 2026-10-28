'use client';

import Link from 'next/link';
import { LogOutIcon } from '@/components/ui/icons';

interface ModeratorTopbarProps {
  email: string;
  role: string;
  onLogout: () => Promise<void>;
}

export function ModeratorTopbar({ email, role, onLogout }: ModeratorTopbarProps) {
  const displayName = email.split('@')[0] || email;
  const initial = (displayName.trim().charAt(0) || 'M').toUpperCase();

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-[#e8e8e8] bg-white">
      <div className="mx-auto flex h-full w-full max-w-[1760px] items-center justify-between px-4 sm:px-6">
        {/* Left: Brand Identity */}
        <div className="flex items-center gap-3">
          <Link href="/" className="group flex items-center gap-2.5 transition">
            <div
              aria-hidden="true"
              className="relative h-8 w-8 rounded-lg bg-white bg-cover bg-center shadow-xs ring-1 ring-orange-100 transition-transform group-hover:scale-105"
              style={{ backgroundImage: "url('/icon.svg')" }}
            />
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-[#ee4d2d]">
                eMall
              </span>
              <span className="text-sm font-semibold text-[#222222]">
                Kiểm duyệt &amp; Vận hành
              </span>
            </div>
          </Link>
        </div>

        {/* Right: User & Logout */}
        <div className="flex items-center gap-3">
          {/* Role badge */}
          <span className="hidden sm:inline-block rounded border border-[#e8e8e8] bg-[#f5f5f5] px-2.5 py-1 text-xs font-semibold text-[#555555]">
            {role}
          </span>

          {/* User profile capsule */}
          <div className="flex items-center gap-2 rounded-full border border-[#e8e8e8] bg-white py-1 pl-1 pr-3">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-[#ee4d2d] text-xs font-bold text-white shadow-xs">
              {initial}
            </div>
            <div className="hidden min-w-0 md:block">
              <span className="block max-w-[140px] truncate text-xs font-semibold leading-tight text-[#222222]">
                {displayName}
              </span>
            </div>
          </div>

          {/* Logout Button */}
          <button
            type="button"
            onClick={() => {
              void onLogout();
            }}
            className="inline-flex items-center gap-1.5 rounded border border-[#e8e8e8] bg-white px-3 py-1.5 text-xs font-semibold text-[#555555] transition-all hover:border-[#ee4d2d] hover:bg-[#fef6f5] hover:text-[#ee4d2d]"
            title="Đăng xuất khỏi hệ thống"
          >
            <LogOutIcon size={14} />
            <span className="hidden sm:inline">Đăng xuất</span>
          </button>
        </div>
      </div>
    </header>
  );
}
