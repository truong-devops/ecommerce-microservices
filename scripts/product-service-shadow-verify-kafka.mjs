#!/usr/bin/env node

import fs from 'node:fs';

const runId = process.env.PRODUCT_COMPARE_RUN_ID;
const productEventsPath = process.env.PRODUCT_EVENTS_FILE;
const analyticsEventsPath = process.env.ANALYTICS_EVENTS_FILE;

if (!runId || !productEventsPath || !analyticsEventsPath) {
  console.error('Missing PRODUCT_COMPARE_RUN_ID, PRODUCT_EVENTS_FILE, or ANALYTICS_EVENTS_FILE');
  process.exit(1);
}

function readEvents(path) {
  if (!fs.existsSync(path)) {
    return [];
  }
  return fs.readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.includes(runId))
    .map((line) => JSON.parse(line));
}

function countByType(events) {
  const counts = new Map();
  for (const event of events) {
    counts.set(event.eventType, (counts.get(event.eventType) ?? 0) + 1);
  }
  return counts;
}

function requireAtLeast(counts, type, expected) {
  const actual = counts.get(type) ?? 0;
  if (actual < expected) {
    console.error(`[DIFF] Kafka ${type}: expected at least ${expected}, got ${actual}`);
    return 1;
  }
  console.log(`[OK] Kafka ${type}: ${actual}`);
  return 0;
}

const productEvents = readEvents(productEventsPath);
const analyticsEvents = readEvents(analyticsEventsPath);
const productCounts = countByType(productEvents);
const analyticsCounts = countByType(analyticsEvents);

let failures = 0;
failures += requireAtLeast(productCounts, 'product.created', 4);
failures += requireAtLeast(productCounts, 'product.updated', 2);
failures += requireAtLeast(productCounts, 'product.status-changed', 2);
failures += requireAtLeast(productCounts, 'product.deleted', 2);
failures += requireAtLeast(analyticsCounts, 'video.view_started', 2);

if (failures > 0) {
  process.exit(1);
}

console.log('Product-service Kafka shadow checks passed.');
