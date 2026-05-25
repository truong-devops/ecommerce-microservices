export interface PublicRuntimeConfig {
  apiBaseUrl: string;
  chatWsBaseUrl: string;
  liveWsBaseUrl: string;
  liveHlsBaseUrl: string;
}

export function resolveRuntimeConfig(env: Record<string, string | undefined> = process.env): PublicRuntimeConfig {
  return {
    apiBaseUrl: requiredUrl(env.EXPO_PUBLIC_API_BASE_URL, 'EXPO_PUBLIC_API_BASE_URL', ['http:', 'https:']),
    chatWsBaseUrl: requiredUrl(env.EXPO_PUBLIC_CHAT_WS_BASE_URL, 'EXPO_PUBLIC_CHAT_WS_BASE_URL', ['ws:', 'wss:']),
    liveWsBaseUrl: requiredUrl(env.EXPO_PUBLIC_LIVE_WS_BASE_URL, 'EXPO_PUBLIC_LIVE_WS_BASE_URL', ['ws:', 'wss:']),
    liveHlsBaseUrl: requiredUrl(env.EXPO_PUBLIC_LIVE_HLS_BASE_URL, 'EXPO_PUBLIC_LIVE_HLS_BASE_URL', ['http:', 'https:'])
  };
}

function requiredUrl(value: string | undefined, key: string, protocols: string[]): string {
  const trimmed = value?.trim().replace(/\/$/, '') ?? '';
  if (!trimmed) {
    throw new Error(`Thiếu ${key} trong .env`);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${key} không phải URL hợp lệ`);
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`${key} sử dụng protocol không hợp lệ`);
  }

  return trimmed;
}
