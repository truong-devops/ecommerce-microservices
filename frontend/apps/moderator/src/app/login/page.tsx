'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/providers/AppProvider';

export default function ModeratorLoginPage() {
  const router = useRouter();
  const { ready, user, login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (ready && user) {
      router.replace('/');
    }
  }, [ready, user, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Email và mật khẩu là bắt buộc.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login({ email, password, mfaCode: mfaCode.trim() || undefined });
      if (!result.ok) {
        setError(result.message ?? 'Đăng nhập thất bại.');
        return;
      }

      router.push('/');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-20 w-full max-w-[1200px] items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-2 text-[20px] font-semibold leading-none text-brand-500">
              <span className="grid h-7 w-7 place-items-center rounded-md border-2 border-brand-500 text-[18px] font-medium">m</span>
              <span className="text-[22px]">eMall</span>
            </span>
            <span className="text-[22px] font-medium text-slate-800">Moderator Console</span>
          </div>
          <a href="#" className="text-sm text-brand-500 transition hover:text-brand-600">
            Bạn cần giúp đỡ?
          </a>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-8 px-4 py-12 lg:grid-cols-[1fr_430px] lg:items-center">
        <section className="hidden px-12 lg:block">
          <h2 className="text-[28px] font-semibold leading-tight text-brand-500">Kiểm duyệt chuyên nghiệp</h2>
          <p className="mt-3 max-w-[560px] text-[16px] leading-snug text-slate-600">
            Quản lý chất lượng listing hiệu quả hơn
            <br />
            với eMall Trust & Safety Console
          </p>

          <div className="mt-8">
            <svg viewBox="0 0 520 300" className="h-[300px] w-[520px]" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x="66" y="80" width="250" height="180" rx="14" fill="#ffffff" stroke="#cbd5e1" strokeWidth="4" />
              <rect x="88" y="110" width="160" height="18" rx="8" fill="#e2e8f0" />
              <rect x="88" y="146" width="180" height="14" rx="7" fill="#e2e8f0" />
              <rect x="88" y="176" width="140" height="14" rx="7" fill="#e2e8f0" />
              <rect x="88" y="206" width="125" height="14" rx="7" fill="#e2e8f0" />
              <circle cx="278" cy="186" r="56" fill="#fff3ef" stroke="#ee4d2d" strokeWidth="4" />
              <path d="M278 152l24 10v20c0 18-13 33-24 38-11-5-24-20-24-38v-20z" fill="#ee4d2d" />
              <path d="M266 182l10 10 18-20" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <circle cx="380" cy="120" r="40" fill="#ffffff" stroke="#94a3b8" strokeWidth="4" />
              <circle cx="380" cy="120" r="16" fill="none" stroke="#475569" strokeWidth="4" />
              <line x1="392" y1="132" x2="410" y2="150" stroke="#475569" strokeWidth="6" strokeLinecap="round" />
              <circle cx="94" cy="74" r="18" fill="#bae6fd" />
              <circle cx="116" cy="74" r="12" fill="#7dd3fc" />
            </svg>
          </div>
        </section>

        <section>
          <div className="rounded-sm bg-white p-8 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-[18px] font-medium text-slate-800">Đăng nhập</h1>
              <div className="relative border-2 border-[#f0b100] bg-[#fffbe6] px-3 py-1 text-[11px] font-semibold leading-tight text-[#f0a300]">
                Đăng nhập
                <br />
                với mã MFA
                <span className="absolute -right-[11px] top-1/2 block h-4 w-4 -translate-y-1/2 rotate-45 border-r-2 border-t-2 border-[#f0b100] bg-[#fffbe6]" />
              </div>
            </div>

            <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email/Tên đăng nhập"
                className="h-12 w-full rounded-sm border border-slate-300 px-4 text-base outline-none transition focus:border-brand-500"
                required
              />

              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mật khẩu"
                className="h-12 w-full rounded-sm border border-slate-300 px-4 text-base outline-none transition focus:border-brand-500"
                required
              />

              <input
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Mã MFA (6 số)"
                inputMode="numeric"
                className="h-12 w-full rounded-sm border border-slate-300 px-4 text-base outline-none transition focus:border-brand-500"
              />

              {error ? <p className="rounded-sm bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p> : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="h-12 w-full rounded-sm bg-[#ee826f] text-[14px] font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-80"
              >
                {isSubmitting ? 'Đang xử lí...' : 'ĐĂNG NHẬP'}
              </button>

              <a href="#" className="inline-block text-[15px] text-[#0f5db6] hover:underline">
                Quên mật khẩu
              </a>

              <div className="flex items-center gap-4 text-slate-400">
                <span className="h-px flex-1 bg-slate-300" />
                <span className="text-base">HOẶC</span>
                <span className="h-px flex-1 bg-slate-300" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button type="button" className="h-12 rounded-sm border border-slate-300 text-base font-medium text-slate-700 hover:bg-slate-50">
                  Single Sign-On
                </button>
                <button type="button" className="h-12 rounded-sm border border-slate-300 text-base font-medium text-slate-700 hover:bg-slate-50">
                  Support Access
                </button>
              </div>

              <p className="text-center text-sm leading-relaxed text-slate-500">
                Bằng việc đăng nhập, bạn đồng ý với{' '}
                <a href="#" className="text-brand-500 hover:underline">
                  Điều khoản dịch vụ
                </a>{' '}
                &{' '}
                <a href="#" className="text-brand-500 hover:underline">
                  Chính sách bảo mật
                </a>{' '}
                của eMall
              </p>
            </form>
          </div>
        </section>
      </main>

      <footer className="pb-10 pt-16 text-center text-sm text-slate-500">(c) 2026 eMall. Tất cả các quyền được bảo lưu.</footer>
    </div>
  );
}
