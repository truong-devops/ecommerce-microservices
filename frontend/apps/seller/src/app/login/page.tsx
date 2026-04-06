'use client';

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
      setError('Email va mat khau la bat buoc.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login({
        email,
        password
      });

      if (!result.ok) {
        setError(result.message ?? 'Dang nhap that bai.');
        return;
      }

      router.push('/');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-orange-500">eMall Seller Center</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Dang nhap dashboard</h1>
        <p className="mt-2 text-sm text-slate-600">Chi role SELLER / ADMIN / SUPPORT / SUPER_ADMIN duoc phep truy cap.</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-orange-400"
              required
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Mat khau
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-orange-400"
              required
            />
          </label>

          {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            {isSubmitting ? 'Dang xu ly...' : 'Dang nhap'}
          </button>
        </form>
      </section>
    </main>
  );
}
