#!/usr/bin/env node

import { createHmac, randomUUID } from 'node:crypto';

const nestBaseUrl = process.env.PRODUCT_NEST_BASE_URL ?? 'http://localhost:13003/api/v1';
const goBaseUrl = process.env.PRODUCT_GO_BASE_URL ?? 'http://localhost:13013/api/v1';
const retries = Number(process.env.PRODUCT_COMPARE_RETRIES ?? 1);
const scenario = process.env.PRODUCT_COMPARE_SCENARIO ?? 'public';
const jwtSecret = process.env.JWT_ACCESS_SECRET ?? 'dev-shared-jwt-access-secret-min-32-chars';
const routePrefix = (process.env.PRODUCT_COMPARE_ROUTE_PREFIX ?? '').replace(/\/+$/, '');
const providedRunId = process.env.PRODUCT_COMPARE_RUN_ID;

const sellerId = '00000000-0000-4000-8000-000000000001';
const moderatorId = '00000000-0000-4000-8000-000000000002';
const adminId = '00000000-0000-4000-8000-000000000003';

const publicEndpoints = [
  { method: 'GET', path: '/health', prefix: false },
  { method: 'GET', path: '/live', prefix: false },
  { method: 'GET', path: '/ready', prefix: false },
  { method: 'GET', path: '/products' },
  { method: 'GET', path: '/products?page=1&pageSize=20' },
  { method: 'GET', path: '/videos/feed' },
  { method: 'GET', path: '/videos/feed?page=1&pageSize=20' },
  { method: 'GET', path: `/shops/${sellerId}/decor` },
];

function b64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function makeToken(userId, role) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const payload = b64url({
    sub: userId,
    email: `${role.toLowerCase()}@example.com`,
    role,
    jti: randomUUID(),
    sessionId: randomUUID(),
    tokenVersion: 1,
    iat: now,
    exp: now + 3600,
  });
  const signature = createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

const tokens = {
  seller: makeToken(sellerId, 'SELLER'),
  moderator: makeToken(moderatorId, 'MODERATOR'),
  admin: makeToken(adminId, 'ADMIN'),
};

function normalize(value) {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    if (
      key === 'timestamp' ||
      key === 'requestId' ||
      key === 'request_id' ||
      key === 'createdAt' ||
      key === 'updatedAt' ||
      key === 'deletedAt' ||
      key === 'publishedAt' ||
      key === 'hiddenAt' ||
      key === 'archivedAt'
      || key === 'lastAggregatedAt'
    ) {
      out[key] = nested == null ? nested : '<time>';
      continue;
    }
    if (
      key === 'message' &&
      typeof nested === 'string' &&
      (nested === 'Invalid JSON body' || nested.includes('JSON'))
    ) {
      out[key] = '<bad-json-message>';
      continue;
    }
    if (key === 'id' || key === 'productId') {
      out[key] = nested == null ? nested : '<product-id>';
      continue;
    }
    if (key === 'videoId') {
      out[key] = nested == null ? nested : '<video-id>';
      continue;
    }
    if (key === 'productCode') {
      out[key] = nested == null ? nested : '<product-code>';
      continue;
    }
    out[key] = normalize(nested);
  }
  return out;
}

async function request(baseUrl, endpoint) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const headers = { ...(endpoint.headers ?? {}) };
      let body;
      if (Object.prototype.hasOwnProperty.call(endpoint, 'body')) {
        headers['content-type'] = 'application/json';
        body = typeof endpoint.body === 'string' ? endpoint.body : JSON.stringify(endpoint.body);
      }
      if (endpoint.auth) {
        headers.authorization = `Bearer ${tokens[endpoint.auth]}`;
      }
      const path = `${endpoint.prefix === false ? '' : routePrefix}${endpoint.path}`;
      const response = await fetch(`${baseUrl}${path}`, { method: endpoint.method, headers, body });
      const text = await response.text();
      let parsed = null;
      if (text) {
        parsed = JSON.parse(text);
      }
      return {
        status: response.status,
        body: normalize(parsed),
        rawBody: parsed,
      };
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
  throw lastError;
}

function stableStringify(value) {
  return JSON.stringify(sortObject(value), null, 2);
}

function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}

let failures = 0;

async function compareEndpoint(endpoint, label = `${endpoint.method} ${endpoint.path}`) {
  const [nest, go] = await Promise.all([
    request(nestBaseUrl, endpoint),
    request(goBaseUrl, endpoint),
  ]);

  const nestText = stableStringify({ status: nest.status, body: nest.body });
  const goText = stableStringify({ status: go.status, body: go.body });
  if (nestText !== goText) {
    failures += 1;
    console.error(`\n[DIFF] ${label}`);
    console.error('Nest:', nestText);
    console.error('Go:  ', goText);
    return { nest, go, ok: false };
  }
  console.log(`[OK] ${label}`);
  return { nest, go, ok: true };
}

function assertSuccess(result, label) {
  if (!result.ok || !result.nest.rawBody?.success || !result.go.rawBody?.success) {
    throw new Error(`${label} did not return matching success responses`);
  }
}

function productPayload(runId, suffix, status = 'ACTIVE') {
  return {
    sellerId,
    name: `Shadow Product ${runId} ${suffix}`,
    slug: `shadow-product-${runId}-${suffix}`.toLowerCase(),
    description: `Shadow compare product ${suffix}`,
    categoryId: 'shadow-category',
    brand: 'ShadowBrand',
    attributes: { color: 'orange', source: 'shadow-compare' },
    images: [`products/images/${runId}-${suffix}.jpg`],
    variants: [
      {
        sku: `SHADOW-${runId}-${suffix}`.toUpperCase(),
        name: 'Default',
        price: 123.45,
        currency: 'USD',
        isDefault: true,
        metadata: { compare: true },
      },
    ],
    status,
  };
}

async function comparePublicReads() {
  for (const endpoint of publicEndpoints) {
    await compareEndpoint(endpoint);
  }
}

async function compareWriteFlows() {
  const runId = providedRunId ?? `r${Date.now().toString(36)}`;

  await compareEndpoint({
    method: 'GET',
    path: '/products/my',
  }, 'GET /products/my without token');

  await compareEndpoint({
    method: 'GET',
    path: '/products?sellerId=not-a-uuid',
  }, 'GET /products invalid sellerId');

  const mainProduct = await compareEndpoint({
    method: 'POST',
    path: '/products',
    auth: 'admin',
    body: productPayload(runId, 'main', 'ACTIVE'),
  }, 'POST /products active');
  assertSuccess(mainProduct, 'create main product');

  const statusProduct = await compareEndpoint({
    method: 'POST',
    path: '/products',
    auth: 'admin',
    body: productPayload(runId, 'status', 'ACTIVE'),
  }, 'POST /products status target');
  assertSuccess(statusProduct, 'create status product');

  const nestMainProductId = mainProduct.nest.rawBody.data.id;
  const goMainProductId = mainProduct.go.rawBody.data.id;
  const nestStatusProductId = statusProduct.nest.rawBody.data.id;
  const goStatusProductId = statusProduct.go.rawBody.data.id;

  await compareEndpointResults(
    await request(nestBaseUrl, { method: 'GET', path: `/products/${nestMainProductId}` }),
    await request(goBaseUrl, { method: 'GET', path: `/products/${goMainProductId}` }),
    'GET /products/:id public active',
  );

  await compareEndpoint({
    method: 'GET',
    path: `/products/my?search=${runId}&page=1&pageSize=20`,
    auth: 'seller',
  }, 'GET /products/my seller');

  await compareEndpoint({
    method: 'GET',
    path: `/products?search=${runId}&page=1&pageSize=20`,
  }, 'GET /products public search');

  await compareEndpointResults(
    await request(nestBaseUrl, {
      method: 'PATCH',
      path: `/products/${nestMainProductId}`,
      auth: 'seller',
      body: { name: `Shadow Product ${runId} main updated`, brand: 'UpdatedBrand' },
    }),
    await request(goBaseUrl, {
      method: 'PATCH',
      path: `/products/${goMainProductId}`,
      auth: 'seller',
      body: { name: `Shadow Product ${runId} main updated`, brand: 'UpdatedBrand' },
    }),
    'PATCH /products/:id seller',
  );

  await compareEndpointResults(
    await request(nestBaseUrl, {
      method: 'PATCH',
      path: `/products/${nestStatusProductId}/status`,
      auth: 'moderator',
      body: { status: 'HIDDEN', reason: 'shadow compare' },
    }),
    await request(goBaseUrl, {
      method: 'PATCH',
      path: `/products/${goStatusProductId}/status`,
      auth: 'moderator',
      body: { status: 'HIDDEN', reason: 'shadow compare' },
    }),
    'PATCH /products/:id/status',
  );
  await compareEndpointResults(
    await request(nestBaseUrl, { method: 'DELETE', path: `/products/${nestStatusProductId}`, auth: 'seller' }),
    await request(goBaseUrl, { method: 'DELETE', path: `/products/${goStatusProductId}`, auth: 'seller' }),
    'DELETE /products/:id',
  );

  const videoCreateNest = await request(nestBaseUrl, {
    method: 'POST',
    path: '/videos',
    auth: 'seller',
    body: {
      title: `Shadow Video ${runId}`,
      description: 'Shadow compare video',
      products: [{ productId: nestMainProductId, sortOrder: 1, tagPosition: { x: 20, y: 30, startSec: 1, endSec: 5 } }],
    },
  });
  const videoCreateGo = await request(goBaseUrl, {
    method: 'POST',
    path: '/videos',
    auth: 'seller',
    body: {
      title: `Shadow Video ${runId}`,
      description: 'Shadow compare video',
      products: [{ productId: goMainProductId, sortOrder: 1, tagPosition: { x: 20, y: 30, startSec: 1, endSec: 5 } }],
    },
  });
  await compareEndpointResults(videoCreateNest, videoCreateGo, 'POST /videos');

  const nestVideoId = videoCreateNest.rawBody.data.videoId;
  const goVideoId = videoCreateGo.rawBody.data.videoId;

  await compareEndpoint({
    method: 'GET',
    path: `/videos/me?search=${runId}`,
    auth: 'seller',
  }, 'GET /videos/me seller');

  await compareEndpointResults(
    await request(nestBaseUrl, {
      method: 'PATCH',
      path: `/videos/${nestVideoId}`,
      auth: 'seller',
      body: { title: `Shadow Video ${runId} Updated` },
    }),
    await request(goBaseUrl, {
      method: 'PATCH',
      path: `/videos/${goVideoId}`,
      auth: 'seller',
      body: { title: `Shadow Video ${runId} Updated` },
    }),
    'PATCH /videos/:videoId',
  );

  const mediaBody = {
    mediaObjectKey: `products/videos/${runId}/clip.mp4`,
    mimeType: 'video/mp4',
    sizeBytes: 1024,
    durationSec: 12.5,
  };
  await compareEndpointResults(
    await request(nestBaseUrl, { method: 'POST', path: `/videos/${nestVideoId}/media/confirm`, auth: 'seller', body: mediaBody }),
    await request(goBaseUrl, { method: 'POST', path: `/videos/${goVideoId}/media/confirm`, auth: 'seller', body: mediaBody }),
    'POST /videos/:videoId/media/confirm',
  );

  const thumbnailBody = { thumbnailObjectKey: `products/videos/${runId}/thumb.jpg` };
  await compareEndpointResults(
    await request(nestBaseUrl, { method: 'POST', path: `/videos/${nestVideoId}/thumbnail/confirm`, auth: 'seller', body: thumbnailBody }),
    await request(goBaseUrl, { method: 'POST', path: `/videos/${goVideoId}/thumbnail/confirm`, auth: 'seller', body: thumbnailBody }),
    'POST /videos/:videoId/thumbnail/confirm',
  );

  await compareEndpointResults(
    await request(nestBaseUrl, { method: 'POST', path: `/videos/${nestVideoId}/submit-review`, auth: 'seller' }),
    await request(goBaseUrl, { method: 'POST', path: `/videos/${goVideoId}/submit-review`, auth: 'seller' }),
    'POST /videos/:videoId/submit-review',
  );

  await compareEndpoint({
    method: 'GET',
    path: `/moderation/videos?search=${runId}&status=review_pending`,
    auth: 'moderator',
  }, 'GET /moderation/videos');

  await compareEndpointResults(
    await request(nestBaseUrl, { method: 'POST', path: `/videos/${nestVideoId}/publish`, auth: 'moderator' }),
    await request(goBaseUrl, { method: 'POST', path: `/videos/${goVideoId}/publish`, auth: 'moderator' }),
    'POST /videos/:videoId/publish',
  );

  await compareEndpointResults(
    await request(nestBaseUrl, { method: 'POST', path: `/videos/${nestVideoId}/events/view-started`, body: { source: 'shadow', clientEventId: `${runId}-view` } }),
    await request(goBaseUrl, { method: 'POST', path: `/videos/${goVideoId}/events/view-started`, body: { source: 'shadow', clientEventId: `${runId}-view` } }),
    'POST /videos/:videoId/events/view-started',
  );

  await compareEndpointResults(
    await request(nestBaseUrl, { method: 'POST', path: `/videos/${nestVideoId}/events/product-clicked`, body: '{' }),
    await request(goBaseUrl, { method: 'POST', path: `/videos/${goVideoId}/events/product-clicked`, body: '{' }),
    'POST /videos/:videoId/events/product-clicked malformed JSON',
  );

  await compareEndpointResults(
    await request(nestBaseUrl, { method: 'POST', path: `/videos/${nestVideoId}/unpublish`, auth: 'seller' }),
    await request(goBaseUrl, { method: 'POST', path: `/videos/${goVideoId}/unpublish`, auth: 'seller' }),
    'POST /videos/:videoId/unpublish',
  );

  await compareEndpointResults(
    await request(nestBaseUrl, { method: 'DELETE', path: `/videos/${nestVideoId}`, auth: 'seller' }),
    await request(goBaseUrl, { method: 'DELETE', path: `/videos/${goVideoId}`, auth: 'seller' }),
    'DELETE /videos/:videoId',
  );

  await compareEndpoint({
    method: 'GET',
    path: '/shops/me/decor',
    auth: 'seller',
  }, 'GET /shops/me/decor');

  await compareEndpoint({
    method: 'PATCH',
    path: '/shops/me/decor',
    auth: 'seller',
    body: {
      shopName: `Shadow Shop ${runId}`,
      slogan: 'Shadow compare decor',
      accentColor: '#123abc',
      navItems: ['All', 'Deals'],
      featuredCategories: ['Featured'],
    },
  }, 'PATCH /shops/me/decor');

  await compareEndpoint({
    method: 'GET',
    path: `/shops/${sellerId}/decor`,
  }, 'GET /shops/:sellerId/decor after update');
}

async function compareEndpointResults(nest, go, label) {
  const nestText = stableStringify({ status: nest.status, body: nest.body });
  const goText = stableStringify({ status: go.status, body: go.body });
  if (nestText !== goText) {
    failures += 1;
    console.error(`\n[DIFF] ${label}`);
    console.error('Nest:', nestText);
    console.error('Go:  ', goText);
    return;
  }
  console.log(`[OK] ${label}`);
}

if (scenario === 'public' || scenario === 'all') {
  await comparePublicReads();
}

if (scenario === 'write' || scenario === 'all') {
  await compareWriteFlows();
}

if (failures > 0) {
  console.error(`\n${failures} product-service shadow compare checks failed.`);
  process.exit(1);
}

console.log('\nProduct-service shadow compare checks passed.');
