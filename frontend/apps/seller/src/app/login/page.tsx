'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/providers/AppProvider';

export default function SellerLoginPage() {
  const router = useRouter();
  const { ready, user, login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      const result = await login({
        email,
        password
      });

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
              <span className="grid h-7 w-7 place-items-center rounded-md border-2 border-brand-500 text-[18px] font-medium">e</span>
              <span className="text-[22px]">eMall</span>
            </span>
            <span className="text-[22px] font-medium text-slate-800">Kênh Người Bán</span>
          </div>
          <a href="#" className="text-sm text-brand-500 transition hover:text-brand-600">
            Bạn cần giúp đỡ?
          </a>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-8 px-4 py-12 lg:grid-cols-[1fr_430px] lg:items-center">
        <section className="hidden px-12 lg:block">
          <h2 className="text-[28px] font-semibold leading-tight text-brand-500">Bán hàng chuyên nghiệp</h2>
          <p className="mt-3 max-w-[560px] text-[16px] leading-snug text-slate-600">
            Quản lý shop của bạn một cách hiệu quả hơn
            <br />
            trên eMall với eMall - Kênh Người bán
          </p>

          <div className="mt-8">
            <svg
              viewBox="0 0 480 300"
              className="h-[300px] w-[480px]"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
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
          <div className="rounded-sm bg-white p-8 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-[18px] font-medium text-slate-800">Đăng nhập</h1>
              <div className="relative border-2 border-[#f0b100] bg-[#fffbe6] px-3 py-1 text-[13px] font-semibold leading-tight text-[#f0a300]">
                Đăng nhập
                <br />
                với mã QR
                <span className="absolute -right-[11px] top-1/2 block h-4 w-4 -translate-y-1/2 rotate-45 border-r-2 border-t-2 border-[#f0b100] bg-[#fffbe6]" />
              </div>
            </div>

            <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email/Số điện thoại/Tên đăng nhập"
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
                  Facebook
                </button>
                <button type="button" className="h-12 rounded-sm border border-slate-300 text-base font-medium text-slate-700 hover:bg-slate-50">
                  Google
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

              <p className="text-center text-base text-slate-400">
                Bạn mới biết đến eMall?{' '}
                <Link href="#" className="font-semibold text-brand-500 hover:underline">
                  Đăng ký
                </Link>
              </p>
            </form>
          </div>

          <button
            type="button"
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-sm bg-white text-base text-slate-700 shadow-[0_1px_8px_rgba(0,0,0,0.08)] hover:bg-slate-50"
          >
            Đăng nhập với tài khoản Chính/ Phụ
            <span aria-hidden="true">›</span>
          </button>
        </section>
      </main>

      <footer className="pb-10 pt-16 text-center text-sm text-slate-500">(c) 2026 eMall. Tất cả các quyền được bảo lưu.</footer>
    </div>
  );
}
