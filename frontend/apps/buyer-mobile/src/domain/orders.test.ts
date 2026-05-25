import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buyerOrderListStatusLabel, buyerOrderStatusLabel } from './orders';

describe('buyer order status labels', () => {
  it('keeps COD-like failed orders as waiting for confirmation when there is no payment record', () => {
    assert.equal(buyerOrderStatusLabel('FAILED', null), 'Chờ xác nhận');
    assert.equal(buyerOrderStatusLabel('FAILED', undefined), 'Chờ xác nhận');
    assert.equal(buyerOrderListStatusLabel('FAILED'), 'Chờ xác nhận');
  });

  it('still shows real payment failures as failed orders', () => {
    assert.equal(buyerOrderStatusLabel('FAILED', 'FAILED'), 'Đặt hàng thất bại');
  });

  it('maps normal buyer order statuses', () => {
    assert.equal(buyerOrderStatusLabel('PENDING'), 'Chờ xác nhận');
    assert.equal(buyerOrderStatusLabel('DELIVERED'), 'Hoàn thành');
  });
});
