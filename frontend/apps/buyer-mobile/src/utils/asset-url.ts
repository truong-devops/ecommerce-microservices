const LOCAL_ASSET_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

export function normalizeRemoteAssetUrl(rawUrl: string | null | undefined, apiBaseUrl?: string): string {
  const value = rawUrl?.trim() ?? '';
  if (!value) {
    return '';
  }

  let assetUrl: URL;
  try {
    assetUrl = new URL(value);
  } catch {
    return value;
  }

  if (!LOCAL_ASSET_HOSTS.has(assetUrl.hostname.toLowerCase()) || !apiBaseUrl?.trim()) {
    return value;
  }

  try {
    const apiUrl = new URL(apiBaseUrl);
    assetUrl.protocol = apiUrl.protocol;
    assetUrl.hostname = apiUrl.hostname;
    assetUrl.port = apiUrl.port;
    return assetUrl.toString();
  } catch {
    return value;
  }
}
