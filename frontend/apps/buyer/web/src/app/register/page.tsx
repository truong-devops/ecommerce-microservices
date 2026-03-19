'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { keywords } from '@/lib/mock-data';
import { useAuth, useLanguage } from '@/providers/AppProvider';

export default function RegisterPage() {
  const router = useRouter();
  const { text } = useLanguage();
  const { ready, user, register } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (ready && user) {
      router.replace('/account');
    }
  }, [ready, router, user]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!name.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError(text.auth.requiredFields);
      return;
    }

    if (password !== confirmPassword) {
      setError(text.auth.passwordMismatch);
      return;
    }

    const result = register({ name, email, password });
    if (!result.ok) {
      setError(result.message ?? text.auth.emailExists);
      return;
    }

    router.push('/account');
  };

  return (
    <div className="min-h-screen bg-app-bg text-slate-900">
      <Header keywords={keywords} />
      <main className="mx-auto flex w-full max-w-[1200px] justify-center px-3 py-6 md:px-4 md:py-8">
        <section className="w-full max-w-md rounded-md bg-white p-5 shadow-card md:p-6" aria-labelledby="register-title">
          <h1 id="register-title" className="text-2xl font-bold text-brand-600">
            {text.auth.registerTitle}
          </h1>
          <p className="mt-2 text-sm text-slate-600">{text.auth.registerSubtitle}</p>

          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-slate-700">
              {text.auth.name}
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
                required
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              {text.auth.email}
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
                required
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              {text.auth.password}
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
                required
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              {text.auth.confirmPassword}
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
                required
              />
            </label>

            {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}

            <button
              type="submit"
              className="w-full rounded-md bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              {text.auth.submitRegister}
            </button>
          </form>

          <p className="mt-4 text-sm text-slate-600">
            {text.auth.haveAccount}{' '}
            <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">
              {text.auth.goLogin}
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
