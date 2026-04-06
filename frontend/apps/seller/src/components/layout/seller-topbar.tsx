interface SellerTopbarProps {
  email: string;
  role: string;
  onLogout: () => Promise<void>;
}

export function SellerTopbar({ email, role, onLogout }: SellerTopbarProps) {
  const displayName = email.split('@')[0] || email;

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-slate-200 bg-white">
      <div className="flex h-full items-center justify-between px-3 lg:px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-[#ee4d2d] text-xs font-semibold text-white">m</div>
          <p className="text-base font-semibold leading-none text-[#ee4d2d] md:text-lg">eMall</p>
        </div>

        <div className="flex items-center gap-2 text-slate-600">
          <button type="button" className="hidden rounded-md p-1.5 hover:bg-slate-100 md:block" aria-label="apps">
            <span className="block h-4 w-4 rounded border border-slate-400" />
          </button>
          <button type="button" className="hidden rounded-md p-1.5 hover:bg-slate-100 md:block" aria-label="help">
            <span className="block h-4 w-4 rounded-full border border-slate-400" />
          </button>

          <div className="mx-1 h-5 w-px bg-slate-200" />

          <div className="hidden rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-[#ee4d2d] lg:block">{role}</div>

          <div className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-slate-50">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#ffb39c] to-[#ee4d2d]" />
            <span className="hidden max-w-[160px] truncate text-sm text-slate-700 md:block">{displayName}</span>
          </div>

          <button
            type="button"
            onClick={() => {
              void onLogout();
            }}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-[#ee4d2d] hover:text-[#ee4d2d]"
          >
            Dang xuat
          </button>
        </div>
      </div>
    </header>
  );
}
