/**
 * Universal media URL resolver for moderator app.
 * Resolves local/docker addresses (127.0.0.1:12030, minio:9000, localhost:12030, etc.)
 * and relative paths to the public CDN/media base URL (https://media.truongam.tech/ecommerce-media).
 */

const FALLBACK_PUBLIC_MEDIA_URL = 'https://media.truongam.tech/ecommerce-media';

export function resolveMediaUrl(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  const publicBase = (
    process.env.NEXT_PUBLIC_MEDIA_PUBLIC_BASE_URL ??
    (typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? FALLBACK_PUBLIC_MEDIA_URL
      : 'http://127.0.0.1:12030/ecommerce-media')
  ).replace(/\/$/, '');

  // If it's a relative path (e.g. "products/videos/..." or "/ecommerce-media/products/...")
  if (!/^https?:\/\//i.test(trimmed)) {
    const cleanPath = trimmed.replace(/^\/?(ecommerce-media\/)?/, '');
    return `${publicBase}/${cleanPath}`;
  }

  // If it points to internal Docker or localhost development hosts
  const localPrefixes = [
    'http://localhost:3003/',
    'http://127.0.0.1:3003/',
    'http://localhost:12030/',
    'http://127.0.0.1:12030/',
    'http://localhost:9000/',
    'http://127.0.0.1:9000/',
    'http://minio:9000/',
    'http://rustfs:9000/'
  ];

  for (const prefix of localPrefixes) {
    if (trimmed.startsWith(prefix)) {
      const relativePath = trimmed.slice(prefix.length).replace(/^ecommerce-media\//, '');
      return `${publicBase}/${relativePath}`;
    }
  }

  // Prevent mixed-content blocking on HTTPS
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && trimmed.startsWith('http://media.truongam.tech')) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }

  return trimmed;
}
