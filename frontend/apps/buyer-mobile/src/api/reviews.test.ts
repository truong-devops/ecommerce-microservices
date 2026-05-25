import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Order } from '@frontend/buyer-contracts';

import { assertReviewEligibility } from './reviews';

const deliveredOrder: Order = {
  id: 'order-1',
  orderNumber: 'ORD-1',
  userId: 'buyer-1',
  status: 'DELIVERED',
  currency: 'USD',
  subtotalAmount: 1,
  shippingAmount: 0,
  discountAmount: 0,
  totalAmount: 1,
  note: null,
  createdAt: 'now',
  updatedAt: 'now',
  items: [{ id: 'item-1', productId: 'product-1', sku: 'sku', productName: 'A', quantity: 1, unitPrice: 1, totalPrice: 1 }]
};

describe('review eligibility', () => {
  it('allows delivered order items', () => {
    assert.doesNotThrow(() => assertReviewEligibility(deliveredOrder, 'product-1'));
  });

  it('rejects undelivered orders and unrelated products', () => {
    assert.throws(() => assertReviewEligibility({ ...deliveredOrder, status: 'SHIPPED' }, 'product-1'), /đánh giá/);
    assert.throws(() => assertReviewEligibility(deliveredOrder, 'product-2'), /không nằm/);
  });
});
