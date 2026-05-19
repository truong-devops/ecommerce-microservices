interface ModeratorTopbarProps {
  email: string;
  role: string;
  onLogout: () => Promise<void>;
}

export function ModeratorTopbar({ email, role, onLogout }: ModeratorTopbarProps) {
  const displayName = email.split('@')[0] || email;
  const initial = (displayName.trim().charAt(0) || 'M').toUpperCase();

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex h-full items-center justify-between px-3 lg:px-4">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-brand-600 text-xs font-semibold text-white">m</div>
          <div>
            <p className="text-sm font-semibold leading-none text-slate-900 md:text-base">eMall Trust & Safety</p>
            <p className="hidden text-[11px] text-slate-500 md:block">Moderation Operations Console</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-slate-600">
          <div className="hidden rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-indigo-700 lg:block">
            Trust Team
          </div>

          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 shadow-sm">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-slate-800 text-xs font-bold text-white shadow-sm">
              {initial}
            </span>
            <span className="hidden min-w-0 md:block">
              <span className="block max-w-[150px] truncate text-sm font-semibold leading-4 text-slate-800">{displayName}</span>
              <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">{role}</span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              void onLogout();
            }}
            className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </header>
  );
}
