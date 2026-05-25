import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mergeVideoComments, normalizeVideoComment, videoEventId } from './video';

describe('shoppable video domain', () => {
  it('validates comments before submission', () => {
    assert.equal(normalizeVideoComment('  Tot lam  '), 'Tot lam');
    assert.throws(() => normalizeVideoComment('   '), /Bình luận/);
  });

  it('replaces optimistic comments by client id', () => {
    const pending = { commentId: '', videoId: 'v1', userId: 'u1', userRole: 'CUSTOMER', text: 'ok', status: 'VISIBLE' as const, clientCommentId: 'c1', createdAt: 'now', updatedAt: 'now' };
    const saved = { ...pending, commentId: 'saved' };
    assert.deepEqual(mergeVideoComments([pending], saved), [saved]);
  });

  it('creates stable non-PII event keys', () => {
    assert.equal(videoEventId('v1', 'product-clicked', 'p1'), 'buyer-mobile:v1:product-clicked:p1');
  });
});
