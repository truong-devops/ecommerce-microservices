'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/providers/AppProvider';

export default function SellerLoginPage() {
  const router = useRouter();
  const { ready, user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOauthSubmitting, setIsOauthSubmitting] = useState(false);
  const [oauthError, setOauthError] = useState('');

  useEffect(() => {
    if (ready && user) router.replace('/');
  }, [ready, router, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const message = new URLSearchParams(window.location.search).get('oauthError');
    if (message) setOauthError(message);
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setOauthError('');
    if (!email.trim() || !password.trim()) {
      setError('Vui lòng nhập đầy đủ email và mật khẩu.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login({ email: email.trim(), password });
      if (!result.ok) {
        setError(result.message ?? 'Không thể đăng nhập. Vui lòng kiểm tra lại thông tin.');
        return;
      }
      router.push('/');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = () => {
    if (typeof window === 'undefined') return;
    setIsOauthSubmitting(true);
    window.location.href = '/api/seller/auth/google/start';
  };

  return (
    <div className="min-h-screen bg-[#f3f5f7] text-slate-950">
      <header className="border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[72px] w-full max-w-[1240px] items-center justify-between px-5 sm:px-8">
          <Link href="/" className="inline-flex items-center gap-3" aria-label="eMall Seller Center">
            <BrandMark />
            <span className="h-6 w-px bg-slate-200" />
            <span className="hidden text-sm font-semibold text-slate-600 sm:inline">Seller Center</span>
          </Link>
          <a href="mailto:support@truongam.tech" className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">
            <span className="hidden sm:inline">Trung tâm hỗ trợ</span> <span aria-hidden="true">→</span>
          </a>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-120px)] w-full max-w-[1240px] items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-16 lg:py-14">
        <section
          className="relative hidden min-h-[620px] overflow-hidden rounded-[32px] bg-cover bg-center p-12 shadow-[0_24px_70px_rgba(15,23,42,0.14)] lg:flex lg:flex-col lg:justify-between"
          style={{ backgroundImage: "url('/images/auth/seller-login-hero.jpg')" }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/80 to-white/10" />
          <div className="absolute inset-0 bg-gradient-to-t from-white/80 via-transparent to-white/20" />
          <div className="absolute inset-0 ring-1 ring-inset ring-white/70" />
          <div className="relative z-10">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-600">EMALL SELLER CENTER</p>
            <h1 className="mt-6 max-w-[560px] text-5xl font-semibold leading-[1.08] tracking-[-0.035em] text-slate-950">Vận hành cửa hàng, tập trung tăng trưởng.</h1>
            <p className="mt-6 max-w-[520px] text-lg leading-8 text-slate-700">Quản lý sản phẩm, đơn hàng, doanh thu và số dư trên một không gian làm việc thống nhất.</p>
          </div>

          <div className="relative z-10 grid grid-cols-2 gap-3">
            <Metric value="24/7" label="Theo dõi vận hành" />
            <Metric value="1 nơi" label="Quản lý toàn bộ shop" />
            <div className="col-span-2 mt-2 flex items-center gap-3 rounded-2xl border border-white/80 bg-white/75 px-4 py-4 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur-md">
              <ShieldIcon />
              Dữ liệu bán hàng và phiên đăng nhập được bảo vệ.
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[460px]">
          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:p-9">
            <div className="relative -mx-6 -mt-6 mb-6 h-32 bg-cover bg-center sm:-mx-9 sm:-mt-9 lg:hidden" style={{ backgroundImage: "url('/images/auth/seller-login-hero.jpg')" }}>
              <div className="absolute inset-0 bg-gradient-to-r from-white/60 via-white/10 to-transparent" />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">Seller access</p>
            <h2 className="mt-3 text-[30px] font-semibold tracking-[-0.025em]">Đăng nhập Kênh Người Bán</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Sử dụng tài khoản Seller đã được eMall xác minh.</p>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
              <Field label="Email" icon={<MailIcon />}>
                <input id="seller-email" name="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="seller@example.com" className="h-12 w-full bg-transparent pl-11 pr-4 text-[15px] outline-none placeholder:text-slate-400" required />
              </Field>
              <Field label="Mật khẩu" icon={<LockIcon />}>
                <input id="seller-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Nhập mật khẩu" className="h-12 w-full bg-transparent pl-11 pr-12 text-[15px] outline-none placeholder:text-slate-400" required />
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute bottom-0 right-0 grid h-12 w-12 place-items-center text-slate-400 transition hover:text-slate-700" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}><EyeIcon crossed={showPassword} /></button>
              </Field>

              {error || oauthError ? <div role="alert" aria-live="polite" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700"><AlertIcon /><span>{error || oauthError}</span></div> : null}

              <button type="submit" disabled={isSubmitting || isOauthSubmitting} className="flex h-12 w-full items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(220,63,23,0.22)] transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting ? <><Spinner />Đang đăng nhập...</> : 'Đăng nhập'}
              </button>
              <Divider />
              <button type="button" onClick={handleGoogleLogin} disabled={isSubmitting || isOauthSubmitting} className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                {isOauthSubmitting ? <Spinner dark /> : <GoogleMark />}{isOauthSubmitting ? 'Đang kết nối Google...' : 'Tiếp tục với Google'}
              </button>
            </form>

            <div className="mt-7 rounded-xl bg-slate-50 px-4 py-3 text-center text-xs leading-5 text-slate-500">Chỉ tài khoản có vai trò Seller mới truy cập được hệ thống quản trị cửa hàng.</div>
            <p className="mt-5 border-t border-slate-100 pt-5 text-center text-xs leading-5 text-slate-400">Khi tiếp tục, bạn đồng ý với Điều khoản dịch vụ và Chính sách bảo mật của eMall.</p>
          </div>
        </section>
      </main>
      <footer className="px-5 pb-7 text-center text-xs text-slate-400">© 2026 eMall Seller Center</footer>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return <div className="rounded-2xl border border-white/80 bg-white/75 p-5 shadow-sm backdrop-blur-md"><strong className="block text-2xl font-semibold tracking-tight text-slate-950">{value}</strong><span className="mt-1 block text-xs font-semibold text-slate-600">{label}</span></div>;
}
function Field({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) { return <label className="block text-sm font-semibold text-slate-700"><span>{label}</span><span className="relative mt-2 block rounded-xl border border-slate-300 bg-white transition focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/10"><span className="pointer-events-none absolute bottom-0 left-0 grid h-12 w-11 place-items-center text-slate-400">{icon}</span>{children}</span></label>; }
function Divider() { return <div className="flex items-center gap-3 text-xs font-medium text-slate-400"><span className="h-px flex-1 bg-slate-200" /><span>hoặc tiếp tục với</span><span className="h-px flex-1 bg-slate-200" /></div>; }
function BrandMark() { return <span className="inline-flex items-center gap-2.5"><span className="block h-10 w-10 rounded-xl bg-white bg-cover bg-center shadow-sm ring-1 ring-orange-100" style={{ backgroundImage: "url('/icon.svg')" }} aria-hidden="true" /><span className="text-xl font-black tracking-[-0.03em] text-brand-600">eMall</span></span>; }
function MailIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></svg>; }
function LockIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>; }
function EyeIcon({ crossed }: { crossed: boolean }) { return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" />{crossed ? <path d="m4 4 16 16" /> : null}</svg>; }
function AlertIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 17h.01" /></svg>; }
function ShieldIcon() { return <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-orange-100 text-brand-600"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg></span>; }
function GoogleMark() { return <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full border border-slate-200 bg-white text-xs font-black text-[#4285f4]">G</span>; }
function Spinner({ dark = false }: { dark?: boolean }) { return <span aria-hidden="true" className={`mr-2 h-4 w-4 animate-spin rounded-full border-2 ${dark ? 'border-slate-300 border-t-slate-700' : 'border-white/40 border-t-white'}`} />; }
