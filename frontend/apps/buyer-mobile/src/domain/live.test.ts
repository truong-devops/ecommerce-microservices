import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { LiveSession } from '@frontend/buyer-contracts';

import { liveReconnectDelay, liveSocketUrl, mediaMtxHlsUrl, mergeLiveMessages, normalizeLiveMessage, resolveLivePlayback } from './live';

function session(playback: LiveSession['media']): LiveSession {
  return {
    id: 'l1',
    sessionId: 'l1',
    sellerId: 'seller',
    title: 'Live',
    playbackUrl: playback?.playback.url ?? '',
    media: playback,
    status: 'LIVE',
    metricsSnapshot: { viewerPeak: 0, messageCount: 0, productClickCount: 0, addToCartCount: 0 }
  };
}

describe('live capability domain', () => {
  it('selects HLS sessions as playable on expo-video', () => {
    assert.equal(
      resolveLivePlayback(session({ playback: { protocol: 'HLS', url: 'https://cdn/live/index.m3u8' }, status: 'LIVE' })).capability,
      'playable'
    );
  });

  it('keeps MediaMTX WHEP playback for the mobile WebRTC player', () => {
    const result = resolveLivePlayback(
      session({ playback: { protocol: 'WEBRTC', url: 'https://live-ingest.example/live-session-1/whep' }, status: 'LIVE' }),
      undefined,
      'https://live-playback.example'
    );

    assert.equal(result.capability, 'playable');
    assert.equal(result.protocol, 'WEBRTC');
    assert.equal(result.source.kind, 'webrtc');
    assert.equal(result.source.url, 'https://live-ingest.example/live-session-1/whep');
    assert.equal(mediaMtxHlsUrl('https://live-ingest.example/live-session-1/whep', 'https://live-playback.example/'), 'https://live-playback.example/live-session-1/index.m3u8');
  });

  it('requires native WebRTC only when a WHEP url cannot be loaded', () => {
    assert.equal(resolveLivePlayback(session({ playback: { protocol: 'WEBRTC', url: 'not-a-url/whep' }, status: 'LIVE' })).capability, 'native-webrtc-required');
  });

  it('deduplicates realtime messages and constructs session socket URL', () => {
    const pending = { messageId: '', sessionId: 'l1', senderId: 'u1', senderRole: 'CUSTOMER', text: 'hello', clientMessageId: 'm1', createdAt: '2026-01-01T00:00:00Z' };
    const saved = { ...pending, messageId: 'saved' };
    assert.deepEqual(mergeLiveMessages([pending], saved), [saved]);
    assert.equal(liveSocketUrl('wss://api/live/ws', 'live 1'), 'wss://api/live/ws?sessionId=live+1');
  });

  it('validates live chat text and caps reconnect backoff', () => {
    assert.equal(normalizeLiveMessage('  hello live  '), 'hello live');
    assert.throws(() => normalizeLiveMessage('  '), /Tin nhắn live/);
    assert.equal(liveReconnectDelay(1), 2000);
    assert.equal(liveReconnectDelay(20), 30000);
  });
});
