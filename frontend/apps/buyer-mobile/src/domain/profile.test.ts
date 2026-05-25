import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeProfile, validateProfileInput } from './profile';

describe('profile domain', () => {
  it('normalizes nullable upstream fields for forms', () => {
    assert.equal(
      normalizeProfile({
        id: 'u-1',
        email: 'buyer@example.com',
        firstName: 'Nguyen',
        lastName: 'An',
        phone: null,
        address: null,
        gender: null,
        createdAt: 'now',
        updatedAt: 'now'
      }).name,
      'Nguyen An'
    );
  });

  it('splits and validates an update payload', () => {
    assert.deepEqual(
      validateProfileInput({ name: ' Nguyen Van An ', phone: '+84901234567', address: ' HCM ', gender: 'male' }),
      {
        firstName: 'Nguyen',
        lastName: 'Van An',
        phone: '+84901234567',
        address: 'HCM',
        gender: 'male',
        dateOfBirth: null,
        avatarUrl: null
      }
    );
  });

  it('rejects local checkout-invalid phone values', () => {
    assert.throws(() => validateProfileInput({ name: 'An', phone: '0901', address: 'HCM' }), /điện thoại/);
  });
});
