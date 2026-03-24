'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getBuyerMe, loginBuyer, logoutBuyer, registerBuyer } from '@/lib/api/auth';
import { BuyerApiClientError } from '@/lib/api/client';
import { getBuyerProfile, updateBuyerProfile } from '@/lib/api/profile';
import { isValidProductId } from '@/lib/product-id';
import type { BuyerAuthSession, BuyerAuthUser, BuyerGender, BuyerProfileOutput } from '@/lib/api/types';
import { messages, type Locale } from '@/lib/i18n';

const LOCALE_STORAGE_KEY = 'buyer_locale';
const AUTH_SESSION_STORAGE_KEY = 'buyer_auth_session';
const PROFILES_STORAGE_KEY = 'buyer_profiles';
const CART_STORAGE_KEY = 'buyer_cart_items';
const VALID_GENDERS: BuyerGender[] = ['male', 'female', 'other', 'unspecified'];

interface BuyerProfile {
  name: string;
  phone: string;
  address: string;
  gender: BuyerGender;
  dateOfBirth: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export interface BuyerUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  gender: BuyerGender;
  dateOfBirth: string | null;
  avatarUrl: string | null;
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
  gender: BuyerGender;
  dateOfBirth: string | null;
  avatarUrl: string | null;
}

interface AuthActionResult {
  ok: boolean;
  message?: string;
}

export interface CartItem {
  productId: string;
  title: string;
  image: string;
  unitPrice: number;
  quantity: number;
  stock: number | null;
  sku: string | null;
  currency: string;
}

interface AddToCartPayload {
  productId: string;
  title: string;
  image: string;
  unitPrice: number;
  stock: number | null;
  sku?: string | null;
  currency?: string;
}

interface CartActionResult {
  ok: boolean;
  message?: string;
}

interface AuthContextValue {
  ready: boolean;
  user: BuyerUser | null;
  accessToken: string | null;
  login: (payload: LoginPayload) => Promise<AuthActionResult>;
  register: (payload: RegisterPayload) => Promise<AuthActionResult>;
  logout: () => Promise<void>;
  updateProfile: (payload: UpdateProfilePayload) => Promise<AuthActionResult>;
}

interface CartContextValue {
  ready: boolean;
  items: CartItem[];
  cartCount: number;
  cartTotal: number;
  addToCart: (payload: AddToCartPayload, quantity?: number) => CartActionResult;
  setItemQuantity: (productId: string, quantity: number) => CartActionResult;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);
const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const CartContext = createContext<CartContextValue | undefined>(undefined);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function profileFromEmail(email: string): BuyerProfile {
  return {
    name: email.split('@')[0] ?? 'Buyer',
    phone: '',
    address: '',
    gender: 'unspecified',
    dateOfBirth: null,
    avatarUrl: null,
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
    gender: profile.gender,
    dateOfBirth: profile.dateOfBirth,
    avatarUrl: profile.avatarUrl,
    createdAt: profile.createdAt
  };
}

function normalizeGender(value: string | null | undefined, fallback: BuyerGender): BuyerGender {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return (VALID_GENDERS.find((gender) => gender === normalized) ?? fallback) as BuyerGender;
}

function profileFromApi(apiProfile: BuyerProfileOutput, fallbackEmail: string, fallbackProfile: BuyerProfile): BuyerProfile {
  const fallbackName = profileFromEmail(fallbackEmail).name.toLowerCase();
  const nextName = apiProfile.name.trim();
  const shouldKeepLocalName =
    fallbackProfile.name.trim().length > 0 && nextName.length > 0 && nextName.toLowerCase() === fallbackName;

  return {
    name: shouldKeepLocalName ? fallbackProfile.name : nextName || fallbackProfile.name || profileFromEmail(fallbackEmail).name,
    phone: apiProfile.phone,
    address: apiProfile.address,
    gender: normalizeGender(apiProfile.gender, fallbackProfile.gender),
    dateOfBirth: apiProfile.dateOfBirth,
    avatarUrl: apiProfile.avatarUrl,
    createdAt: apiProfile.createdAt || fallbackProfile.createdAt
  };
}

function readProfiles(): Record<string, BuyerProfile> {
  try {
    const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, Partial<BuyerProfile>>;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, BuyerProfile>>((accumulator, [userId, profile]) => {
      if (!profile || typeof profile !== 'object') {
        return accumulator;
      }

      const normalizedName = typeof profile.name === 'string' && profile.name.trim().length > 0 ? profile.name : 'Buyer';
      const normalizedPhone = typeof profile.phone === 'string' ? profile.phone : '';
      const normalizedAddress = typeof profile.address === 'string' ? profile.address : '';
      const normalizedGender = normalizeGender(profile.gender, 'unspecified');
      const normalizedDateOfBirth =
        typeof profile.dateOfBirth === 'string' && profile.dateOfBirth.trim().length > 0 ? profile.dateOfBirth : null;
      const normalizedAvatarUrl =
        typeof profile.avatarUrl === 'string' && profile.avatarUrl.trim().length > 0 ? profile.avatarUrl : null;
      const normalizedCreatedAt =
        typeof profile.createdAt === 'string' && profile.createdAt.trim().length > 0
          ? profile.createdAt
          : new Date().toISOString();

      accumulator[userId] = {
        name: normalizedName,
        phone: normalizedPhone,
        address: normalizedAddress,
        gender: normalizedGender,
        dateOfBirth: normalizedDateOfBirth,
        avatarUrl: normalizedAvatarUrl,
        createdAt: normalizedCreatedAt
      };

      return accumulator;
    }, {});
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

function sanitizeNonNegativeInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }

  return null;
}

function readCartItems(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const record = item as Partial<CartItem>;
        const productId = typeof record.productId === 'string' ? record.productId.trim() : '';
        const title = typeof record.title === 'string' ? record.title.trim() : '';
        const image = typeof record.image === 'string' ? record.image : '';
        const unitPrice =
          typeof record.unitPrice === 'number' && Number.isFinite(record.unitPrice) && record.unitPrice >= 0
            ? record.unitPrice
            : null;
        const quantity = sanitizeNonNegativeInt(record.quantity);
        const stock = record.stock === null ? null : sanitizeNonNegativeInt(record.stock);
        const sku = typeof record.sku === 'string' && record.sku.trim().length > 0 ? record.sku.trim() : null;
        const currency =
          typeof record.currency === 'string' && /^[A-Z]{3}$/.test(record.currency.trim().toUpperCase())
            ? record.currency.trim().toUpperCase()
            : 'USD';

        if (!isValidProductId(productId) || !title || !image || unitPrice === null || quantity === null || quantity <= 0) {
          return null;
        }

        return {
          productId,
          title,
          image,
          unitPrice,
          quantity,
          stock,
          sku,
          currency
        } satisfies CartItem;
      })
      .filter((item): item is CartItem => item !== null);
  } catch {
    return [];
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('vi');
  const [ready, setReady] = useState(false);
  const [cartReady, setCartReady] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, BuyerProfile>>({});
  const [session, setSession] = useState<BuyerAuthSession | null>(null);
  const [user, setUser] = useState<BuyerUser | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

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
          let resolvedProfile = existingProfile;

          try {
            const backendProfile = await getBuyerProfile({
              accessToken: storedSession.accessToken
            });
            resolvedProfile = profileFromApi(backendProfile, me.user.email, existingProfile);
          } catch {
            // Fallback to local profile cache when user-service profile is unavailable.
          }

          const nextProfiles = {
            ...storedProfiles,
            [me.user.id]: resolvedProfile
          };

          if (!disposed) {
            setProfiles(nextProfiles);
            localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(nextProfiles));
            setSession(storedSession);
            setUser(toBuyerUser(me.user, resolvedProfile));
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

  useEffect(() => {
    const storedCartItems = readCartItems();
    setCartItems(storedCartItems);
    setCartReady(true);
  }, []);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
  }, []);

  const persistCartItems = useCallback((nextItems: CartItem[]) => {
    setCartItems(nextItems);

    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(nextItems));
    } catch {
      // Ignore persist errors to avoid breaking cart interactions.
    }
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
        let resolvedProfile = existingProfile;

        try {
          const backendProfile = await getBuyerProfile({
            accessToken: result.session.accessToken
          });
          resolvedProfile = profileFromApi(backendProfile, result.user.email, existingProfile);
        } catch {
          // Fallback to local profile cache when user-service profile is unavailable.
        }

        const nextProfiles = {
          ...currentProfiles,
          [result.user.id]: resolvedProfile
        };

        setProfiles(nextProfiles);
        localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(nextProfiles));

        setSession(result.session);
        setUser(toBuyerUser(result.user, resolvedProfile));
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
          gender: 'unspecified',
          dateOfBirth: null,
          avatarUrl: null,
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
    async ({ name, phone, address, gender, dateOfBirth, avatarUrl }: UpdateProfilePayload): Promise<AuthActionResult> => {
      if (!user || !session?.accessToken) {
        return { ok: false };
      }

      const normalizedName = name.trim();
      const normalizedPhone = phone.trim();
      const normalizedAddress = address.trim();
      const normalizedGender = normalizeGender(gender, 'unspecified');
      const normalizedDateOfBirth = typeof dateOfBirth === 'string' && dateOfBirth.trim() ? dateOfBirth.trim() : null;
      const normalizedAvatarUrl = typeof avatarUrl === 'string' && avatarUrl.trim() ? avatarUrl.trim() : null;

      if (!normalizedName || !normalizedPhone) {
        return {
          ok: false,
          message: messages[locale].auth.requiredFields
        };
      }

      try {
        const updatedProfile = await updateBuyerProfile({
          accessToken: session.accessToken,
          payload: {
            name: normalizedName,
            phone: normalizedPhone,
            address: normalizedAddress,
            gender: normalizedGender,
            dateOfBirth: normalizedDateOfBirth,
            avatarUrl: normalizedAvatarUrl
          }
        });

        const currentProfile = profiles[user.id] ?? profileFromEmail(user.email);
        const nextProfile = profileFromApi(updatedProfile, user.email, currentProfile);
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
      } catch (error) {
        if (error instanceof BuyerApiClientError) {
          return { ok: false, message: error.message };
        }

        return { ok: false, message: messages[locale].account.saveFailed };
      }
    },
    [locale, profiles, session?.accessToken, user]
  );

  const cartCount = useMemo(
    () => cartItems.reduce((total, item) => total + item.quantity, 0),
    [cartItems]
  );

  const cartTotal = useMemo(
    () => cartItems.reduce((total, item) => total + item.unitPrice * item.quantity, 0),
    [cartItems]
  );

  const addToCart = useCallback(
    (payload: AddToCartPayload, quantity = 1): CartActionResult => {
      const productId = payload.productId.trim();
      const title = payload.title.trim();
      const unitPrice = payload.unitPrice;
      const stock = payload.stock;
      const sku = typeof payload.sku === 'string' && payload.sku.trim().length > 0 ? payload.sku.trim() : null;
      const currency =
        typeof payload.currency === 'string' && /^[A-Z]{3}$/.test(payload.currency.trim().toUpperCase())
          ? payload.currency.trim().toUpperCase()
          : 'USD';
      const requested = sanitizeNonNegativeInt(quantity);

      if (!isValidProductId(productId) || !title || !payload.image || !Number.isFinite(unitPrice) || unitPrice < 0) {
        return {
          ok: false,
          message: messages[locale].product.loadError
        };
      }

      if (requested === null || requested <= 0) {
        return {
          ok: false,
          message: messages[locale].product.invalidQuantity
        };
      }

      const normalizedStock = stock === null ? null : sanitizeNonNegativeInt(stock);
      if (normalizedStock !== null && normalizedStock <= 0) {
        return {
          ok: false,
          message: messages[locale].product.stockOut
        };
      }

      const existing = cartItems.find((item) => item.productId === productId);
      const baseQuantity = existing?.quantity ?? 0;
      const targetQuantity = baseQuantity + requested;
      const finalQuantity =
        normalizedStock !== null ? Math.min(targetQuantity, normalizedStock) : targetQuantity;

      if (finalQuantity <= 0) {
        return {
          ok: false,
          message: messages[locale].product.stockOut
        };
      }

      const nextItem: CartItem = {
        productId,
        title,
        image: payload.image,
        unitPrice,
        stock: normalizedStock,
        quantity: finalQuantity,
        sku: sku ?? existing?.sku ?? null,
        currency
      };

      const nextItems = existing
        ? cartItems.map((item) => (item.productId === productId ? nextItem : item))
        : [...cartItems, nextItem];
      persistCartItems(nextItems);

      if (normalizedStock !== null && finalQuantity < targetQuantity) {
        return {
          ok: true,
          message: messages[locale].product.maxStockReached
        };
      }

      return {
        ok: true,
        message: messages[locale].product.addedToCart
      };
    },
    [cartItems, locale, persistCartItems]
  );

  const setItemQuantity = useCallback(
    (productId: string, quantity: number): CartActionResult => {
      const normalizedId = productId.trim();
      const nextQuantity = sanitizeNonNegativeInt(quantity);
      if (!isValidProductId(normalizedId) || nextQuantity === null || nextQuantity <= 0) {
        return {
          ok: false,
          message: messages[locale].product.invalidQuantity
        };
      }

      const current = cartItems.find((item) => item.productId === normalizedId);
      if (!current) {
        return {
          ok: false,
          message: messages[locale].product.notFound
        };
      }

      const finalQuantity = current.stock !== null ? Math.min(nextQuantity, current.stock) : nextQuantity;
      if (current.stock !== null && current.stock <= 0) {
        return {
          ok: false,
          message: messages[locale].product.stockOut
        };
      }

      const nextItems = cartItems.map((item) =>
        item.productId === normalizedId
          ? {
              ...item,
              quantity: finalQuantity
            }
          : item
      );

      persistCartItems(nextItems);

      if (current.stock !== null && finalQuantity < nextQuantity) {
        return {
          ok: true,
          message: messages[locale].product.maxStockReached
        };
      }

      return { ok: true };
    },
    [cartItems, locale, persistCartItems]
  );

  const removeFromCart = useCallback(
    (productId: string) => {
      const normalizedId = productId.trim();
      if (!isValidProductId(normalizedId)) {
        return;
      }

      const nextItems = cartItems.filter((item) => item.productId !== normalizedId);
      persistCartItems(nextItems);
    },
    [cartItems, persistCartItems]
  );

  const clearCart = useCallback(() => {
    persistCartItems([]);
  }, [persistCartItems]);

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
      accessToken: session?.accessToken ?? null,
      login,
      register,
      logout,
      updateProfile
    }),
    [login, logout, ready, register, session?.accessToken, updateProfile, user]
  );

  const cartValue = useMemo(
    () => ({
      ready: cartReady,
      items: cartItems,
      cartCount,
      cartTotal,
      addToCart,
      setItemQuantity,
      removeFromCart,
      clearCart
    }),
    [
      addToCart,
      cartCount,
      cartItems,
      cartReady,
      cartTotal,
      clearCart,
      removeFromCart,
      setItemQuantity
    ]
  );

  return (
    <LanguageContext.Provider value={languageValue}>
      <AuthContext.Provider value={authValue}>
        <CartContext.Provider value={cartValue}>{children}</CartContext.Provider>
      </AuthContext.Provider>
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

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within AppProvider');
  }

  return context;
}
