'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth, useLanguage } from '@/providers/AppProvider';

export default function LogoutPage() {
  const router = useRouter();
  const { text } = useLanguage();
  const { logout } = useAuth();

  useEffect(() => {
    logout();
    router.replace('/');
  }, [logout, router]);

  return (
    <div className="min-h-screen grid place-items-center bg-app-bg text-slate-700">
      {text.account.logout}...
    </div>
  );
}
