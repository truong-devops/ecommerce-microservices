'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { useAuth, useLanguage } from '@/providers/AppProvider';

export default function AccountPage() {
  const router = useRouter();
  const { text } = useLanguage();
  const { ready, user, updateProfile } = useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!user) {
      router.replace('/login');
      return;
    }

    setName(user.name);
    setPhone(user.phone);
    setAddress(user.address);
  }, [ready, router, user]);

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center bg-app-bg text-slate-700">{text.account.loading}</div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen grid place-items-center bg-app-bg text-slate-700">{text.account.protectedHint}</div>
    );
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice('');

    const result = updateProfile({ name, phone, address });
    if (result.ok && result.message) {
      setNotice(result.message);
    }
  };

  const handleLogout = () => {
    router.push('/logout');
  };

  return (
    <div className="min-h-screen bg-app-bg text-slate-900">
      <Header keywords={[]} />
      <main className="mx-auto w-full max-w-[1200px] px-3 py-6 md:px-4 md:py-8">
        <section className="rounded-md bg-white p-5 shadow-card md:p-6" aria-labelledby="account-title">
          <h1 id="account-title" className="text-2xl font-bold text-brand-600">
            {text.account.title}
          </h1>
          <p className="mt-2 text-sm text-slate-600">{text.account.subtitle}</p>

          <div className="mt-4 grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-2">
            <p className="text-sm text-slate-700">
              <span className="font-semibold">{text.account.email}:</span> {user.email}
            </p>
            <p className="text-sm text-slate-700">
              <span className="font-semibold">{text.account.memberSince}:</span>{' '}
              {new Date(user.createdAt).toLocaleDateString()}
            </p>
          </div>

          <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-slate-700">
              {text.account.name}
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
                required
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              {text.account.phone}
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700 md:col-span-2">
              {text.account.address}
              <textarea
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none"
              />
            </label>

            {notice ? <p className="md:col-span-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p> : null}

            <div className="md:col-span-2 flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded-md bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
              >
                {text.account.save}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-brand-500 hover:text-brand-600"
              >
                {text.account.logout}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
