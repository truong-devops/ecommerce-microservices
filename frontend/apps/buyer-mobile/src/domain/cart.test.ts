import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cartReducer, cartTotals, emptyCart, parseCart, serializeCart, toCreateOrderInputs, type CartItem } from './cart';

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

  it('only includes selected items in checkout inputs', () => {
    const state = {
      version: 1 as const,
      items: [phone, { ...phone, key: 'product-2:sku-2', productId: 'product-2', selected: false }]
    };
    assert.deepEqual(toCreateOrderInputs(state, ' Giao giờ hành chính '), [{
      sellerId: 'seller-1',
      currency: 'USD',
      paymentMethod: 'COD',
      note: 'Giao giờ hành chính',
      items: [{ productId: 'product-1', sku: 'sku-1', productName: 'Phone', quantity: 1, unitPrice: 120 }]
    }]);
  });

  it('keeps the selected payment method in checkout input', () => {
    const state = {
      version: 1 as const,
      items: [phone]
    };

    assert.equal(toCreateOrderInputs(state, undefined, undefined, 'ONLINE')[0].paymentMethod, 'ONLINE');
  });

  it('attaches quoted shipping amount by seller to checkout input', () => {
    const state = {
      version: 1 as const,
      items: [phone]
    };

    assert.equal(toCreateOrderInputs(state, undefined, undefined, 'COD', { 'seller-1': 10000 })[0].shippingAmount, 10000);
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
    assert.deepEqual(toCreateOrderInputs(next)[0].items, [{ productId: 'product-1', sku: 'sku-1', productName: 'Phone', quantity: 1, unitPrice: 120 }]);
  });

  it('creates one order per selected SKU from the same seller', () => {
    const state = {
      version: 1 as const,
      items: [phone, { ...phone, key: 'product-2:sku-2', productId: 'product-2', sku: 'sku-2', selected: true }]
    };

    const orders = toCreateOrderInputs(state);
    assert.equal(orders.length, 2);
    assert.deepEqual(orders.map((order) => order.items[0].sku), ['sku-1', 'sku-2']);
  });

  it('creates separate orders for selected SKUs from different sellers', () => {
    const state = {
      version: 1 as const,
      items: [phone, { ...phone, key: 'product-2:sku-2', productId: 'product-2', sku: 'sku-2', sellerId: 'seller-2', selected: true }]
    };

    assert.deepEqual(toCreateOrderInputs(state).map((order) => order.sellerId), ['seller-1', 'seller-2']);
  });

  it('restores only valid versioned persisted items', () => {
    const state = cartReducer(emptyCart(), { type: 'add', item: phone });
    assert.deepEqual(parseCart(serializeCart(state)), state);
    assert.deepEqual(parseCart('{"version":2,"items":[]}'), emptyCart());
    assert.deepEqual(parseCart('broken'), emptyCart());
  });
});
