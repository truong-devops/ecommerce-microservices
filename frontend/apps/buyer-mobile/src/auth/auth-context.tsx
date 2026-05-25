import type { AuthSession } from '@frontend/buyer-contracts';
import * as SecureStore from 'expo-secure-store';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { exchangeMobileOauthTicket, fetchBuyerMe, loginBuyer, logoutBuyerSession, refreshBuyerSession } from '@/api/auth';

import { mergeRotatedTokens, parseSession, serializeSession } from './session';

const SESSION_KEY = 'buyer.auth.session.v1';

interface AuthContextValue {
  isLoading: boolean;
  session: AuthSession | null;
  signIn(email: string, password: string): Promise<void>;
  completeGoogleLogin(ticket: string, codeVerifier: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [isLoading, setLoading] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    const bootstrap = async () => {
      const restored = parseSession(await SecureStore.getItemAsync(SESSION_KEY));
      if (!restored) {
        return;
      }
      try {
        const me = await fetchBuyerMe(restored.accessToken);
        const verifiedSession = { ...restored, user: me.user };
        await SecureStore.setItemAsync(SESSION_KEY, serializeSession(verifiedSession));
        setSession(verifiedSession);
      } catch {
        try {
          const refreshed = mergeRotatedTokens(restored, await refreshBuyerSession(restored.refreshToken));
          const me = await fetchBuyerMe(refreshed.accessToken);
          const verifiedSession = { ...refreshed, user: me.user };
          await SecureStore.setItemAsync(SESSION_KEY, serializeSession(verifiedSession));
          setSession(verifiedSession);
        } catch {
          await SecureStore.deleteItemAsync(SESSION_KEY);
        }
      }
    };

    void bootstrap().finally(() => setLoading(false));
  }, []);

  const persist = useCallback(async (nextSession: AuthSession) => {
    await SecureStore.setItemAsync(SESSION_KEY, serializeSession(nextSession));
    setSession(nextSession);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await persist(await loginBuyer(email.trim(), password));
    },
    [persist]
  );

  const completeGoogleLogin = useCallback(
    async (ticket: string, codeVerifier: string) => {
      await persist(await exchangeMobileOauthTicket(ticket, codeVerifier));
    },
    [persist]
  );

  const signOut = useCallback(async () => {
    try {
      if (session) {
        await logoutBuyerSession(session);
      }
    } finally {
      await SecureStore.deleteItemAsync(SESSION_KEY);
      setSession(null);
    }
  }, [session]);

  const value = useMemo(
    () => ({ isLoading, session, signIn, completeGoogleLogin, signOut }),
    [completeGoogleLogin, isLoading, session, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
