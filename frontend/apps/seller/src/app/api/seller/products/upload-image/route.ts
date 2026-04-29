import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { decodeAccessToken, readBearerToken } from '@/lib/server/access-token';
import { fail, ok } from '@/lib/server/seller-api-response';
import { serviceBaseUrls } from '@/lib/server/upstream-client';

const PRODUCT_CREATE_ROLES = new Set(['SELLER', 'ADMIN', 'SUPER_ADMIN']);
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

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
  const extension = inferExtension(file);
  const originalBaseName = sanitizeFilenameBase(file.name);
  const stampedName = `${originalBaseName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

  const repoRoot = await resolveRepoRoot();
  if (!repoRoot) {
    return fail(500, 'INTERNAL_ERROR', 'Cannot resolve repository root for image storage');
  }

  const assetsRoot = path.join(repoRoot, 'services', 'product-service', 'seed-data', 'image');
  const folderPath = path.join(assetsRoot, safeFolder);

  await mkdir(folderPath, { recursive: true });

  const destinationPath = path.join(folderPath, stampedName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(destinationPath, buffer);

  const assetBaseUrl = toAssetBaseUrl(serviceBaseUrls.product);
  const imageUrl = `${assetBaseUrl}/${safeFolder}/${stampedName}`;

  return ok({
    fileName: stampedName,
    folder: safeFolder,
    imageUrl,
    relativePath: `${safeFolder}/${stampedName}`
  }, 'backend', 201);
}

function sanitizeFolder(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/\.{2,}/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .trim();
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

  return cleaned || 'image';
}

function inferExtension(file: File): string {
  const fromName = path.extname(file.name).replace('.', '').toLowerCase();
  if (fromName === 'jpg' || fromName === 'jpeg') {
    return 'jpg';
  }
  if (fromName === 'png' || fromName === 'webp' || fromName === 'gif') {
    return fromName;
  }

  if (file.type === 'image/jpeg') {
    return 'jpg';
  }
  if (file.type === 'image/png') {
    return 'png';
  }
  if (file.type === 'image/webp') {
    return 'webp';
  }
  if (file.type === 'image/gif') {
    return 'gif';
  }

  return 'jpg';
}

function toAssetBaseUrl(productServiceBaseUrl: string): string {
  const url = new URL(productServiceBaseUrl);
  const normalizedHost = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname;
  const normalizedOrigin = `${url.protocol}//${normalizedHost}${url.port ? `:${url.port}` : ''}`;
  return `${normalizedOrigin}/api/v1/products/assets`;
}

async function resolveRepoRoot(): Promise<string | null> {
  let current = process.cwd();

  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(current, 'services', 'product-service', 'seed-data', 'image');
    try {
      await access(candidate);
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }

  return null;
}
