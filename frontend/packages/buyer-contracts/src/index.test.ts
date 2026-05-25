import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildProductSearchQuery, unwrapApiEnvelope } from './index';

describe('buyer contract envelope', () => {
  it('unwraps a successful response', () => {
    assert.deepEqual(unwrapApiEnvelope<{ id: string }>({ success: true, data: { id: 'p-1' } }), { id: 'p-1' });
  });

  it('surfaces an upstream API failure message', () => {
    assert.throws(
      () => unwrapApiEnvelope({ success: false, error: { code: 'NOT_FOUND', message: 'Missing product' } }),
      /Missing product/
    );
  });
});

describe('buyer product query contract', () => {
  it('caps page size and trims supported filters', () => {
    assert.equal(
      buildProductSearchQuery({ page: 2, pageSize: 500, search: '  phone  ', categoryId: ' electronics ' }),
      'page=2&pageSize=100&search=phone&categoryId=electronics'
    );
  });

  it('omits invalid numeric filters', () => {
    assert.equal(buildProductSearchQuery({ page: -1, pageSize: 0 }), '');
  });

  it('serializes supported shop and sort filters', () => {
    assert.equal(
      buildProductSearchQuery({ sellerId: ' seller-1 ', brand: ' DT ', sortBy: 'minPrice', sortOrder: 'ASC' }),
      'brand=DT&sellerId=seller-1&sortBy=minPrice&sortOrder=ASC'
    );
  });
});
