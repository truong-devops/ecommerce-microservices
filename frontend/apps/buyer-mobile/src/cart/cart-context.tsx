import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useReducer, useState } from 'react';

import { cartReducer, cartTotals, emptyCart, parseCart, serializeCart, type CartAction, type CartState } from '@/domain/cart';

const CART_STORAGE_KEY = 'buyer.cart.v1';

interface CartContextValue {
  isReady: boolean;
  state: CartState;
  totals: ReturnType<typeof cartTotals>;
  dispatch(action: CartAction): void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(cartReducer, undefined, emptyCart);
  const [isReady, setReady] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(CART_STORAGE_KEY)
      .then((raw) => dispatch({ type: 'hydrate', state: parseCart(raw) }))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (isReady) {
      void AsyncStorage.setItem(CART_STORAGE_KEY, serializeCart(state));
    }
  }, [isReady, state]);

  const value = useMemo(() => ({ isReady, state, totals: cartTotals(state), dispatch }), [isReady, state]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used inside CartProvider');
  }
  return context;
}
