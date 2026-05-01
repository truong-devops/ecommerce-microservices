#!/usr/bin/env bash
set -euo pipefail

# Compare notification-service (old NestJS) vs notification-service-go performance.
# Requires Node.js 18+ (native fetch).
#
# Example:
#   JWT_SECRET=dev-shared-jwt-access-secret-min-32-chars \
#   CONCURRENCY=40 DURATION_SEC=30 SCENARIO=get \
#   ./scripts/bench-notification-compare.sh
#
# Env:
#   BASE_URL_OLD   default: http://localhost:3029/api/v1
#   BASE_URL_GO    default: http://localhost:3039/api/v1
#   JWT_SECRET     default: dev-shared-jwt-access-secret-min-32-chars
#   CONCURRENCY    default: 30
#   DURATION_SEC   default: 20
#   TIMEOUT_MS     default: 8000
#   SCENARIO       get | post (default: get)

BASE_URL_OLD="${BASE_URL_OLD:-http://localhost:3029/api/v1}"
BASE_URL_GO="${BASE_URL_GO:-http://localhost:3039/api/v1}"
JWT_SECRET="${JWT_SECRET:-dev-shared-jwt-access-secret-min-32-chars}"
CONCURRENCY="${CONCURRENCY:-30}"
DURATION_SEC="${DURATION_SEC:-20}"
TIMEOUT_MS="${TIMEOUT_MS:-8000}"
SCENARIO="${SCENARIO:-get}"

if [[ "$SCENARIO" != "get" && "$SCENARIO" != "post" ]]; then
  echo "SCENARIO must be 'get' or 'post'" >&2
  exit 1
fi

node - "$BASE_URL_OLD" "$BASE_URL_GO" "$JWT_SECRET" "$CONCURRENCY" "$DURATION_SEC" "$TIMEOUT_MS" "$SCENARIO" <<'NODE'
const crypto = require('crypto');
const { performance } = require('perf_hooks');

const [,, baseOld, baseGo, jwtSecret, concurrencyRaw, durationRaw, timeoutRaw, scenario] = process.argv;
const concurrency = Number(concurrencyRaw);
const durationSec = Number(durationRaw);
const timeoutMs = Number(timeoutRaw);

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const CUSTOMER_EMAIL = 'buyer@example.com';
const ADMIN_EMAIL = 'admin@example.com';

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function makeToken(userId, email, role) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    sub: userId,
    email,
    role,
    jti: `bench-${role.toLowerCase()}-${Date.now()}-${Math.random()}`,
    iat: now,
    exp: now + 3600,
  }));
  const signature = crypto.createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${payload}.${signature}`;
}

const customerToken = makeToken(CUSTOMER_ID, CUSTOMER_EMAIL, 'CUSTOMER');
const adminToken = makeToken(ADMIN_ID, ADMIN_EMAIL, 'ADMIN');

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function randomUuidLike() {
  // Valid UUID v4 string shape
  return crypto.randomUUID();
}

async function requestOnce(baseUrl) {
  const url = scenario === 'get'
    ? `${baseUrl}/notifications?page=1&pageSize=20`
    : `${baseUrl}/notifications`;

  const headers = {
    'accept': 'application/json',
    'authorization': `Bearer ${scenario === 'get' ? customerToken : adminToken}`,
  };

  let body;
  if (scenario === 'post') {
    headers['content-type'] = 'application/json';
    body = JSON.stringify({
      recipientIds: [randomUuidLike()],
      subject: 'Perf Bench',
      content: 'Benchmark payload',
      payload: { source: 'bench-compare' },
    });
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = performance.now();
  try {
    const res = await fetch(url, {
      method: scenario === 'get' ? 'GET' : 'POST',
      headers,
      body,
      signal: ctrl.signal,
    });
    await res.arrayBuffer();
    const latency = performance.now() - start;
    return { ok: res.status >= 200 && res.status < 300, status: res.status, latency, timeout: false };
  } catch (e) {
    const latency = performance.now() - start;
    const isTimeout = e && (e.name === 'AbortError');
    return { ok: false, status: isTimeout ? 0 : -1, latency, timeout: isTimeout };
  } finally {
    clearTimeout(t);
  }
}

async function runBenchmark(label, baseUrl) {
  const deadline = Date.now() + durationSec * 1000;
  const latencies = [];
  const statuses = new Map();
  let success = 0;
  let failed = 0;
  let timeout = 0;

  async function worker() {
    while (Date.now() < deadline) {
      const r = await requestOnce(baseUrl);
      latencies.push(r.latency);
      if (r.ok) success += 1;
      else failed += 1;
      if (r.timeout) timeout += 1;
      statuses.set(r.status, (statuses.get(r.status) || 0) + 1);
    }
  }

  const startWall = performance.now();
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const elapsedSec = (performance.now() - startWall) / 1000;

  latencies.sort((a, b) => a - b);
  const total = success + failed;

  return {
    label,
    baseUrl,
    scenario,
    concurrency,
    durationSec,
    elapsedSec,
    total,
    success,
    failed,
    timeout,
    rps: total / elapsedSec,
    successRate: total ? (success / total) * 100 : 0,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    min: latencies[0] || 0,
    max: latencies[latencies.length - 1] || 0,
    statuses: Object.fromEntries([...statuses.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))),
  };
}

function printResult(r) {
  console.log(`\n=== ${r.label} ===`);
  console.log(`baseUrl       : ${r.baseUrl}`);
  console.log(`scenario      : ${r.scenario}`);
  console.log(`concurrency   : ${r.concurrency}`);
  console.log(`target sec    : ${r.durationSec}`);
  console.log(`actual sec    : ${r.elapsedSec.toFixed(2)}`);
  console.log(`total req     : ${r.total}`);
  console.log(`success       : ${r.success}`);
  console.log(`failed        : ${r.failed}`);
  console.log(`timeout       : ${r.timeout}`);
  console.log(`success rate  : ${r.successRate.toFixed(2)}%`);
  console.log(`throughput    : ${r.rps.toFixed(2)} req/s`);
  console.log(`latency min   : ${r.min.toFixed(2)} ms`);
  console.log(`latency p50   : ${r.p50.toFixed(2)} ms`);
  console.log(`latency p95   : ${r.p95.toFixed(2)} ms`);
  console.log(`latency p99   : ${r.p99.toFixed(2)} ms`);
  console.log(`latency max   : ${r.max.toFixed(2)} ms`);
  console.log(`status counts : ${JSON.stringify(r.statuses)}`);
}

(async () => {
  console.log('Starting benchmark compare...');
  console.log(`scenario=${scenario}, concurrency=${concurrency}, duration=${durationSec}s, timeout=${timeoutMs}ms`);

  // Warm-up
  await Promise.all([
    requestOnce(baseOld),
    requestOnce(baseGo),
  ]);

  const oldResult = await runBenchmark('legacy notification-service (NestJS)', baseOld);
  const goResult = await runBenchmark('notification-service-go', baseGo);

  printResult(oldResult);
  printResult(goResult);

  const rpsDiff = goResult.rps - oldResult.rps;
  const rpsPct = oldResult.rps === 0 ? 0 : (rpsDiff / oldResult.rps) * 100;
  const p95Diff = goResult.p95 - oldResult.p95;

  console.log('\n=== SUMMARY ===');
  console.log(`RPS diff (go-old)   : ${rpsDiff.toFixed(2)} req/s (${rpsPct.toFixed(2)}%)`);
  console.log(`P95 diff (go-old)   : ${p95Diff.toFixed(2)} ms`);
  console.log(`Success rate old/go : ${oldResult.successRate.toFixed(2)}% / ${goResult.successRate.toFixed(2)}%`);

  if (oldResult.successRate < 95 || goResult.successRate < 95) {
    process.exitCode = 2;
  }
})();
NODE
