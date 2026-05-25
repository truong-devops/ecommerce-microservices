import type { LiveMessage, LiveSession } from '@frontend/buyer-contracts';

import { normalizeMediaUrl, selectLivePlaybackSource, type PlaybackSource } from './media-playback';

export type LivePlaybackCapability = 'playable' | 'native-webrtc-required' | 'unavailable';

export function normalizeLiveMessage(text: string): string {
  const normalized = text.trim();
  if (normalized.length < 1 || normalized.length > 1000) {
    throw new Error('Tin nhắn live phải có từ 1 đến 1000 ký tự');
  }
  return normalized;
}

export function resolveLivePlayback(session: LiveSession, apiBaseUrl?: string): {
  capability: LivePlaybackCapability;
  source: PlaybackSource;
  protocol: string;
};
export function resolveLivePlayback(session: LiveSession, apiBaseUrl: string | undefined, hlsBaseUrl: string | undefined): {
  capability: LivePlaybackCapability;
  source: PlaybackSource;
  protocol: string;
};
export function resolveLivePlayback(session: LiveSession, apiBaseUrl?: string, hlsBaseUrl?: string): {
  capability: LivePlaybackCapability;
  source: PlaybackSource;
  protocol: string;
} {
  const protocol = session.media?.playback.protocol ?? '';
  const playbackUrl = session.media?.playback.url || session.playbackUrl;
  if (protocol === 'WEBRTC' || /\/whep(?:$|[?#])/i.test(playbackUrl)) {
    const whepUrl = normalizeMediaUrl(playbackUrl, apiBaseUrl);
    if (whepUrl) {
      return {
        capability: 'playable',
        protocol: 'WEBRTC',
        source: {
          status: 'playable',
          kind: 'webrtc',
          url: whepUrl,
          thumbnailUrl: normalizeMediaUrl(session.thumbnailUrl, apiBaseUrl) || null
        }
      };
    }
    const hlsUrl = mediaMtxHlsUrl(playbackUrl, hlsBaseUrl);
    if (hlsUrl) {
      return {
        capability: 'playable',
        protocol: 'HLS',
        source: selectLivePlaybackSource({ hlsUrl, thumbnailUrl: session.thumbnailUrl }, apiBaseUrl)
      };
    }
    return {
      capability: 'native-webrtc-required',
      protocol: 'WEBRTC',
      source: selectLivePlaybackSource({ fallbackUrl: playbackUrl, thumbnailUrl: session.thumbnailUrl }, apiBaseUrl)
    };
  }
  const source = selectLivePlaybackSource(
    { hlsUrl: protocol === 'HLS' || protocol === 'LL_HLS' ? playbackUrl : undefined, fallbackUrl: playbackUrl, thumbnailUrl: session.thumbnailUrl },
    apiBaseUrl
  );
  return { capability: source.status === 'playable' ? 'playable' : 'unavailable', protocol: protocol || source.kind || 'unknown', source };
}

export function mediaMtxHlsUrl(whepUrl: string, hlsBaseUrl?: string): string | null {
  if (!hlsBaseUrl?.trim()) {
    return null;
  }

  try {
    const whep = new URL(whepUrl);
    const pathMatch = whep.pathname.match(/\/([^/]+)\/whep\/?$/i);
    if (!pathMatch) {
      return null;
    }

    const hls = new URL(hlsBaseUrl);
    hls.pathname = `${hls.pathname.replace(/\/$/, '')}/${pathMatch[1]}/index.m3u8`;
    hls.search = '';
    hls.hash = '';
    return hls.toString();
  } catch {
    return null;
  }
}

export function mergeLiveMessages(current: LiveMessage[], incoming: LiveMessage): LiveMessage[] {
  const remaining = current.filter(
    (message) =>
      message.messageId !== incoming.messageId &&
      (!incoming.clientMessageId || message.clientMessageId !== incoming.clientMessageId)
  );
  return [...remaining, incoming].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

export function liveSocketUrl(baseUrl: string, sessionId: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('sessionId', sessionId);
  return url.toString();
}

export function liveReconnectDelay(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, Math.min(attempt, 5)));
}
