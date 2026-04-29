'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useAuth } from '@/providers/AppProvider';

export function SellerAuthGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, user, accessToken } = useAuth();

  const isLoginPage = pathname === '/login';
  const isAuthed = Boolean(user && accessToken);

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!isLoginPage && !isAuthed) {
      router.replace('/login');
    }
  }, [isAuthed, isLoginPage, ready, router]);

  if (!ready) {
    return null;
  }

  if (!isLoginPage && !isAuthed) {
    return null;
  }

  return <>{children}</>;
}

