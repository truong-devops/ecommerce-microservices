import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';

const platformDefaultApiBaseUrl = Platform.select({
  android: 'http://10.0.2.2:8080',
  default: 'http://127.0.0.1:8080'
});

function resolveWebRuntimeBaseUrl(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  const hostname = window.location.hostname;
  if (!hostname) {
    return null;
  }

  return `http://${hostname}:8080`;
}

function resolveNativeDevHostBaseUrl(): string | null {
  if (Platform.OS === 'web') {
    return null;
  }

  const sourceCode = (NativeModules as { SourceCode?: { scriptURL?: string } }).SourceCode;
  const scriptUrl = sourceCode?.scriptURL;
  if (!scriptUrl) {
    return null;
  }

  const matched = scriptUrl.match(/^[a-zA-Z]+:\/\/([^/:?#]+)(?::\d+)?/);
  const host = matched?.[1];
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return null;
  }

  return `http://${host}:8080`;
}

function extractHostFromUri(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const matched = value.match(/^[a-zA-Z]+:\/\/([^/:?#]+)(?::\d+)?/);
  if (matched?.[1]) {
    return matched[1];
  }

  const hostPortMatch = value.match(/^([^/:?#]+):\d+/);
  if (hostPortMatch?.[1]) {
    return hostPortMatch[1];
  }

  return null;
}

function resolveExpoConstantsHostBaseUrl(): string | null {
  if (Platform.OS === 'web') {
    return null;
  }

  const manifest = Constants.manifest as { debuggerHost?: string } | null;
  const manifest2 = Constants.manifest2 as { extra?: { expoGo?: { debuggerHost?: string } } } | null;
  const expoConfig = Constants.expoConfig as { hostUri?: string } | null;

  const hostCandidates = [
    extractHostFromUri(expoConfig?.hostUri),
    extractHostFromUri(manifest?.debuggerHost),
    extractHostFromUri(manifest2?.extra?.expoGo?.debuggerHost)
  ].filter((value): value is string => Boolean(value));

  const host = hostCandidates.find((value) => value !== 'localhost' && value !== '127.0.0.1');
  if (!host) {
    return null;
  }

  return `http://${host}:8080`;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/$/, '');
}

function withAlias(value: string): string[] {
  const normalized = normalizeBaseUrl(value);
  const alias = buildAliasBaseUrl(normalized);
  return Array.from(new Set([normalized, alias].filter((item): item is string => Boolean(item))));
}

function buildAliasBaseUrl(value: string): string | null {
  if (value.includes('localhost')) {
    return value.replace('localhost', '127.0.0.1');
  }

  if (value.includes('127.0.0.1')) {
    return value.replace('127.0.0.1', 'localhost');
  }

  return null;
}

const configuredBaseUrl = normalizeBaseUrl(
  process.env.EXPO_PUBLIC_API_BASE_URL ??
    resolveWebRuntimeBaseUrl() ??
    resolveNativeDevHostBaseUrl() ??
    resolveExpoConstantsHostBaseUrl() ??
    platformDefaultApiBaseUrl ??
    'http://127.0.0.1:8080'
);

export const apiBaseUrl = configuredBaseUrl;
export const apiResolverVersion = '2026-03-23.1';
export const apiBaseUrlCandidates = Array.from(
  new Set([...withAlias(configuredBaseUrl), ...withAlias('http://host.docker.internal:8080')])
);

function buildServiceDirectCandidates(port: number): string[] {
  if (Platform.OS === 'web') {
    return [];
  }

  const nativeHostBaseUrl = resolveNativeDevHostBaseUrl();
  const nativeHostPortUrl = nativeHostBaseUrl ? nativeHostBaseUrl.replace(/:8080$/, `:${port}`) : null;
  const platformUrl = Platform.select({
    android: `http://10.0.2.2:${port}`,
    default: `http://127.0.0.1:${port}`
  });

  const candidates: string[] = [];
  if (platformUrl) {
    candidates.push(...withAlias(platformUrl));
  }
  if (nativeHostPortUrl) {
    candidates.push(...withAlias(nativeHostPortUrl));
  }

  return Array.from(new Set(candidates));
}

function mergeCandidates(...candidateGroups: string[][]): string[] {
  return Array.from(new Set(candidateGroups.flatMap((group) => group)));
}

export const authApiBaseUrlCandidates = mergeCandidates(apiBaseUrlCandidates, buildServiceDirectCandidates(3001));
export const orderApiBaseUrlCandidates = mergeCandidates(apiBaseUrlCandidates, buildServiceDirectCandidates(3002));
export const productApiBaseUrlCandidates = mergeCandidates(apiBaseUrlCandidates, buildServiceDirectCandidates(3003));
export const cartApiBaseUrlCandidates = mergeCandidates(apiBaseUrlCandidates, buildServiceDirectCandidates(3004));
