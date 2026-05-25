import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeMediaUrl, selectLivePlaybackSource, selectVideoPlaybackSource } from './media-playback';

const apiBaseUrl = 'http://10.189.0.174:12000/api/v1';

describe('media playback source selection', () => {
  it('rewrites localhost media urls to the API host for physical devices', () => {
    assert.equal(normalizeMediaUrl('http://localhost:12000/uploads/video.mp4', apiBaseUrl), 'http://10.189.0.174:12000/uploads/video.mp4');
    assert.equal(normalizeMediaUrl('http://127.0.0.1:12000/uploads/live.m3u8', apiBaseUrl), 'http://10.189.0.174:12000/uploads/live.m3u8');
    assert.equal(
      normalizeMediaUrl('http://localhost:12030/ecommerce-media/products/product/image.webp', 'https://api.dt-commerce.site/api/v1'),
      'https://api.dt-commerce.site/ecommerce-media/products/product/image.webp'
    );
  });

  it('keeps public http urls unchanged and rejects non-http urls', () => {
    assert.equal(normalizeMediaUrl('https://cdn.example/video.mp4', apiBaseUrl), 'https://cdn.example/video.mp4');
    assert.equal(normalizeMediaUrl('file:///tmp/video.mp4', apiBaseUrl), '');
  });

  it('selects HLS before MP4 for video playback', () => {
    const source = selectVideoPlaybackSource(
      {
        hlsUrl: 'https://cdn.example/video.m3u8',
        mediaUrl: 'https://cdn.example/video.mp4',
        thumbnailUrl: 'https://cdn.example/poster.jpg'
      },
      apiBaseUrl
    );

    assert.equal(source.status, 'playable');
    assert.equal(source.kind, 'hls');
    assert.equal(source.url, 'https://cdn.example/video.m3u8');
    assert.equal(source.thumbnailUrl, 'https://cdn.example/poster.jpg');
  });

  it('falls back to video media url before thumbnail-only', () => {
    assert.deepEqual(selectVideoPlaybackSource({ mediaUrl: 'https://cdn.example/video.mp4' }, apiBaseUrl), {
      status: 'playable',
      kind: 'mp4',
      url: 'https://cdn.example/video.mp4',
      thumbnailUrl: null
    });

    assert.deepEqual(selectVideoPlaybackSource({ thumbnailUrl: 'https://cdn.example/poster.jpg' }, apiBaseUrl), {
      status: 'thumbnail-only',
      kind: 'thumbnail',
      url: null,
      thumbnailUrl: 'https://cdn.example/poster.jpg'
    });
  });

  it('selects HLS before fallback url for live playback', () => {
    const source = selectLivePlaybackSource(
      {
        hlsUrl: 'https://cdn.example/live.m3u8',
        fallbackUrl: 'https://cdn.example/live.mp4',
        thumbnailUrl: 'https://cdn.example/live.jpg'
      },
      apiBaseUrl
    );

    assert.equal(source.status, 'playable');
    assert.equal(source.kind, 'hls');
    assert.equal(source.url, 'https://cdn.example/live.m3u8');
    assert.equal(source.thumbnailUrl, 'https://cdn.example/live.jpg');
  });

  it('does not treat WHEP or WHIP live endpoints as Expo-video playable', () => {
    assert.equal(selectLivePlaybackSource({ fallbackUrl: 'http://localhost:12089/live-demo/whep' }, apiBaseUrl).status, 'invalid');
    assert.equal(selectLivePlaybackSource({ fallbackUrl: 'http://localhost:12089/live-demo/whip' }, apiBaseUrl).status, 'invalid');
  });

  it('returns missing or invalid status when no playable source exists', () => {
    assert.equal(selectLivePlaybackSource({}, apiBaseUrl).status, 'missing');
    assert.equal(selectVideoPlaybackSource({ mediaUrl: 'file:///tmp/video.mp4' }, apiBaseUrl).status, 'invalid');
  });
});
