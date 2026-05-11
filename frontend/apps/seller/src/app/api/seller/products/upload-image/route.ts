import path from 'node:path';
import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { fail, ok } from '@/lib/server/seller-api-response';
import { requestUpstream, serviceBaseUrls } from '@/lib/server/upstream-client';

const PRODUCT_CREATE_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN']);
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const DEFAULT_MEDIA_PUBLIC_BASE_URL = 'http://127.0.0.1:12030/ecommerce-media';

interface PresignUploadResponse {
  objectKey: string;
  method: string;
  uploadUrl: string;
  headers?: Record<string, string>;
}

export async function POST(request: Request) {
  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return fail(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  const claims = decodeAccessToken(accessToken);
  if (!claims) {
    return fail(401, 'UNAUTHORIZED', 'Invalid access token payload');
  }

  if (!PRODUCT_CREATE_ROLES.has(claims.role)) {
    return fail(403, 'FORBIDDEN', 'Role is not allowed to upload product image');
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail(400, 'BAD_REQUEST', 'Invalid form data');
  }

  const file = formData.get('file');
  const folderRaw = String(formData.get('folder') ?? '').trim();

  if (!(file instanceof File)) {
    return fail(400, 'BAD_REQUEST', 'file is required');
  }

  if (file.size <= 0) {
    return fail(400, 'BAD_REQUEST', 'Uploaded file is empty');
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return fail(400, 'BAD_REQUEST', 'Image exceeds max size 8MB');
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return fail(400, 'BAD_REQUEST', 'Unsupported image type. Allowed: jpg, png, webp, gif');
  }

  const safeFolder = sanitizeFolder(folderRaw) || 'uncategorized';

  let presigned: PresignUploadResponse;
  try {
    presigned = await requestUpstream<PresignUploadResponse>(`${serviceBaseUrls.media}/media/presign-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        entityType: 'product',
        entityId: safeFolder,
        fileName: normalizeFileName(file.name),
        contentType: file.type
      })
    });
  } catch {
    return fail(502, 'MEDIA_PRESIGN_FAILED', 'Cannot create upload URL from media service');
  }

  const uploadMethod = (presigned.method || 'PUT').toUpperCase();
  if (uploadMethod !== 'PUT') {
    return fail(502, 'MEDIA_PRESIGN_FAILED', 'Unsupported upload method from media service');
  }

  let uploadResponse: Response;
  try {
    uploadResponse = await fetch(presigned.uploadUrl, {
      method: uploadMethod,
      headers: presigned.headers ?? {
        'Content-Type': file.type
      },
      body: file
    });
  } catch {
    return fail(502, 'MEDIA_UPLOAD_FAILED', 'Cannot upload file to object storage');
  }

  if (!uploadResponse.ok) {
    return fail(502, 'MEDIA_UPLOAD_FAILED', 'Object storage rejected uploaded file');
  }

  const objectKey = presigned.objectKey.trim();
  if (!objectKey) {
    return fail(502, 'MEDIA_UPLOAD_FAILED', 'Media service returned empty object key');
  }

  const mediaPublicBaseUrl = normalizePublicBaseUrl(process.env.MEDIA_PUBLIC_BASE_URL ?? DEFAULT_MEDIA_PUBLIC_BASE_URL);
  const imageUrl = `${mediaPublicBaseUrl}/${objectKey}`;

  return ok(
    {
      fileName: extractFileNameFromObjectKey(objectKey),
      folder: safeFolder,
      objectKey,
      imageUrl,
      relativePath: objectKey
    },
    'backend',
    201
  );
}

function sanitizeFolder(value: string): string {
  const normalized = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .trim();

  return normalized.slice(0, 64);
}

function normalizeFileName(fileName: string): string {
  const safeBase = sanitizeFilenameBase(fileName);
  const extension = inferExtension(fileName);
  return `${safeBase}.${extension}`;
}

function sanitizeFilenameBase(fileName: string): string {
  const rawBase = path.parse(fileName).name || 'image';

  const cleaned = rawBase
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/(^-+|-+$)/g, '');

  return (cleaned || 'image').slice(0, 96);
}

function inferExtension(fileName: string): string {
  const extension = path.extname(fileName).replace('.', '').toLowerCase();
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'jpg';
    case 'png':
    case 'webp':
    case 'gif':
      return extension;
    default:
      return 'jpg';
  }
}

function normalizePublicBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

function extractFileNameFromObjectKey(objectKey: string): string {
  const fileName = objectKey.split('/').filter(Boolean).pop();
  return fileName || 'image';
}
