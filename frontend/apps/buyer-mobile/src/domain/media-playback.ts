import { normalizeRemoteAssetUrl } from '../utils/asset-url';

export type PlaybackSourceStatus = 'playable' | 'thumbnail-only' | 'missing' | 'invalid';
export type PlaybackSourceKind = 'hls' | 'mp4' | 'fallback' | 'thumbnail';

export interface PlaybackSource {
  status: PlaybackSourceStatus;
  kind: PlaybackSourceKind | null;
  url: string | null;
  thumbnailUrl: string | null;
}

export interface VideoPlaybackInput {
  hlsUrl?: string | null;
  mediaUrl?: string | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
}

export interface LivePlaybackInput {
  hlsUrl?: string | null;
  fallbackUrl?: string | null;
  thumbnailUrl?: string | null;
}

export function normalizeMediaUrl(rawUrl: string | null | undefined, apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL): string {
  const normalized = normalizeRemoteAssetUrl(rawUrl, apiBaseUrl).trim();
  if (!normalized) {
    return '';
  }

  return isHttpUrl(normalized) ? normalized : '';
}

export function selectVideoPlaybackSource(input: VideoPlaybackInput, apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL): PlaybackSource {
  const thumbnailUrl = normalizeMediaUrl(input.thumbnailUrl, apiBaseUrl) || null;
  const hlsUrl = normalizeMediaUrl(input.hlsUrl, apiBaseUrl);
  if (hlsUrl) {
    return {
      status: 'playable',
      kind: 'hls',
      url: hlsUrl,
      thumbnailUrl
    };
  }

  const mediaUrl = normalizeMediaUrl(input.mediaUrl ?? input.videoUrl, apiBaseUrl);
  if (mediaUrl) {
    return {
      status: 'playable',
      kind: looksLikeHls(mediaUrl) ? 'hls' : 'mp4',
      url: mediaUrl,
      thumbnailUrl
    };
  }

  if (thumbnailUrl) {
    return {
      status: 'thumbnail-only',
      kind: 'thumbnail',
      url: null,
      thumbnailUrl
    };
  }

  return {
    status: hasAnyRawUrl(input.hlsUrl, input.mediaUrl, input.videoUrl, input.thumbnailUrl) ? 'invalid' : 'missing',
    kind: null,
    url: null,
    thumbnailUrl: null
  };
}

export function selectLivePlaybackSource(input: LivePlaybackInput, apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL): PlaybackSource {
  const thumbnailUrl = normalizeMediaUrl(input.thumbnailUrl, apiBaseUrl) || null;
  const hlsUrl = normalizeMediaUrl(input.hlsUrl, apiBaseUrl);
  if (hlsUrl) {
    return {
      status: 'playable',
      kind: 'hls',
      url: hlsUrl,
      thumbnailUrl
    };
  }

  const fallbackUrl = normalizeMediaUrl(input.fallbackUrl, apiBaseUrl);
  if (fallbackUrl && !looksLikeUnsupportedLiveUrl(fallbackUrl)) {
    return {
      status: 'playable',
      kind: looksLikeHls(fallbackUrl) ? 'hls' : 'fallback',
      url: fallbackUrl,
      thumbnailUrl
    };
  }

  if (thumbnailUrl) {
    return {
      status: 'thumbnail-only',
      kind: 'thumbnail',
      url: null,
      thumbnailUrl
    };
  }

  return {
    status: hasAnyRawUrl(input.hlsUrl, input.fallbackUrl, input.thumbnailUrl) ? 'invalid' : 'missing',
    kind: null,
    url: null,
    thumbnailUrl: null
  };
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function looksLikeHls(value: string): boolean {
  try {
    return new URL(value).pathname.toLowerCase().endsWith('.m3u8');
  } catch {
    return value.toLowerCase().includes('.m3u8');
  }
}

function looksLikeUnsupportedLiveUrl(value: string): boolean {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    return pathname.endsWith('/whep') || pathname.endsWith('/whip');
  } catch {
    const normalized = value.toLowerCase();
    return normalized.endsWith('/whep') || normalized.endsWith('/whip');
  }
}

function hasAnyRawUrl(...values: (string | null | undefined)[]): boolean {
  return values.some((value) => typeof value === 'string' && value.trim().length > 0);
}
