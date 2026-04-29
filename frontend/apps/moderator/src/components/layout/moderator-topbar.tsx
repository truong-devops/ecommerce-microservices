interface ModeratorTopbarProps {
  email: string;
  role: string;
  onLogout: () => Promise<void>;
}

export function ModeratorTopbar({ email, role, onLogout }: ModeratorTopbarProps) {
  const displayName = email.split('@')[0] || email;

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex h-full items-center justify-between px-3 lg:px-4">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-brand-600 text-xs font-semibold text-white">M</div>
          <div>
            <p className="text-sm font-semibold leading-none text-slate-900 md:text-base">eMall Trust & Safety</p>
            <p className="hidden text-[11px] text-slate-500 md:block">Moderation Operations Console</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-slate-600">
          <div className="hidden rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 lg:block">{role}</div>

          <div className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-slate-50">
            <div className="h-7 w-7 rounded-full bg-slate-400" />
            <span className="hidden max-w-[160px] truncate text-sm text-slate-700 md:block">{displayName}</span>
          </div>

          <button
            type="button"
            onClick={() => {
              void onLogout();
            }}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </header>
  );
}
