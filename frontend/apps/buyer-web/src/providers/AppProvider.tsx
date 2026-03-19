'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getBuyerMe, loginBuyer, logoutBuyer, registerBuyer } from '@/lib/api/auth';
import { BuyerApiClientError } from '@/lib/api/client';
import type { BuyerAuthSession, BuyerAuthUser } from '@/lib/api/types';
import { messages, type Locale } from '@/lib/i18n';

const LOCALE_STORAGE_KEY = 'buyer_locale';
const AUTH_SESSION_STORAGE_KEY = 'buyer_auth_session';
const PROFILES_STORAGE_KEY = 'buyer_profiles';

interface BuyerProfile {
  name: string;
  phone: string;
  address: string;
  createdAt: string;
}

export interface BuyerUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  createdAt: string;
}

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  text: (typeof messages)['en'];
}

interface LoginPayload {
  email: string;
  password: string;
}

interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

interface UpdateProfilePayload {
  name: string;
  phone: string;
  address: string;
}

interface AuthActionResult {
  ok: boolean;
  message?: string;
}

interface AuthContextValue {
  ready: boolean;
  user: BuyerUser | null;
  login: (payload: LoginPayload) => Promise<AuthActionResult>;
  register: (payload: RegisterPayload) => Promise<AuthActionResult>;
  logout: () => Promise<void>;
  updateProfile: (payload: UpdateProfilePayload) => AuthActionResult;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function profileFromEmail(email: string): BuyerProfile {
  return {
    name: email.split('@')[0] ?? 'Buyer',
    phone: '',
    address: '',
    createdAt: new Date().toISOString()
  };
}

function toBuyerUser(authUser: BuyerAuthUser, profile: BuyerProfile): BuyerUser {
  return {
    id: authUser.id,
    email: authUser.email,
    name: profile.name,
    phone: profile.phone,
    address: profile.address,
    createdAt: profile.createdAt
  };
}

function readProfiles(): Record<string, BuyerProfile> {
  try {
    const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, BuyerProfile>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function readSession(): BuyerAuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<BuyerAuthSession>;
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
  const [locale, setLocaleState] = useState<Locale>('vi');
  const [ready, setReady] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, BuyerProfile>>({});
  const [session, setSession] = useState<BuyerAuthSession | null>(null);
  const [user, setUser] = useState<BuyerUser | null>(null);

  useEffect(() => {
    let disposed = false;

    const bootstrap = async () => {
      try {
        const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
        if (storedLocale === 'en' || storedLocale === 'vi') {
          setLocaleState(storedLocale);
        }

        const storedProfiles = readProfiles();
        const storedSession = readSession();

        if (!disposed) {
          setProfiles(storedProfiles);
        }

        if (!storedSession) {
          return;
        }

        try {
          const me = await getBuyerMe(storedSession.accessToken);
          const existingProfile = storedProfiles[me.user.id] ?? profileFromEmail(me.user.email);
          const nextProfiles =
            storedProfiles[me.user.id] === undefined
              ? {
                  ...storedProfiles,
                  [me.user.id]: existingProfile
                }
              : storedProfiles;

          if (!disposed) {
            if (storedProfiles[me.user.id] === undefined) {
              setProfiles(nextProfiles);
              localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(nextProfiles));
            }

            setSession(storedSession);
            setUser(toBuyerUser(me.user, existingProfile));
          }
        } catch {
          localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
          if (!disposed) {
            setSession(null);
            setUser(null);
          }
        }
      } finally {
        if (!disposed) {
          setReady(true);
        }
      }
    };

    void bootstrap();

    return () => {
      disposed = true;
    };
  }, []);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
  }, []);

  const login = useCallback(
    async ({ email, password }: LoginPayload): Promise<AuthActionResult> => {
      try {
        const result = await loginBuyer({
          email: normalizeEmail(email),
          password
        });

        const currentProfiles = readProfiles();
        const existingProfile = currentProfiles[result.user.id] ?? profileFromEmail(result.user.email);
        const nextProfiles =
          currentProfiles[result.user.id] === undefined
            ? {
                ...currentProfiles,
                [result.user.id]: existingProfile
              }
            : currentProfiles;

        setProfiles(nextProfiles);
        if (currentProfiles[result.user.id] === undefined) {
          localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(nextProfiles));
        }

        setSession(result.session);
        setUser(toBuyerUser(result.user, existingProfile));
        localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(result.session));

        return { ok: true };
      } catch (error) {
        if (error instanceof BuyerApiClientError) {
          return { ok: false, message: error.message };
        }

        return { ok: false, message: messages[locale].auth.invalidCredentials };
      }
    },
    [locale]
  );

  const register = useCallback(
    async ({ name, email, password }: RegisterPayload): Promise<AuthActionResult> => {
      const normalizedEmail = normalizeEmail(email);

      try {
        const registered = await registerBuyer({
          email: normalizedEmail,
          password,
          role: 'CUSTOMER'
        });

        const currentProfiles = readProfiles();
        const existingProfile = currentProfiles[registered.userId];
        const createdProfile: BuyerProfile = existingProfile ?? {
          name: name.trim() || profileFromEmail(normalizedEmail).name,
          phone: '',
          address: '',
          createdAt: new Date().toISOString()
        };

        const nextProfiles =
          existingProfile === undefined
            ? {
                ...currentProfiles,
                [registered.userId]: createdProfile
              }
            : {
                ...currentProfiles,
                [registered.userId]: {
                  ...existingProfile,
                  name: name.trim() || existingProfile.name
                }
              };

        setProfiles(nextProfiles);
        localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(nextProfiles));

        return login({
          email: normalizedEmail,
          password
        });
      } catch (error) {
        if (error instanceof BuyerApiClientError) {
          return { ok: false, message: error.message };
        }

        return { ok: false, message: messages[locale].auth.emailExists };
      }
    },
    [locale, login]
  );

  const logout = useCallback(async () => {
    const currentSession = session ?? readSession();
    if (currentSession) {
      try {
        await logoutBuyer({
          accessToken: currentSession.accessToken,
          refreshToken: currentSession.refreshToken
        });
      } catch {
        // Always clear local session regardless of upstream result.
      }
    }

    setSession(null);
    setUser(null);
    localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  }, [session]);

  const updateProfile = useCallback(
    ({ name, phone, address }: UpdateProfilePayload): AuthActionResult => {
      if (!user) {
        return { ok: false };
      }

      const nextProfile: BuyerProfile = {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        createdAt: user.createdAt
      };

      const nextProfiles = {
        ...profiles,
        [user.id]: nextProfile
      };

      setProfiles(nextProfiles);
      setUser({
        ...user,
        ...nextProfile
      });
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(nextProfiles));

      return { ok: true, message: messages[locale].account.saveSuccess };
    },
    [locale, profiles, user]
  );

  const languageValue = useMemo(
    () => ({
      locale,
      setLocale,
      text: messages[locale]
    }),
    [locale, setLocale]
  );

  const authValue = useMemo(
    () => ({
      ready,
      user,
      login,
      register,
      logout,
      updateProfile
    }),
    [login, logout, ready, register, updateProfile, user]
  );

  return (
    <LanguageContext.Provider value={languageValue}>
      <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within AppProvider');
  }

  return context;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AppProvider');
  }

  return context;
}
