#!/usr/bin/env node

import { createHmac, randomUUID } from 'node:crypto';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';

const OBJECT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/_\-.]+$/;
const LEGACY_ASSET_MARKERS = ['/api/v1/products/assets/', '/api/products/assets/'];

function parseArgs(argv) {
  const options = {
    productBaseUrl: 'http://localhost:12012/api/v1',
    mediaBaseUrl: 'http://localhost:12022/api/v1',
    seedImageRoot: 'services/product-service-nest/seed-data/image',
    mediaPublicBaseUrl: 'http://localhost:12030/ecommerce-media',
    jwtSecret: 'dev-shared-jwt-access-secret-min-32-chars',
    token: '',
    devRole: 'SUPER_ADMIN',
    devUserId: '',
    devEmail: '',
    dryRun: true,
    pageSize: 100,
    maxProducts: 0
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === '--product-base-url' && value) {
      options.productBaseUrl = value.replace(/\/$/, '');
      index += 1;
      continue;
    }

    if (key === '--media-base-url' && value) {
      options.mediaBaseUrl = value.replace(/\/$/, '');
      index += 1;
      continue;
    }

    if (key === '--seed-image-root' && value) {
      options.seedImageRoot = value;
      index += 1;
      continue;
    }

    if (key === '--media-public-base-url' && value) {
      options.mediaPublicBaseUrl = value.replace(/\/$/, '');
      index += 1;
      continue;
    }

    if (key === '--token' && value) {
      options.token = value;
      index += 1;
      continue;
    }

    if (key === '--dev-role' && value) {
      options.devRole = value;
      index += 1;
      continue;
    }

    if (key === '--dev-user-id' && value) {
      options.devUserId = value;
      index += 1;
      continue;
    }

    if (key === '--dev-email' && value) {
      options.devEmail = value;
      index += 1;
      continue;
    }

    if (key === '--jwt-secret' && value) {
      options.jwtSecret = value;
      index += 1;
      continue;
    }

    if (key === '--page-size' && value) {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed > 0 && parsed <= 200) {
        options.pageSize = parsed;
      }
      index += 1;
      continue;
    }

    if (key === '--max-products' && value) {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed > 0) {
        options.maxProducts = parsed;
      }
      index += 1;
      continue;
    }

    if (key === '--apply') {
      options.dryRun = false;
      continue;
    }

    if (key === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (key === '--help' || key === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const seedImageRoot = path.resolve(options.seedImageRoot);
  const token = resolveToken(options);

  const products = await fetchAllProducts(options.productBaseUrl, token, options.pageSize, options.maxProducts);
  if (products.length === 0) {
    console.log('No products found.');
    return;
  }

  const summary = {
    productsScanned: 0,
    productsChanged: 0,
    imagesScanned: 0,
    imagesMigrated: 0,
    imagesSkippedObjectKey: 0,
    imagesSkippedExternal: 0,
    imagesMissingLocalFile: 0,
    productsFailed: 0
  };

  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'APPLY'}`);
  console.log(`Products loaded: ${products.length}`);

  for (const product of products) {
    summary.productsScanned += 1;

    const sourceImages = Array.isArray(product.images) ? product.images : [];
    const nextImages = [...sourceImages];
    let changed = false;

    for (let index = 0; index < sourceImages.length; index += 1) {
      summary.imagesScanned += 1;
      const rawImage = String(sourceImages[index] ?? '').trim();

      if (!rawImage) {
        continue;
      }

      if (OBJECT_KEY_PATTERN.test(rawImage)) {
        summary.imagesSkippedObjectKey += 1;
        continue;
      }

      const legacyPath = extractLegacyRelativePath(rawImage);
      if (!legacyPath) {
        summary.imagesSkippedExternal += 1;
        continue;
      }

      const localFilePath = resolveLegacyFilePath(seedImageRoot, legacyPath);
      const exists = await fileExists(localFilePath);
      if (!exists) {
        summary.imagesMissingLocalFile += 1;
        continue;
      }

      if (options.dryRun) {
        const simulatedObjectKey = `(pending) ${legacyPath}`;
        nextImages[index] = simulatedObjectKey;
        changed = true;
        summary.imagesMigrated += 1;
        continue;
      }

      const uploadedObjectKey = await uploadViaMediaService({
        mediaBaseUrl: options.mediaBaseUrl,
        token,
        productId: product.id,
        localFilePath
      });

      nextImages[index] = uploadedObjectKey;
      changed = true;
      summary.imagesMigrated += 1;
    }

    if (!changed) {
      continue;
    }

    summary.productsChanged += 1;

    if (options.dryRun) {
      console.log(`[dry-run] product=${product.id} images ${sourceImages.length} -> migrate pending`);
      continue;
    }

    try {
      await patchProductImages(options.productBaseUrl, token, product.id, nextImages);
      console.log(`[updated] product=${product.id} migratedImages=${countChangedImages(sourceImages, nextImages)}`);
    } catch (error) {
      summary.productsFailed += 1;
      console.error(`[failed] product=${product.id} ${(error && error.message) || error}`);
    }
  }

  console.log('---------------------------------------');
  console.log(JSON.stringify(summary, null, 2));

  if (!options.dryRun && summary.productsFailed > 0) {
    process.exit(2);
  }
}

function resolveToken(options) {
  if (options.token) {
    return options.token;
  }

  const role = (options.devRole || 'SUPER_ADMIN').trim().toUpperCase();
  const userId = options.devUserId || randomUUID();
  const email = options.devEmail || `migration-${role.toLowerCase()}@example.com`;
  const token = makeDevToken(options.jwtSecret, userId, email, role);
  console.log(`Using generated dev token role=${role} userId=${userId}`);
  return token;
}

function makeDevToken(secret, userId, email, role) {
  const now = Math.floor(Date.now() / 1000);
  const tokenVersion = 1;
  const sessionId = randomUUID();
  const header = toBase64Url({ alg: 'HS256', typ: 'JWT' });
  const payload = toBase64Url({
    sub: userId,
    email,
    role,
    jti: `migrate-${Date.now()}`,
    sessionId,
    tokenVersion,
    iat: now,
    exp: now + 3600
  });
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function toBase64Url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

async function fetchAllProducts(productBaseUrl, token, pageSize, maxProducts) {
  const output = [];
  let page = 1;

  while (true) {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortBy: 'updatedAt',
      sortOrder: 'DESC'
    });

    const payload = await requestJSON(`${productBaseUrl}/products/my?${query.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const items = normalizeProductItems(payload?.data);
    output.push(...items);

    if (maxProducts > 0 && output.length >= maxProducts) {
      return output.slice(0, maxProducts);
    }

    if (items.length < pageSize) {
      break;
    }

    page += 1;
  }

  return output;
}

function normalizeProductItems(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (data && typeof data === 'object' && Array.isArray(data.items)) {
    return data.items;
  }

  return [];
}

function extractLegacyRelativePath(rawImage) {
  try {
    const parsed = new URL(rawImage);
    const pathname = parsed.pathname;
    for (const marker of LEGACY_ASSET_MARKERS) {
      const index = pathname.indexOf(marker);
      if (index >= 0) {
        return decodeURIComponent(pathname.slice(index + marker.length));
      }
    }
    return '';
  } catch {
    return '';
  }
}

function resolveLegacyFilePath(seedImageRoot, relativePath) {
  const normalized = relativePath.split('/').filter(Boolean).join(path.sep);
  const absolute = path.resolve(seedImageRoot, normalized);
  if (!absolute.startsWith(seedImageRoot)) {
    return seedImageRoot;
  }
  return absolute;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function uploadViaMediaService({ mediaBaseUrl, token, productId, localFilePath }) {
  const fileName = path.basename(localFilePath);
  const contentType = detectContentType(fileName);

  const presignPayload = await requestJSON(`${mediaBaseUrl}/media/presign-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      entityType: 'product',
      entityId: productId,
      fileName,
      contentType
    })
  });

  const uploadData = presignPayload?.data ?? {};
  if (!uploadData.uploadUrl || !uploadData.objectKey) {
    throw new Error(`Invalid presign response for ${localFilePath}`);
  }

  const fileBuffer = await readFile(localFilePath);
  const uploadUrl = rewriteLocalPresignedUrl(String(uploadData.uploadUrl));
  const uploadResponse = await fetch(uploadUrl, {
    method: String(uploadData.method || 'PUT').toUpperCase(),
    headers: uploadData.headers ?? {
      'Content-Type': contentType
    },
    body: fileBuffer
  });

  if (!uploadResponse.ok) {
    const message = await uploadResponse.text();
    throw new Error(`Upload failed ${uploadResponse.status}: ${message.slice(0, 200)}`);
  }

  return String(uploadData.objectKey);
}

function rewriteLocalPresignedUrl(uploadUrl) {
  try {
    const parsed = new URL(uploadUrl);
    if (parsed.hostname !== 'minio') {
      return uploadUrl;
    }

    parsed.hostname = '127.0.0.1';
    parsed.port = '12030';
    parsed.protocol = 'http:';
    return parsed.toString();
  } catch {
    return uploadUrl;
  }
}

async function patchProductImages(productBaseUrl, token, productId, images) {
  await requestJSON(`${productBaseUrl}/products/${productId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      images
    })
  });
}

function detectContentType(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  switch (extension) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.bmp':
      return 'image/bmp';
    case '.svg':
      return 'image/svg+xml';
    case '.avif':
      return 'image/avif';
    default:
      return 'image/jpeg';
  }
}

async function requestJSON(url, init) {
  const response = await fetch(url, init);
  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || payload.success !== true) {
    const errorMessage = payload?.error?.message || `Request failed (${response.status})`;
    throw new Error(errorMessage);
  }

  return payload;
}

function countChangedImages(oldImages, newImages) {
  const maxLength = Math.max(oldImages.length, newImages.length);
  let count = 0;
  for (let index = 0; index < maxLength; index += 1) {
    if ((oldImages[index] ?? '') !== (newImages[index] ?? '')) {
      count += 1;
    }
  }
  return count;
}

function printHelp() {
  console.log(`Migrate product image URLs to media-service object keys.

Default mode is dry-run.

Examples:
  node scripts/migrate-product-images-to-media.mjs
  node scripts/migrate-product-images-to-media.mjs --apply
  node scripts/migrate-product-images-to-media.mjs --apply --max-products 20

Options:
  --product-base-url <url>
  --media-base-url <url>
  --seed-image-root <path>
  --media-public-base-url <url>
  --token <jwt>
  --dev-role <role>
  --dev-user-id <uuid>
  --dev-email <email>
  --jwt-secret <secret>
  --page-size <n>
  --max-products <n>
  --apply
  --dry-run
  --help
`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
