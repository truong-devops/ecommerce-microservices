import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveRuntimeConfig } from './config';

describe('mobile runtime config', () => {
  it('normalizes public production endpoints', () => {
    assert.deepEqual(
      resolveRuntimeConfig({
        EXPO_PUBLIC_API_BASE_URL: 'https://api.dt-commerce.site/api/v1/',
        EXPO_PUBLIC_CHAT_WS_BASE_URL: 'wss://api.dt-commerce.site/api/v1/chat/ws/',
        EXPO_PUBLIC_LIVE_WS_BASE_URL: 'wss://api.dt-commerce.site/api/v1/live/ws/',
        EXPO_PUBLIC_LIVE_HLS_BASE_URL: 'https://live-playback.dt-commerce.site/'
      }),
      {
        apiBaseUrl: 'https://api.dt-commerce.site/api/v1',
        chatWsBaseUrl: 'wss://api.dt-commerce.site/api/v1/chat/ws',
        liveWsBaseUrl: 'wss://api.dt-commerce.site/api/v1/live/ws',
        liveHlsBaseUrl: 'https://live-playback.dt-commerce.site'
      }
    );
  });

  it('rejects an HTTP endpoint used as WebSocket configuration', () => {
    assert.throws(
      () =>
        resolveRuntimeConfig({
          EXPO_PUBLIC_API_BASE_URL: 'https://api.dt-commerce.site/api/v1',
          EXPO_PUBLIC_CHAT_WS_BASE_URL: 'https://api.dt-commerce.site/chat',
          EXPO_PUBLIC_LIVE_WS_BASE_URL: 'wss://api.dt-commerce.site/live',
          EXPO_PUBLIC_LIVE_HLS_BASE_URL: 'https://live-playback.dt-commerce.site'
        }),
      /CHAT_WS_BASE_URL/
    );
  });
});
