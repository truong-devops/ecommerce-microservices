interface SellerTopbarProps {
  email: string;
  role: string;
  onLogout: () => Promise<void>;
}

export function SellerTopbar({ email, role, onLogout }: SellerTopbarProps) {
  const displayName = email.split('@')[0] || email;
  const initial = (displayName.trim().charAt(0) || 'S').toUpperCase();

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-[#e8e8e8] bg-white">
      <div className="flex h-full items-center justify-between px-3 lg:px-4">
        <div className="flex items-center gap-2">
          <div
            aria-hidden="true"
            className="h-8 w-8 rounded-lg bg-white bg-cover bg-center shadow-xs ring-1 ring-orange-100"
            style={{ backgroundImage: "url('/icon.svg')" }}
          />
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-[#ee4d2d]">eMall</span>
            <span className="text-sm font-semibold text-[#222222]">Kênh Người Bán</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[#555555]">
          <div className="hidden rounded border border-[#e8e8e8] bg-[#f5f5f5] px-2.5 py-1 text-xs font-semibold text-[#555555] lg:block">
            Seller Center
          </div>

          <div className="flex items-center gap-2 rounded-full border border-[#e8e8e8] bg-white py-1 pl-1 pr-3 shadow-xs">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#ee4d2d] text-xs font-bold text-white shadow-xs">
              {initial}
            </span>
            <span className="hidden min-w-0 md:block">
              <span className="block max-w-[150px] truncate text-xs font-semibold leading-4 text-[#222222]">{displayName}</span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              void onLogout();
            }}
            className="rounded border border-[#e8e8e8] px-3 py-1.5 text-xs font-semibold text-[#555555] transition hover:border-[#ee4d2d] hover:bg-[#fef6f5] hover:text-[#ee4d2d]"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </header>
  );
}
