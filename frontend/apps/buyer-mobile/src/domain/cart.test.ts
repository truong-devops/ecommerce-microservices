import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cartReducer, cartTotals, emptyCart, parseCart, serializeCart, toCreateOrderInput, type CartItem } from './cart';

const phone: CartItem = {
  key: 'product-1:sku-1',
  productId: 'product-1',
  sellerId: 'seller-1',
  sku: 'sku-1',
  title: 'Phone',
  image: 'https://cdn/item.jpg',
  price: 120,
  currency: 'USD',
  quantity: 1,
  selected: true
};

describe('cart domain', () => {
  it('merges the same SKU and calculates selected totals', () => {
    const once = cartReducer(emptyCart(), { type: 'add', item: phone });
    const twice = cartReducer(once, { type: 'add', item: { ...phone, quantity: 2 } });
    assert.equal(twice.items[0].quantity, 3);
    assert.deepEqual(cartTotals(twice), { count: 3, amount: 360, currency: 'USD' });
  });

  it('only includes selected items in checkout input', () => {
    const state = {
      version: 1 as const,
      items: [phone, { ...phone, key: 'product-2:sku-2', productId: 'product-2', selected: false }]
    };
    assert.deepEqual(toCreateOrderInput(state, ' Giao giờ hành chính '), {
      sellerId: 'seller-1',
      currency: 'USD',
      paymentMethod: 'COD',
      note: 'Giao giờ hành chính',
      items: [{ productId: 'product-1', sku: 'sku-1', productName: 'Phone', quantity: 1, unitPrice: 120 }]
    });
  });

  it('keeps the selected payment method in checkout input', () => {
    const state = {
      version: 1 as const,
      items: [phone]
    };

    assert.equal(toCreateOrderInput(state, undefined, undefined, 'ONLINE').paymentMethod, 'ONLINE');
  });

  it('selects only the buy-now item for checkout without changing unrelated cart items', () => {
    const state = {
      version: 1 as const,
      items: [phone, { ...phone, key: 'product-2:sku-2', productId: 'product-2', quantity: 4, selected: true }]
    };
    const next = cartReducer(state, { type: 'buy-now', item: { ...phone, quantity: 1 } });

    assert.deepEqual(
      next.items.map((item) => ({ key: item.key, quantity: item.quantity, selected: item.selected })),
      [
        { key: 'product-1:sku-1', quantity: 1, selected: true },
        { key: 'product-2:sku-2', quantity: 4, selected: false }
      ]
    );
    assert.deepEqual(toCreateOrderInput(next).items, [{ productId: 'product-1', sku: 'sku-1', productName: 'Phone', quantity: 1, unitPrice: 120 }]);
  });

  it('rejects checkout with selected items from multiple sellers', () => {
    const state = {
      version: 1 as const,
      items: [phone, { ...phone, key: 'product-2:sku-2', productId: 'product-2', sellerId: 'seller-2', selected: true }]
    };

    assert.throws(() => toCreateOrderInput(state), /một cửa hàng/);
  });

  it('restores only valid versioned persisted items', () => {
    const state = cartReducer(emptyCart(), { type: 'add', item: phone });
    assert.deepEqual(parseCart(serializeCart(state)), state);
    assert.deepEqual(parseCart('{"version":2,"items":[]}'), emptyCart());
    assert.deepEqual(parseCart('broken'), emptyCart());
  });
});
