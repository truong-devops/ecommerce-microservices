'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { useAuth, useLanguage } from '@/providers/AppProvider';

export default function LoginPage() {
  const router = useRouter();
  const { text, locale } = useLanguage();
  const { ready, user, login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (ready && user) {
      router.replace(readReturnUrlFromWindow() ?? '/account');
    }
  }, [ready, router, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError(text.auth.requiredFields);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login({ email, password });
      if (!result.ok) {
        setError(result.message ?? text.auth.invalidCredentials);
        return;
      }

      router.push(readReturnUrlFromWindow() ?? '/account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copy =
    locale === 'vi'
      ? {
          help: 'Bạn cần giúp đỡ?',
          qrLogin: 'Đăng nhập với mã QR',
          forgotPassword: 'Quên mật khẩu',
          or: 'HOẶC',
          legalPrefix: 'Bằng việc đăng nhập, bạn đồng ý với',
          terms: 'Điều khoản dịch vụ',
          privacy: 'Chính sách bảo mật',
          legalSuffix: 'của eMall',
          socialFacebook: 'Facebook',
          socialGoogle: 'Google',
          splitLogin: 'Đăng nhập với tài khoản Chính/ Phụ',
          introTitle: 'Mua sắm thông minh mỗi ngày',
          introDescription: 'Săn deal, theo dõi đơn hàng và tận hưởng trải nghiệm mua sắm nhanh chóng cùng eMall.',
          copyright: '(c) 2026 eMall. Tất cả các quyền được bảo lưu.'
        }
      : {
          help: 'Need help?',
          qrLogin: 'Login with QR',
          forgotPassword: 'Forgot password',
          or: 'OR',
          legalPrefix: 'By logging in, you agree to eMall',
          terms: 'Terms of Service',
          privacy: 'Privacy Policy',
          legalSuffix: '',
          socialFacebook: 'Facebook',
          socialGoogle: 'Google',
          splitLogin: 'Login with Main/Sub account',
          introTitle: 'Shop smarter every day',
          introDescription: 'Discover new deals, track your orders, and enjoy a faster shopping experience with eMall.',
          copyright: '(c) 2026 eMall. All rights reserved.'
        };

  return (
    <div className="min-h-screen bg-app-bg text-slate-900">
      <Header keywords={[]} />
      <main className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-8 px-3 py-6 md:px-4 md:py-10 lg:grid-cols-[1fr_430px] lg:items-center">
        <section className="hidden px-6 lg:block">
          <h2 className="text-[36px] font-semibold leading-tight text-brand-600">{copy.introTitle}</h2>
          <p className="mt-3 max-w-[560px] text-[18px] leading-snug text-slate-600">{copy.introDescription}</p>

          <div className="mt-8">
            <svg viewBox="0 0 480 300" className="h-[280px] w-[460px]" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x="82" y="170" width="140" height="58" rx="6" fill="#4bb3b8" />
              <rect x="117" y="132" width="120" height="96" rx="4" fill="#2f8ea4" />
              <rect x="248" y="95" width="170" height="132" rx="6" fill="#fef0ca" />
              <rect x="255" y="145" width="60" height="62" fill="#fff" stroke="#9ca3af" strokeWidth="3" />
              <rect x="340" y="145" width="62" height="62" fill="#fff" stroke="#9ca3af" strokeWidth="3" />
              <rect x="315" y="156" width="26" height="68" fill="#455a64" />
              <rect x="235" y="85" width="195" height="15" fill="#f27d32" />
              <path d="M240 100h190l11 45H230z" fill="#f7d966" />
              <path d="M248 100h26l-8 45h-30zM302 100h26l-1 45h-26zM356 100h26l8 45h-30zM410 100h20l11 45h-29z" fill="#ef4d2d" />
              <circle cx="116" cy="232" r="15" fill="#3f3d56" />
              <circle cx="197" cy="232" r="15" fill="#3f3d56" />
              <circle cx="116" cy="232" r="7" fill="#fff" />
              <circle cx="197" cy="232" r="7" fill="#fff" />
              <rect x="300" y="216" width="42" height="18" fill="#374151" />
              <ellipse cx="100" cy="130" rx="20" ry="14" fill="#c9e7f3" />
              <ellipse cx="95" cy="124" rx="14" ry="12" fill="#b3dced" />
              <ellipse cx="110" cy="126" rx="12" ry="10" fill="#b3dced" />
            </svg>
          </div>
        </section>

        <section>
          <div className="rounded-sm bg-white p-6 shadow-card md:p-8" aria-labelledby="login-title">
            <div className="flex items-start justify-between gap-3">
              <h1 id="login-title" className="text-[22px] font-semibold text-slate-800">
                {text.auth.loginTitle}
              </h1>
              <div className="relative border-2 border-[#f0b100] bg-[#fffbe6] px-3 py-1 text-[13px] font-semibold leading-tight text-[#f0a300]">
                {copy.qrLogin}
                <span className="absolute -right-[11px] top-1/2 block h-4 w-4 -translate-y-1/2 rotate-45 border-r-2 border-t-2 border-[#f0b100] bg-[#fffbe6]" />
              </div>
            </div>

            <p className="mt-2 text-sm text-slate-600">{text.auth.loginSubtitle}</p>

            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={text.auth.email}
                className="h-11 w-full rounded-sm border border-slate-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
                required
              />

              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={text.auth.password}
                className="h-11 w-full rounded-sm border border-slate-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
                required
              />

              {error ? <p className="rounded-sm bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="h-11 w-full rounded-sm bg-[#ee826f] px-4 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-80"
              >
                {isSubmitting ? `${text.auth.submitLogin}...` : text.auth.submitLogin.toUpperCase()}
              </button>

              <a href="#" className="inline-block text-sm text-[#0f5db6] hover:underline">
                {copy.forgotPassword}
              </a>

              <div className="flex items-center gap-4 text-slate-400">
                <span className="h-px flex-1 bg-slate-300" />
                <span className="text-sm">{copy.or}</span>
                <span className="h-px flex-1 bg-slate-300" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button type="button" className="h-11 rounded-sm border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {copy.socialFacebook}
                </button>
                <button type="button" className="h-11 rounded-sm border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {copy.socialGoogle}
                </button>
              </div>

              <p className="text-center text-xs leading-relaxed text-slate-500">
                {copy.legalPrefix}{' '}
                <a href="#" className="text-brand-500 hover:underline">
                  {copy.terms}
                </a>{' '}
                &{' '}
                <a href="#" className="text-brand-500 hover:underline">
                  {copy.privacy}
                </a>{' '}
                {copy.legalSuffix}
              </p>
            </form>

            <p className="mt-4 text-center text-sm text-slate-500">
              {text.auth.noAccount}{' '}
              <Link href="/register" className="font-semibold text-brand-600 hover:text-brand-700">
                {text.auth.goRegister}
              </Link>
            </p>
          </div>

          <button
            type="button"
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-sm bg-white text-sm text-slate-700 shadow-card hover:bg-slate-50"
          >
            {copy.splitLogin}
            <span aria-hidden="true">›</span>
          </button>
        </section>
      </main>

      <footer className="pb-8 text-center text-xs text-slate-500">{copy.copyright}</footer>
    </div>
  );
}

function resolveReturnUrl(raw: string | null): string | null {
  if (!raw) {
    return null;
  }

  const value = raw.trim();
  if (!value.startsWith('/') || value.startsWith('//')) {
    return null;
  }

  return value;
}

function readReturnUrlFromWindow(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  return resolveReturnUrl(params.get('returnUrl'));
}
