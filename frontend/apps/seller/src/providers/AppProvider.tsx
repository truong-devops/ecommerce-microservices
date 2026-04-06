'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSellerMe, loginSeller, logoutSeller } from '@/lib/api/auth';
import { SellerApiClientError } from '@/lib/api/client';
import type { LoginInput, SellerAuthSession, SellerAuthUser } from '@/lib/api/types';

const AUTH_SESSION_STORAGE_KEY = 'seller_auth_session';
const ALLOWED_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN', 'SUPPORT']);

interface AuthActionResult {
  ok: boolean;
  message?: string;
}

interface AuthContextValue {
  ready: boolean;
  user: SellerAuthUser | null;
  accessToken: string | null;
  login: (payload: LoginInput) => Promise<AuthActionResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readSession(): SellerAuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<SellerAuthSession>;
    if (
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.refreshToken !== 'string' ||
      typeof parsed.tokenType !== 'string' ||
      typeof parsed.sessionId !== 'string' ||
      typeof parsed.expiresIn !== 'number'
    ) {
      return null;
    }

    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      tokenType: parsed.tokenType,
      sessionId: parsed.sessionId,
      expiresIn: parsed.expiresIn
    };
  } catch {
    return null;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<SellerAuthSession | null>(null);
  const [user, setUser] = useState<SellerAuthUser | null>(null);

  useEffect(() => {
    const stored = readSession();
    if (!stored) {
      setReady(true);
      return;
    }

    let isCancelled = false;

    void getSellerMe(stored.accessToken)
      .then((result) => {
        if (isCancelled) {
          return;
        }

        if (!ALLOWED_ROLES.has(result.user.role)) {
          localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
          setSession(null);
          setUser(null);
          return;
        }

        setSession(stored);
        setUser(result.user);
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }

        localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
        setSession(null);
        setUser(null);
      })
      .finally(() => {
        if (!isCancelled) {
          setReady(true);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  const login = useCallback(async (payload: LoginInput): Promise<AuthActionResult> => {
    try {
      const result = await loginSeller(payload);
      if (!ALLOWED_ROLES.has(result.user.role)) {
        return {
          ok: false,
          message: 'Tai khoan khong co quyen truy cap Seller Dashboard.'
        };
      }

      setSession(result.session);
      setUser(result.user);
      localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(result.session));

      return { ok: true };
    } catch (error) {
      if (error instanceof SellerApiClientError) {
        return {
          ok: false,
          message: error.message
        };
      }

      return {
        ok: false,
        message: 'Dang nhap that bai, vui long thu lai.'
      };
    }
  }, []);

  const logout = useCallback(async () => {
    const currentSession = session ?? readSession();

    if (currentSession) {
      try {
        await logoutSeller({
          accessToken: currentSession.accessToken,
          refreshToken: currentSession.refreshToken
        });
      } catch {
        // Always clear local session regardless of upstream response.
      }
    }

    localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    setSession(null);
    setUser(null);
  }, [session]);

  const value = useMemo(
    () => ({
      ready,
      user,
      accessToken: session?.accessToken ?? null,
      login,
      logout
    }),
    [ready, user, session?.accessToken, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AppProvider');
  }

  return context;
}
