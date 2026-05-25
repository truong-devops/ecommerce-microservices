import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { chatWebSocketUrl, mergeChatMessages, normalizeChatText, normalizeConversations, normalizeMessages, reconnectDelay } from './chat';

describe('chat realtime domain', () => {
  it('deduplicates an optimistic message when the saved message returns', () => {
    const pending = {
      id: '',
      conversationId: 'c-1',
      seq: 4,
      clientMessageId: 'client-1',
      senderId: 'buyer',
      senderRole: 'CUSTOMER',
      text: 'hello',
      sentAt: '2026-01-01T00:00:00Z'
    };
    const saved = { ...pending, id: 'message-1' };
    assert.deepEqual(mergeChatMessages([pending], [saved]), [saved]);
  });

  it('caps reconnect backoff and creates a conversation-scoped socket URL', () => {
    assert.equal(reconnectDelay(10), 30_000);
    assert.equal(chatWebSocketUrl('wss://api.example/api/v1/chat/ws', 'conversation 1'), 'wss://api.example/api/v1/chat/ws?conversationId=conversation+1');
  });

  it('validates outgoing text using server limits', () => {
    assert.equal(normalizeChatText(' hello '), 'hello');
    assert.throws(() => normalizeChatText('  '), /Tin nhắn/);
  });

  it('normalizes production conversation list shapes without crashing on missing optional fields', () => {
    assert.deepEqual(normalizeConversations(undefined), []);

    const items = normalizeConversations([
      {
        id: 'c-1',
        sellerId: 'seller-1',
        updatedAt: '2026-05-25T01:00:00Z',
        lastMessage: { textPreview: 'hello' }
      },
      {
        id: 'c-old',
        sellerId: 'seller-1',
        updatedAt: '2026-05-24T01:00:00Z'
      }
    ]);

    assert.equal(items.length, 1);
    assert.equal(items[0].unread.buyer, 0);
    assert.equal(items[0].context.sellerName, null);
    assert.equal(items[0].lastMessage?.textPreview, 'hello');
  });

  it('normalizes message payloads returned either as arrays or item envelopes', () => {
    assert.deepEqual(normalizeMessages({ items: undefined }), []);
    assert.deepEqual(
      normalizeMessages({
        items: [
          { id: 'm-2', conversationId: 'c-1', seq: 2, senderId: 'seller', senderRole: 'SELLER', text: 'two', sentAt: '2026-01-02T00:00:00Z' },
          { id: 'm-1', conversationId: 'c-1', seq: 1, senderId: 'buyer', senderRole: 'CUSTOMER', text: 'one', sentAt: '2026-01-01T00:00:00Z' }
        ]
      }).map((item) => item.id),
      ['m-1', 'm-2']
    );
  });
});
