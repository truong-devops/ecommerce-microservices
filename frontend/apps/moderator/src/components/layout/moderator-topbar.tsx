'use client';

import Link from 'next/link';
import { LogOutIcon, ShieldCheckIcon } from '@/components/ui/icons';

interface ModeratorTopbarProps {
  email: string;
  role: string;
  onLogout: () => Promise<void>;
}

export function ModeratorTopbar({ email, role, onLogout }: ModeratorTopbarProps) {
  const displayName = email.split('@')[0] || email;
  const initial = (displayName.trim().charAt(0) || 'M').toUpperCase();
  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-full w-full max-w-[1760px] items-center justify-between px-4 sm:px-6">
        {/* Left: Brand Identity */}
        <div className="flex items-center gap-3">
          <Link href="/" className="group flex items-center gap-3 transition">
            <div
              aria-hidden="true"
              className="relative h-9 w-9 rounded-xl bg-white bg-cover bg-center shadow-subtle ring-1 ring-slate-200/80 transition-transform group-hover:scale-105"
              style={{ backgroundImage: "url('/icon.svg')" }}
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold tracking-tight text-slate-950">
                  eMall Trust &amp; Safety
                </span>
                <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 sm:inline-block">
                  Console
                </span>
              </div>
              <p className="hidden text-xs text-slate-500 sm:block">
                Hệ thống kiểm duyệt &amp; bảo vệ người dùng
              </p>
            </div>
          </Link>
        </div>

        {/* Right: Operational Status, User & Logout */}
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          {/* Live indicator badge */}
          <div className="hidden items-center gap-1.5 rounded-full border border-emerald-200/70 bg-emerald-50/70 px-3 py-1 text-xs font-semibold text-emerald-800 md:flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span>Hệ thống bình thường</span>
          </div>

          {/* Role badge */}
          <div
            className={`hidden items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider lg:flex ${
              isAdmin
                ? 'border-indigo-200 bg-indigo-50/80 text-indigo-700'
                : 'border-brand-200 bg-brand-50/80 text-brand-700'
            }`}
          >
            <ShieldCheckIcon size={14} />
            <span>{role}</span>
          </div>

          {/* User profile capsule */}
          <div className="flex items-center gap-2 rounded-full border border-slate-200/90 bg-white py-1 pl-1 pr-3.5 shadow-subtle">
            <div className="relative grid h-8 w-8 place-items-center rounded-full bg-gradient-to-tr from-brand-600 via-orange-500 to-amber-500 text-xs font-bold text-white shadow-sm">
              {initial}
              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-white bg-emerald-500" />
            </div>
            <div className="hidden min-w-0 md:block">
              <span className="block max-w-[140px] truncate text-xs font-semibold leading-tight text-slate-900">
                {displayName}
              </span>
              <span className="block max-w-[140px] truncate text-[11px] text-slate-500">
                {email}
              </span>
            </div>
          </div>

          {/* Logout Button */}
          <button
            type="button"
            onClick={() => {
              void onLogout();
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-subtle transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-500/20"
            title="Đăng xuất khỏi hệ thống"
          >
            <LogOutIcon size={14} className="text-slate-500" />
            <span className="hidden sm:inline">Đăng xuất</span>
          </button>
        </div>
      </div>
    </header>
  );
}
