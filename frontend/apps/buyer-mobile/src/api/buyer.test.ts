import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildHomeSections, toProductSearchItem } from './buyer';

const product = {
  id: 'product-1',
  sellerId: 'seller-1',
  sellerCode: 'SEL-1',
  name: 'iPhone 17',
  slug: 'iphone-17',
  description: 'Phone',
  categoryId: 'dien-thoai-phu-kien',
  brand: 'Apple',
  status: 'ACTIVE',
  images: ['https://cdn.test/iphone.webp'],
  minPrice: 17999000,
  variants: [
    {
      sku: 'IPHONE-17',
      name: 'Bản Tiêu Chuẩn',
      price: 17999000,
      currency: 'VND',
      compareAtPrice: 21999000,
      isDefault: true
    }
  ]
};

describe('buyer production product adapter', () => {
  it('maps the raw product endpoint payload to a mobile product card', () => {
    assert.deepEqual(toProductSearchItem(product), {
      id: 'product-1',
      title: 'iPhone 17',
      slug: 'iphone-17',
      categoryId: 'dien-thoai-phu-kien',
      brand: 'Apple',
      image: 'https://cdn.test/iphone.webp',
      price: 17999000,
      currency: 'VND',
      compareAtPrice: 21999000,
      discountPercent: 18
    });
  });

  it('creates tappable home sections using real product ids', () => {
    const home = buildHomeSections([product]);

    assert.equal(home.flashSaleItems[0].id, product.id);
    assert.equal(home.recommendationProducts[0].id, product.id);
    assert.equal(home.categories[0].id, product.categoryId);
    assert.equal(home.categories[0].label, 'Điện Thoại Phụ Kiện');
  });
});
