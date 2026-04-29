'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getModeratorMe, loginModerator, logoutModerator } from '@/lib/api/auth';
import { ModeratorApiClientError } from '@/lib/api/client';
import type { LoginInput, ModeratorAuthSession, ModeratorAuthUser } from '@/lib/api/types';

const AUTH_SESSION_STORAGE_KEY = 'moderator_auth_session';
const ALLOWED_ROLES = new Set(['MODERATOR', 'ADMIN', 'SUPER_ADMIN']);

interface AuthActionResult {
  ok: boolean;
  message?: string;
}

interface AuthContextValue {
  ready: boolean;
  user: ModeratorAuthUser | null;
  accessToken: string | null;
  login: (payload: LoginInput) => Promise<AuthActionResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readSession(): ModeratorAuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<ModeratorAuthSession> & {
      session?: Partial<ModeratorAuthSession>;
    };

    const value = parsed.session && typeof parsed.session === 'object' ? parsed.session : parsed;

    if (typeof value.accessToken !== 'string' || typeof value.refreshToken !== 'string' || typeof value.tokenType !== 'string') {
      return null;
    }

    return {
      accessToken: value.accessToken,
      refreshToken: value.refreshToken,
      tokenType: value.tokenType,
      sessionId: typeof value.sessionId === 'string' ? value.sessionId : '',
      expiresIn: typeof value.expiresIn === 'number' ? value.expiresIn : Number(value.expiresIn ?? 0)
    };
  } catch {
    return null;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<ModeratorAuthSession | null>(null);
  const [user, setUser] = useState<ModeratorAuthUser | null>(null);

  useEffect(() => {
    const stored = readSession();
    if (!stored) {
      setReady(true);
      return;
    }

    let isCancelled = false;

    void getModeratorMe(stored.accessToken)
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
        if (!isCancelled) {
          localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
          setSession(null);
          setUser(null);
        }
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
      const result = await loginModerator(payload);

      if (!ALLOWED_ROLES.has(result.user.role)) {
        return {
          ok: false,
          message: 'Tài khoản không có quyền truy cập Moderator Dashboard.'
        };
      }

      setSession(result.session);
      setUser(result.user);
      localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(result.session));

      return { ok: true };
    } catch (error) {
      if (error instanceof ModeratorApiClientError) {
        return {
          ok: false,
          message: error.message
        };
      }

      return {
        ok: false,
        message: 'Đăng nhập thất bại, vui lòng thử lại.'
      };
    }
  }, []);

  const logout = useCallback(async () => {
    const current = session ?? readSession();

    if (current) {
      try {
        await logoutModerator({
          accessToken: current.accessToken,
          refreshToken: current.refreshToken
        });
      } catch {
        // ignore
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
