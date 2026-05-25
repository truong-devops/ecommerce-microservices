const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ?? '';

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    message?: string;
  };
}

export interface ProductPreview {
  id: string;
  name: string;
  images: string[];
  minPrice: number;
}

export interface VideoPreview {
  videoId: string;
  title: string;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  seller?: {
    shopName: string;
  };
}

export interface LiveSessionPreview {
  sessionId: string;
  title: string;
  status: string;
  playbackUrl?: string | null;
  thumbnailUrl?: string | null;
  media?: {
    playback?: {
      protocol: string;
      url: string;
    };
  };
}

export interface ProductionPreview {
  products: ProductPreview[];
  videos: VideoPreview[];
  liveSessions: LiveSessionPreview[];
}

export function productionApiBaseUrl(): string {
  return API_BASE_URL;
}

export async function fetchProductionPreview(): Promise<ProductionPreview> {
  const [products, videos, liveSessions] = await Promise.all([
    requestApi<ProductPreview[]>('/products?page=1&pageSize=4'),
    requestApi<VideoPreview[]>('/videos/feed?page=1&pageSize=3'),
    requestApi<LiveSessionPreview[]>('/live/sessions?page=1&pageSize=3&status=LIVE')
  ]);

  return { products, videos, liveSessions };
}

async function requestApi<T>(path: string): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error('Thiếu EXPO_PUBLIC_API_BASE_URL trong .env');
  }

  const response = await fetch(`${API_BASE_URL}${path}`);
  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || payload.success !== true || payload.data === undefined) {
    throw new Error(payload.error?.message ?? `API request failed: ${response.status}`);
  }

  return payload.data;
}
