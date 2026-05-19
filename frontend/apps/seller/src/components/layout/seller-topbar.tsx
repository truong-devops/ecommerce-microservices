interface SellerTopbarProps {
  email: string;
  role: string;
  onLogout: () => Promise<void>;
}

export function SellerTopbar({ email, role, onLogout }: SellerTopbarProps) {
  const displayName = email.split('@')[0] || email;
  const initial = (displayName.trim().charAt(0) || 'S').toUpperCase();

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-slate-200 bg-white">
      <div className="flex h-full items-center justify-between px-3 lg:px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-[#ee4d2d] text-xs font-semibold text-white">m</div>
          <p className="text-base font-semibold leading-none text-[#ee4d2d] md:text-lg">eMall</p>
        </div>

        <div className="flex items-center gap-2 text-slate-600">
          {/* <button type="button" className="hidden rounded-md p-1.5 hover:bg-slate-100 md:block" aria-label="apps">
            <span className="block h-4 w-4 rounded border border-slate-400" />
          </button>
          <button type="button" className="hidden rounded-md p-1.5 hover:bg-slate-100 md:block" aria-label="help">
            <span className="block h-4 w-4 rounded-full border border-slate-400" />
          </button> */}

          {/* <div className="mx-1 h-5 w-px bg-slate-200" /> */}

          <div className="hidden rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#ee4d2d] lg:block">
            Seller Center
          </div>

          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 shadow-sm">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#ff8a65] to-[#ee4d2d] text-xs font-bold text-white shadow-sm">
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
            className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-[#ee4d2d] hover:bg-[#fff7f3] hover:text-[#ee4d2d]"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </header>
  );
}
