'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, useCart, useLanguage } from '@/providers/AppProvider';

interface HeaderProps {
  keywords: string[];
}

export function Header({ keywords }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { locale, setLocale, text } = useLanguage();
  const { ready, user } = useAuth();
  const { cartCount } = useCart();
  const [searchValue, setSearchValue] = useState('');

  useEffect(() => {
    if (pathname === '/search') {
      const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
      setSearchValue(params.get('q')?.trim() ?? '');
      return;
    }

    setSearchValue('');
  }, [pathname]);

  const handleLogout = () => {
    router.push('/logout');
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const keyword = searchValue.trim();
    if (!keyword) {
      router.push('/search');
      return;
    }

    const query = new URLSearchParams();
    query.set('q', keyword);
    router.push(`/search?${query.toString()}`);
  };

  const buildSearchHref = (keyword: string) => {
    const query = new URLSearchParams();
    query.set('q', keyword);
    return `/search?${query.toString()}`;
  };

  const handleOpenChatDrawer = () => {
    if (typeof window === 'undefined') {
      return;
    }
    window.dispatchEvent(new CustomEvent('buyer-chat:open', { detail: {} }));
  };

  return (
    <header className="sticky top-0 z-50 bg-brand-gradient text-white shadow-sm">
      <div className="mx-auto flex w-full max-w-[1200px] min-w-0 flex-col gap-3 px-3 py-3 md:px-4 md:py-4">
        <div className="flex min-w-0 items-center justify-between text-xs text-white/90">
          <nav aria-label="Utility links" className="hidden gap-3 md:flex">
            <a className="rounded-sm hover:text-white focus-visible:outline-white" href="http://localhost:6789/login">
              {text.header.sellerCenter}
            </a>
            <a className="rounded-sm hover:text-white focus-visible:outline-white" href="#">
              {text.header.downloadApp}
            </a>
            <a className="rounded-sm hover:text-white focus-visible:outline-white" href="#">
              {text.header.connect}
            </a>
          </nav>

          <div className="no-scrollbar -mx-3 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto whitespace-nowrap px-3 md:mx-0 md:ml-auto md:flex-none md:gap-4 md:overflow-visible md:px-0">
            <div className="flex shrink-0 items-center gap-1 rounded-md border border-white/50 p-0.5">
              <span className="hidden pl-2 text-[11px] font-semibold uppercase tracking-wide md:block">{text.header.language}</span>
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

            <a className="shrink-0 rounded-sm hover:text-white focus-visible:outline-white" href="#">
              {text.header.notifications}
            </a>
            <a className="shrink-0 rounded-sm hover:text-white focus-visible:outline-white" href="#">
              {text.header.support}
            </a>
            <Link className="shrink-0 rounded-sm hover:text-white focus-visible:outline-white" href="/videos">
              {text.header.video}
            </Link>
            <Link className="shrink-0 rounded-sm hover:text-white focus-visible:outline-white" href="/live">
              Live
            </Link>

            {ready && user ? (
              <>
                <button type="button" onClick={handleOpenChatDrawer} className="shrink-0 rounded-sm hover:text-white focus-visible:outline-white">
                  Chat
                </button>
                <Link className="shrink-0 rounded-sm hover:text-white focus-visible:outline-white" href="/orders">
                  {text.header.orders}
                </Link>
                <Link className="shrink-0 rounded-sm hover:text-white focus-visible:outline-white" href="/account">
                  {text.header.account}
                </Link>
                <button type="button" onClick={handleLogout} className="shrink-0 rounded-sm hover:text-white focus-visible:outline-white">
                  {text.header.logout}
                </button>
              </>
            ) : (
              <>
                <Link className="shrink-0 rounded-sm hover:text-white focus-visible:outline-white" href="/login">
                  {text.header.login}
                </Link>
                <Link className="shrink-0 rounded-sm hover:text-white focus-visible:outline-white" href="/register">
                  {text.header.register}
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 md:flex md:gap-5">
          <Link className="flex shrink-0 items-center gap-2 rounded-md focus-visible:outline-white" href="/" aria-label="Homepage">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-white text-lg font-bold text-brand-500 sm:h-9 sm:w-9 sm:text-xl md:h-10 md:w-10 md:text-2xl">m</span>
            <span className="text-xl font-semibold tracking-tight sm:text-2xl md:text-3xl">eMall</span>
          </Link>

          <div className="order-3 col-span-3 min-w-0 md:order-none md:col-span-1 md:flex-1">
            <form
              className="flex min-w-0 rounded-md border border-white/80 bg-white p-1"
              role="search"
              aria-label="Search products"
              onSubmit={handleSearchSubmit}
            >
              <input
                type="search"
                placeholder={text.header.searchPlaceholder}
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                className="h-10 min-w-0 flex-1 border-0 px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="submit"
                className="h-10 shrink-0 rounded bg-brand-500 px-3 text-sm font-semibold leading-tight text-white transition hover:bg-brand-600 md:px-4"
              >
                {text.header.searchButton}
              </button>
            </form>
            <div className="mt-1 hidden flex-wrap gap-3 text-xs text-white/90 md:flex" aria-label="Trending keywords">
              {keywords.map((keyword) => (
                <Link key={keyword} href={buildSearchHref(keyword)} className="rounded-sm hover:text-white focus-visible:outline-white">
                  {keyword}
                </Link>
              ))}
            </div>
          </div>

          <Link
            href="/cart"
            className="relative ml-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/60 text-white transition hover:bg-white/10 focus-visible:outline-white md:h-11 md:w-11"
            aria-label={text.header.cart}
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
              <path
                d="M3 4h2l2.3 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 7H7"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
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
