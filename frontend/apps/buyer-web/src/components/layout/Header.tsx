'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, useCart, useLanguage } from '@/providers/AppProvider';

interface HeaderProps {
  keywords: string[];
}

export function Header({ keywords }: HeaderProps) {
  const router = useRouter();
  const { locale, setLocale, text } = useLanguage();
  const { ready, user } = useAuth();
  const { cartCount } = useCart();

  const handleLogout = () => {
    router.push('/logout');
  };

  return (
    <header className="sticky top-0 z-50 bg-brand-gradient text-white shadow-sm">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-3 py-3 md:px-4 md:py-4">
        <div className="flex items-center justify-between text-xs text-white/90">
          <nav aria-label="Utility links" className="hidden gap-3 md:flex">
            <a className="rounded-sm hover:text-white focus-visible:outline-white" href="#">
              {text.header.sellerCenter}
            </a>
            <a className="rounded-sm hover:text-white focus-visible:outline-white" href="#">
              {text.header.downloadApp}
            </a>
            <a className="rounded-sm hover:text-white focus-visible:outline-white" href="#">
              {text.header.connect}
            </a>
          </nav>

          <div className="ml-auto flex items-center gap-2 md:gap-4">
            <div className="flex items-center gap-1 rounded-md border border-white/50 p-0.5">
              <span className="hidden pl-2 text-[11px] font-semibold uppercase tracking-wide md:block">
                {text.header.language}
              </span>
              <button
                type="button"
                onClick={() => setLocale('vi')}
                className={`rounded px-2 py-1 text-[11px] font-semibold transition ${
                  locale === 'vi' ? 'bg-white text-brand-600' : 'text-white hover:bg-white/10'
                }`}
                aria-pressed={locale === 'vi'}
              >
                VI
              </button>
              <button
                type="button"
                onClick={() => setLocale('en')}
                className={`rounded px-2 py-1 text-[11px] font-semibold transition ${
                  locale === 'en' ? 'bg-white text-brand-600' : 'text-white hover:bg-white/10'
                }`}
                aria-pressed={locale === 'en'}
              >
                EN
              </button>
            </div>

            <a className="rounded-sm hover:text-white focus-visible:outline-white" href="#">
              {text.header.notifications}
            </a>
            <a className="rounded-sm hover:text-white focus-visible:outline-white" href="#">
              {text.header.support}
            </a>

            {ready && user ? (
              <>
                <Link className="rounded-sm hover:text-white focus-visible:outline-white" href="/orders">
                  {text.header.orders}
                </Link>
                <Link className="rounded-sm hover:text-white focus-visible:outline-white" href="/account">
                  {text.header.account}
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-sm hover:text-white focus-visible:outline-white"
                >
                  {text.header.logout}
                </button>
              </>
            ) : (
              <>
                <Link className="rounded-sm hover:text-white focus-visible:outline-white" href="/login">
                  {text.header.login}
                </Link>
                <Link className="rounded-sm hover:text-white focus-visible:outline-white" href="/register">
                  {text.header.register}
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 md:gap-5">
          <Link className="flex items-center gap-2 rounded-md focus-visible:outline-white" href="/" aria-label="Homepage">
            <span className="grid h-10 w-10 place-items-center rounded-md bg-white text-2xl font-bold text-brand-500">m</span>
            <span className="text-3xl font-semibold tracking-tight">eMall</span>
          </Link>

          <div className="flex-1">
            <form className="flex rounded-md border border-white/80 bg-white p-1" role="search" aria-label="Search products">
              <input
                type="search"
                placeholder={text.header.searchPlaceholder}
                className="h-10 flex-1 border-0 px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="submit"
                className="h-10 min-w-12 rounded bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600"
              >
                {text.header.searchButton}
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

          <Link
            href="/cart"
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-md border border-white/60 text-white transition hover:bg-white/10 focus-visible:outline-white"
            aria-label={text.header.cart}
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
              <path d="M3 4h2l2.3 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 7H7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="10" cy="19" r="1.5" fill="currentColor" />
              <circle cx="17" cy="19" r="1.5" fill="currentColor" />
            </svg>

            {cartCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-brand-600">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            ) : null}
          </Link>
        </div>
      </div>
    </header>
  );
}
