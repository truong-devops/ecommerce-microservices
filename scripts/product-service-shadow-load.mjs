#!/usr/bin/env node

import { createHmac, randomUUID } from 'node:crypto';

const baseUrl = (process.env.PRODUCT_LOAD_BASE_URL ?? 'http://localhost:13010').replace(/\/+$/, '');
const routePrefix = (process.env.PRODUCT_LOAD_ROUTE_PREFIX ?? '/api/v1').replace(/\/+$/, '');
const durationSec = Number(process.env.PRODUCT_LOAD_DURATION_SEC ?? 60);
const concurrency = Number(process.env.PRODUCT_LOAD_CONCURRENCY ?? 50);
const jwtSecret = process.env.JWT_ACCESS_SECRET ?? 'dev-shared-jwt-access-secret-min-32-chars';
const sellerId = '00000000-0000-4000-8000-000000000001';

function b64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function makeToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const payload = b64url({
    sub: sellerId,
    email: 'seller@example.com',
    role: 'SELLER',
    jti: randomUUID(),
    sessionId: randomUUID(),
    tokenVersion: 1,
    iat: now,
    exp: now + Math.max(3600, durationSec + 60),
  });
  const signature = createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

const sellerToken = makeToken();
const endpoints = [
  { method: 'GET', path: '/products' },
  { method: 'GET', path: '/products?page=1&pageSize=20' },
  { method: 'GET', path: '/videos/feed' },
  { method: 'GET', path: '/videos/feed?page=1&pageSize=20' },
  { method: 'GET', path: `/shops/${sellerId}/decor` },
  { method: 'GET', path: '/products/my?page=1&pageSize=20', auth: true },
  { method: 'GET', path: '/videos/me?page=1&pageSize=20', auth: true },
];

const deadline = Date.now() + durationSec * 1000;
const stats = {
  count: 0,
  failed: 0,
  byStatus: new Map(),
  latencies: [],
};

function record(status, latencyMs) {
  stats.count += 1;
  stats.byStatus.set(status, (stats.byStatus.get(status) ?? 0) + 1);
  stats.latencies.push(latencyMs);
  if (status >= 400 || status === 0) {
    stats.failed += 1;
  }
}

async function hit(endpoint) {
  const started = performance.now();
  try {
    const headers = {};
    if (endpoint.auth) {
      headers.authorization = `Bearer ${sellerToken}`;
    }
    const response = await fetch(`${baseUrl}${routePrefix}${endpoint.path}`, { method: endpoint.method, headers });
    await response.arrayBuffer();
    record(response.status, performance.now() - started);
  } catch {
    record(0, performance.now() - started);
  }
}

async function worker(index) {
  let cursor = index;
  while (Date.now() < deadline) {
    const endpoint = endpoints[cursor % endpoints.length];
    cursor += concurrency;
    await hit(endpoint);
  }
}

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }
  const index = Math.min(values.length - 1, Math.ceil((p / 100) * values.length) - 1);
  return values[index];
}

const startedAt = Date.now();
await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)));
const elapsedSec = (Date.now() - startedAt) / 1000;
stats.latencies.sort((a, b) => a - b);

const result = {
  baseUrl,
  routePrefix,
  durationSec: elapsedSec,
  concurrency,
  requests: stats.count,
  rps: Number((stats.count / elapsedSec).toFixed(2)),
  failed: stats.failed,
  status: Object.fromEntries([...stats.byStatus.entries()].sort(([a], [b]) => Number(a) - Number(b))),
  latencyMs: {
    p50: Number(percentile(stats.latencies, 50).toFixed(2)),
    p95: Number(percentile(stats.latencies, 95).toFixed(2)),
    p99: Number(percentile(stats.latencies, 99).toFixed(2)),
    max: Number((stats.latencies.at(-1) ?? 0).toFixed(2)),
  },
};

console.log(JSON.stringify(result, null, 2));

if (stats.failed > 0) {
  process.exit(1);
}
