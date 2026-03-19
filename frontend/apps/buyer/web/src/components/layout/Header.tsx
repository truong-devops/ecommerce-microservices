interface HeaderProps {
  keywords: string[];
}

export function Header({ keywords }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-brand-gradient text-white shadow-sm">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-3 py-3 md:px-4 md:py-4">
        <div className="flex items-center justify-between text-xs text-white/90">
          <nav aria-label="Utility links" className="hidden gap-3 md:flex">
            <a className="rounded-sm hover:text-white focus-visible:outline-white" href="#">Seller Centre</a>
            <a className="rounded-sm hover:text-white focus-visible:outline-white" href="#">Download App</a>
            <a className="rounded-sm hover:text-white focus-visible:outline-white" href="#">Connect</a>
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <a className="rounded-sm hover:text-white focus-visible:outline-white" href="#">Notifications</a>
            <a className="rounded-sm hover:text-white focus-visible:outline-white" href="#">Support</a>
            <a className="rounded-sm hover:text-white focus-visible:outline-white" href="#">EN</a>
          </div>
        </div>

        <div className="flex items-center gap-3 md:gap-5">
          <a className="flex items-center gap-2 rounded-md focus-visible:outline-white" href="#" aria-label="Homepage">
            <span className="grid h-10 w-10 place-items-center rounded-md bg-white text-2xl font-bold text-brand-500">M</span>
            <span className="text-3xl font-semibold tracking-tight">Market</span>
          </a>

          <div className="flex-1">
            <form className="flex rounded-md border border-white/80 bg-white p-1" role="search" aria-label="Search products">
              <input
                type="search"
                placeholder="Search deals, gadgets, fashion, and more"
                className="h-10 flex-1 border-0 px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="submit"
                className="h-10 min-w-12 rounded bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600"
              >
                Search
              </button>
            </form>
            <div className="mt-1 hidden flex-wrap gap-3 text-xs text-white/90 md:flex" aria-label="Trending keywords">
              {keywords.map((keyword) => (
                <a key={keyword} href="#" className="rounded-sm hover:text-white focus-visible:outline-white">
                  {keyword}
                </a>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-white/60 text-white transition hover:bg-white/10 focus-visible:outline-white"
            aria-label="Open shopping cart"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
              <path d="M3 4h2l2.3 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 7H7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="10" cy="19" r="1.5" fill="currentColor" />
              <circle cx="17" cy="19" r="1.5" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
