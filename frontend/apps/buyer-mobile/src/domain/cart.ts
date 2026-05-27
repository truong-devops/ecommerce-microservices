import type { BuyerProfile, CreateOrderInput, ProductDetail, ProductVariant } from '@frontend/buyer-contracts';

export const CART_STORAGE_VERSION = 1;

export interface CartItem {
  key: string;
  productId: string;
  sellerId: string;
  sku: string;
  title: string;
  image: string;
  price: number;
  currency: string;
  quantity: number;
  selected: boolean;
}

export interface CartState {
  version: typeof CART_STORAGE_VERSION;
  items: CartItem[];
}

export type CartAction =
  | { type: 'hydrate'; state: CartState }
  | { type: 'add'; item: CartItem }
  | { type: 'buy-now'; item: CartItem }
  | { type: 'quantity'; key: string; quantity: number }
  | { type: 'toggle'; key: string }
  | { type: 'toggle-all'; selected: boolean }
  | { type: 'remove'; key: string }
  | { type: 'clear-selected' };

export function emptyCart(): CartState {
  return { version: CART_STORAGE_VERSION, items: [] };
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'hydrate':
      return action.state;
    case 'add': {
      const existing = state.items.find((item) => item.key === action.item.key);
      if (!existing) {
        return { ...state, items: [...state.items, action.item] };
      }
      return {
        ...state,
        items: state.items.map((item) =>
          item.key === action.item.key ? { ...item, quantity: item.quantity + action.item.quantity, selected: true } : item
        )
      };
    }
    case 'buy-now': {
      const exists = state.items.some((item) => item.key === action.item.key);
      const selectedItem = { ...action.item, selected: true };
      return {
        ...state,
        items: exists
          ? state.items.map((item) => (item.key === action.item.key ? selectedItem : { ...item, selected: false }))
          : [...state.items.map((item) => ({ ...item, selected: false })), selectedItem]
      };
    }
    case 'quantity':
      return {
        ...state,
        items: state.items.map((item) =>
          item.key === action.key ? { ...item, quantity: Math.max(1, Math.floor(action.quantity)) } : item
        )
      };
    case 'toggle':
      return { ...state, items: state.items.map((item) => (item.key === action.key ? { ...item, selected: !item.selected } : item)) };
    case 'toggle-all':
      return { ...state, items: state.items.map((item) => ({ ...item, selected: action.selected })) };
    case 'remove':
      return { ...state, items: state.items.filter((item) => item.key !== action.key) };
    case 'clear-selected':
      return { ...state, items: state.items.filter((item) => !item.selected) };
  }
}

export function cartItemFromProduct(product: ProductDetail, variant: ProductVariant, quantity: number): CartItem {
  return {
    key: `${product.id}:${variant.sku}`,
    productId: product.id,
    sellerId: product.sellerId,
    sku: variant.sku,
    title: product.title,
    image: product.image,
    price: variant.price,
    currency: variant.currency,
    quantity: Math.max(1, Math.floor(quantity)),
    selected: true
  };
}

export function selectedCartItems(state: CartState): CartItem[] {
  return state.items.filter((item) => item.selected);
}

export function cartTotals(state: CartState): { count: number; amount: number; currency: string } {
  const selected = selectedCartItems(state);
  return {
    count: selected.reduce((total, item) => total + item.quantity, 0),
    amount: selected.reduce((total, item) => total + item.price * item.quantity, 0),
    currency: selected[0]?.currency ?? 'VND'
  };
}

export function toCreateOrderInput(
  state: CartState,
  note?: string,
  profile?: BuyerProfile,
  paymentMethod: CreateOrderInput['paymentMethod'] = 'COD'
): CreateOrderInput {
  const items = selectedCartItems(state);
  if (items.length === 0) {
    throw new Error('Vui lòng chọn ít nhất một sản phẩm');
  }
  const currency = items[0].currency;
  if (items.some((item) => item.currency !== currency)) {
    throw new Error('Giỏ hàng có nhiều loại tiền tệ');
  }
  const sellerId = items[0].sellerId.trim();
  if (!sellerId || items.some((item) => item.sellerId.trim() !== sellerId)) {
    throw new Error('Mỗi đơn hàng chỉ được chứa sản phẩm của một cửa hàng');
  }
  return {
    sellerId,
    currency,
    note: note?.trim() || undefined,
    paymentMethod,
    recipientName: profile?.name.trim() || undefined,
    recipientPhone: profile?.phone.trim() || undefined,
    recipientAddress: profile?.address.trim() || undefined,
    recipientWard: profile?.addressWard.trim() || undefined,
    recipientProvince: profile?.addressProvince.trim() || undefined,
    items: items.map((item) => ({
      productId: item.productId,
      sku: item.sku,
      productName: item.title,
      quantity: item.quantity,
      unitPrice: item.price
    }))
  };
}

export function serializeCart(state: CartState): string {
  return JSON.stringify(state);
}

export function parseCart(raw: string | null): CartState {
  if (!raw) {
    return emptyCart();
  }
  try {
    const candidate = JSON.parse(raw) as Partial<CartState>;
    if (candidate.version !== CART_STORAGE_VERSION || !Array.isArray(candidate.items)) {
      return emptyCart();
    }
    const items = candidate.items.filter(isCartItem);
    return { version: CART_STORAGE_VERSION, items };
  } catch {
    return emptyCart();
  }
}

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const item = value as Partial<CartItem>;
  return (
    typeof item.key === 'string' &&
    typeof item.productId === 'string' &&
    typeof item.sellerId === 'string' &&
    typeof item.sku === 'string' &&
    typeof item.title === 'string' &&
    typeof item.image === 'string' &&
    typeof item.price === 'number' &&
    Number.isFinite(item.price) &&
    item.price >= 0 &&
    typeof item.currency === 'string' &&
    typeof item.quantity === 'number' &&
    item.quantity >= 1 &&
    typeof item.selected === 'boolean'
  );
}
