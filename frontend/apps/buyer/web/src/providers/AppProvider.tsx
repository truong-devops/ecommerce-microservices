'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { messages, type Locale } from '@/lib/i18n';

const LOCALE_STORAGE_KEY = 'buyer_locale';
const USERS_STORAGE_KEY = 'buyer_users';
const SESSION_STORAGE_KEY = 'buyer_session_email';

interface BuyerUserRecord {
  id: string;
  name: string;
  email: string;
  password: string;
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
  login: (payload: LoginPayload) => AuthActionResult;
  register: (payload: RegisterPayload) => AuthActionResult;
  logout: () => void;
  updateProfile: (payload: UpdateProfilePayload) => AuthActionResult;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function toPublicUser(user: BuyerUserRecord): BuyerUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    address: user.address,
    createdAt: user.createdAt
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('vi');
  const [ready, setReady] = useState(false);
  const [users, setUsers] = useState<BuyerUserRecord[]>([]);
  const [user, setUser] = useState<BuyerUser | null>(null);

  useEffect(() => {
    try {
      const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (storedLocale === 'en' || storedLocale === 'vi') {
        setLocaleState(storedLocale);
      }

      const rawUsers = localStorage.getItem(USERS_STORAGE_KEY);
      const parsedUsers = rawUsers ? (JSON.parse(rawUsers) as BuyerUserRecord[]) : [];
      setUsers(parsedUsers);

      const sessionEmail = localStorage.getItem(SESSION_STORAGE_KEY);
      if (sessionEmail) {
        const foundUser = parsedUsers.find((item) => item.email === sessionEmail);
        if (foundUser) {
          setUser(toPublicUser(foundUser));
        }
      }
    } catch {
      setUsers([]);
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
  }, []);

  const login = useCallback(
    ({ email, password }: LoginPayload): AuthActionResult => {
      const normalized = normalizeEmail(email);
      const found = users.find((item) => item.email === normalized && item.password === password);

      if (!found) {
        return { ok: false, message: messages[locale].auth.invalidCredentials };
      }

      setUser(toPublicUser(found));
      localStorage.setItem(SESSION_STORAGE_KEY, found.email);
      return { ok: true };
    },
    [locale, users]
  );

  const register = useCallback(
    ({ name, email, password }: RegisterPayload): AuthActionResult => {
      const normalized = normalizeEmail(email);
      const existed = users.some((item) => item.email === normalized);

      if (existed) {
        return { ok: false, message: messages[locale].auth.emailExists };
      }

      const newUser: BuyerUserRecord = {
        id: `buyer_${Date.now()}`,
        name: name.trim(),
        email: normalized,
        password,
        phone: '',
        address: '',
        createdAt: new Date().toISOString()
      };

      const nextUsers = [...users, newUser];
      setUsers(nextUsers);
      setUser(toPublicUser(newUser));

      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(nextUsers));
      localStorage.setItem(SESSION_STORAGE_KEY, newUser.email);

      return { ok: true };
    },
    [locale, users]
  );

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }, []);

  const updateProfile = useCallback(
    ({ name, phone, address }: UpdateProfilePayload): AuthActionResult => {
      if (!user) {
        return { ok: false };
      }

      const nextUsers = users.map((item) => {
        if (item.id !== user.id) {
          return item;
        }

        return {
          ...item,
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim()
        };
      });

      const updated = nextUsers.find((item) => item.id === user.id);
      if (!updated) {
        return { ok: false };
      }

      setUsers(nextUsers);
      setUser(toPublicUser(updated));
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(nextUsers));

      return { ok: true, message: messages[locale].account.saveSuccess };
    },
    [locale, user, users]
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
