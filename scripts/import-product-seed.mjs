#!/usr/bin/env node

import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

function parseArgs(argv) {
  const options = {
    input: 'services/product-service/seed-data/products-vietnam-demo.json',
    baseUrl: 'http://localhost:12012/api/v1',
    token: '',
    createStatus: '',
    publish: false,
    publishToken: '',
    jwtSecret: process.env.JWT_ACCESS_SECRET || 'dev-shared-jwt-access-secret-min-32-chars',
    devRole: '',
    devUserId: '',
    devEmail: '',
    publishDevRole: '',
    publishDevUserId: '',
    publishDevEmail: '',
    skipExisting: true,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if ((key === '--help' || key === '-h') && !value?.startsWith('--')) {
      printHelp();
      process.exit(0);
    }

    if (key === '--input' && value) {
      options.input = value;
      index += 1;
      continue;
    }

    if (key === '--base-url' && value) {
      options.baseUrl = value.replace(/\/$/, '');
      index += 1;
      continue;
    }

    if (key === '--token' && value) {
      options.token = value;
      index += 1;
      continue;
    }

    if (key === '--create-status' && value) {
      options.createStatus = value;
      index += 1;
      continue;
    }

    if (key === '--publish') {
      options.publish = true;
      continue;
    }

    if (key === '--no-skip-existing') {
      options.skipExisting = false;
      continue;
    }

    if (key === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (key === '--publish-token' && value) {
      options.publishToken = value;
      index += 1;
      continue;
    }

    if (key === '--jwt-secret' && value) {
      options.jwtSecret = value;
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

    if (key === '--publish-dev-role' && value) {
      options.publishDevRole = value;
      index += 1;
      continue;
    }

    if (key === '--publish-dev-user-id' && value) {
      options.publishDevUserId = value;
      index += 1;
      continue;
    }

    if (key === '--publish-dev-email' && value) {
      options.publishDevEmail = value;
      index += 1;
      continue;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const inputRaw = await readFile(options.input, 'utf8');
  const products = JSON.parse(inputRaw);

  if (!Array.isArray(products) || products.length === 0) {
    console.error(`No products found in ${options.input}`);
    process.exit(1);
  }

  const summary = validateAndSummarize(products);
  printSeedSummary(options.input, summary);

  if (summary.errors.length > 0) {
    console.error('Seed validation failed:');
    console.error(JSON.stringify(summary.errors.slice(0, 20), null, 2));
    process.exit(1);
  }

  if (options.dryRun) {
    console.log('Dry run completed. No API calls were made.');
    return;
  }

  const createToken = resolveCreateToken(options);
  const publishToken = resolvePublishToken(options, createToken);
  const existingSkus = options.skipExisting ? await loadExistingSkus(options.baseUrl, createToken) : new Set();

  const createdIds = [];
  const errors = [];
  let skipped = 0;

  for (let index = 0; index < products.length; index += 1) {
    const source = products[index];
    const payload = {
      ...source
    };

    if (options.createStatus) {
      payload.status = options.createStatus;
    }

    const productSkus = payload.variants.map((variant) => normalizeSku(variant.sku));
    const duplicatedSku = productSkus.find((sku) => existingSkus.has(sku));
    if (duplicatedSku) {
      skipped += 1;
      console.log(`[skipped ${index + 1}/${products.length}] existing SKU ${duplicatedSku} - ${payload.name}`);
      continue;
    }

    const response = await fetch(`${options.baseUrl}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${createToken}`
      },
      body: JSON.stringify(payload)
    });

    const body = await safeJson(response);
    if (!response.ok || !body?.success) {
      errors.push({
        index: index + 1,
        sku: payload.variants?.[0]?.sku,
        status: response.status,
        error: body?.error ?? { message: 'Unknown error' }
      });
      continue;
    }

    createdIds.push(body.data.id);
    for (const sku of productSkus) {
      existingSkus.add(sku);
    }
    console.log(`[created ${index + 1}/${products.length}] ${body.data.id} ${payload.name}`);
  }

  if (options.publish && createdIds.length > 0) {
    for (const productId of createdIds) {
      const response = await fetch(`${options.baseUrl}/products/${productId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publishToken}`
        },
        body: JSON.stringify({
          status: 'ACTIVE',
          reason: 'seed import'
        })
      });

      const body = await safeJson(response);
      if (!response.ok || !body?.success) {
        errors.push({
          productId,
          status: response.status,
          error: body?.error ?? { message: 'Cannot activate product' }
        });
        continue;
      }

      console.log(`[activated] ${productId}`);
    }
  }

  console.log('---------------------------------------');
  console.log(`Input: ${products.length}`);
  console.log(`Created: ${createdIds.length}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${errors.length}`);

  if (errors.length > 0) {
    console.log('First 10 errors:');
    console.log(JSON.stringify(errors.slice(0, 10), null, 2));
    process.exit(2);
  }
}

async function loadExistingSkus(baseUrl, token) {
  const skus = new Set();

  for (let page = 1; page <= 100; page += 1) {
    const response = await fetch(`${baseUrl}/products/my?page=${page}&pageSize=100&sortBy=createdAt&sortOrder=DESC`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const body = await safeJson(response);
    if (!response.ok || !body?.success || !Array.isArray(body.data)) {
      console.error('Cannot load existing seller products before import.');
      console.error(JSON.stringify(body?.error ?? { status: response.status }, null, 2));
      process.exit(1);
    }

    for (const product of body.data) {
      for (const variant of Array.isArray(product?.variants) ? product.variants : []) {
        const sku = normalizeSku(variant?.sku);
        if (sku) {
          skus.add(sku);
        }
      }
    }

    if (body.data.length < 100) {
      break;
    }
  }

  console.log(`Loaded ${skus.size} existing seller SKUs for idempotency check.`);
  return skus;
}

function validateAndSummarize(products) {
  const categories = new Map();
  const skus = new Set();
  const slugs = new Set();
  const errors = [];
  let variants = 0;
  let minPrice = Number.POSITIVE_INFINITY;
  let maxPrice = 0;

  products.forEach((product, productIndex) => {
    const label = `product[${productIndex}]`;
    if (!product || typeof product !== 'object' || Array.isArray(product)) {
      errors.push({ index: productIndex, message: 'product must be an object' });
      return;
    }
    if (typeof product.name !== 'string' || !product.name.trim()) {
      errors.push({ index: productIndex, message: 'name is required' });
    } else if (product.name.trim().length > 255) {
      errors.push({ index: productIndex, message: 'name must be at most 255 characters' });
    }
    if (typeof product.categoryId !== 'string' || !product.categoryId.trim()) {
      errors.push({ index: productIndex, message: 'categoryId is required' });
    } else if (product.categoryId.trim().length > 64) {
      errors.push({ index: productIndex, message: 'categoryId must be at most 64 characters' });
    } else {
      categories.set(product.categoryId, (categories.get(product.categoryId) ?? 0) + 1);
    }
    if (typeof product.slug === 'string' && product.slug) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug) || product.slug.length > 255) {
        errors.push({ index: productIndex, message: 'slug is invalid' });
      } else if (slugs.has(product.slug)) {
        errors.push({ index: productIndex, message: `duplicate slug ${product.slug}` });
      } else {
        slugs.add(product.slug);
      }
    }
    if (typeof product.description === 'string' && product.description.trim().length > 5000) {
      errors.push({ index: productIndex, message: 'description must be at most 5000 characters' });
    }
    if (typeof product.brand === 'string' && product.brand.trim().length > 128) {
      errors.push({ index: productIndex, message: 'brand must be at most 128 characters' });
    }
    if (product.status && !['DRAFT', 'ACTIVE', 'HIDDEN', 'ARCHIVED'].includes(product.status)) {
      errors.push({ index: productIndex, message: 'status is invalid' });
    }
    if (product.images !== undefined && !Array.isArray(product.images)) {
      errors.push({ index: productIndex, message: 'images must be an array' });
    } else {
      for (const image of product.images ?? []) {
        if (typeof image !== 'string' || !image.trim() || /\s/.test(image)) {
          errors.push({ index: productIndex, message: 'images contains an invalid value' });
        }
      }
    }
    if (!Array.isArray(product.variants) || product.variants.length === 0) {
      errors.push({ index: productIndex, message: 'at least one variant is required' });
      return;
    }

    let defaultVariants = 0;
    product.variants.forEach((variant, variantIndex) => {
      variants += 1;
      const sku = normalizeSku(variant?.sku);
      if (!sku || !/^[A-Z0-9._-]{1,64}$/.test(sku)) {
        errors.push({ index: productIndex, variant: variantIndex, message: `${label} variant SKU is required` });
      } else if (skus.has(sku)) {
        errors.push({ index: productIndex, variant: variantIndex, message: `duplicate SKU ${sku}` });
      } else {
        skus.add(sku);
      }

      const price = Number(variant?.price);
      if (!Number.isFinite(price) || price < 0) {
        errors.push({ index: productIndex, variant: variantIndex, message: `invalid price for ${sku || label}` });
      } else {
        minPrice = Math.min(minPrice, price);
        maxPrice = Math.max(maxPrice, price);
      }

      if (typeof variant?.name !== 'string' || !variant.name.trim() || variant.name.trim().length > 255) {
        errors.push({ index: productIndex, variant: variantIndex, message: `invalid variant name for ${sku || label}` });
      }
      if (typeof variant?.currency !== 'string' || !/^[A-Z]{3}$/.test(variant.currency)) {
        errors.push({ index: productIndex, variant: variantIndex, message: `invalid currency for ${sku || label}` });
      }
      if (variant?.initialStock !== undefined && (!Number.isInteger(variant.initialStock) || variant.initialStock < 0)) {
        errors.push({ index: productIndex, variant: variantIndex, message: `invalid initialStock for ${sku || label}` });
      }
      if (variant?.compareAtPrice !== undefined && (!Number.isFinite(variant.compareAtPrice) || variant.compareAtPrice < 0)) {
        errors.push({ index: productIndex, variant: variantIndex, message: `invalid compareAtPrice for ${sku || label}` });
      }
      if (variant?.isDefault === true) {
        defaultVariants += 1;
      }
    });
    if (defaultVariants > 1) {
      errors.push({ index: productIndex, message: 'only one variant can be default' });
    }
  });

  return {
    categories,
    productCount: products.length,
    variants,
    minPrice: Number.isFinite(minPrice) ? minPrice : 0,
    maxPrice,
    errors
  };
}

function printSeedSummary(input, summary) {
  console.log('---------------------------------------');
  console.log(`Seed file: ${input}`);
  console.log(`Products: ${summary.productCount}`);
  console.log(`Variants: ${summary.variants}`);
  console.log(`Categories: ${summary.categories.size}`);
  console.log(`Price range: ${formatVnd(summary.minPrice)} - ${formatVnd(summary.maxPrice)}`);
  console.log('Category distribution:');
  for (const [category, count] of [...summary.categories.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    console.log(`  ${category}: ${count}`);
  }
  console.log('---------------------------------------');
}

function formatVnd(value) {
  return `${Math.round(value).toLocaleString('vi-VN')} VND`;
}

function normalizeSku(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function resolveCreateToken(options) {
  if (options.token) {
    assertNotPlaceholder(options.token, '--token');
    return options.token;
  }

  if (!options.devRole) {
    console.error('Missing auth: provide --token <JWT> or --dev-role <SELLER|ADMIN|MODERATOR|SUPER_ADMIN>');
    process.exit(1);
  }

  const role = options.devRole.trim().toUpperCase();
  const userId = options.devUserId || randomUUID();
  const email = options.devEmail || `seed-${role.toLowerCase()}@example.com`;
  const token = makeDevToken(options.jwtSecret, userId, email, role);

  console.log(`Using generated dev create token (role=${role}, userId=${userId}, email=${email})`);
  return token;
}

function resolvePublishToken(options, createToken) {
  if (!options.publish) {
    return '';
  }

  if (options.publishToken) {
    assertNotPlaceholder(options.publishToken, '--publish-token');
    return options.publishToken;
  }

  if (options.publishDevRole) {
    const role = options.publishDevRole.trim().toUpperCase();
    const userId = options.publishDevUserId || randomUUID();
    const email = options.publishDevEmail || `seed-${role.toLowerCase()}@example.com`;
    const token = makeDevToken(options.jwtSecret, userId, email, role);
    console.log(`Using generated dev publish token (role=${role}, userId=${userId}, email=${email})`);
    return token;
  }

  return createToken;
}

function assertNotPlaceholder(value, argName) {
  if (/^<[^>]+>$/.test(value.trim())) {
    console.error(`${argName} looks like a placeholder (${value}). Replace it with real JWT.`);
    process.exit(1);
  }
}

function makeDevToken(secret, userId, email, role) {
  const now = Math.floor(Date.now() / 1000);
  const sessionId = randomUUID();
  const header = toBase64Url({ alg: 'HS256', typ: 'JWT' });
  const payload = toBase64Url({
    sub: userId,
    email,
    role,
    jti: `seed-jti-${Date.now()}`,
    sessionId,
    tokenVersion: 0,
    iat: now,
    exp: now + 3600
  });
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function toBase64Url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function printHelp() {
  console.log(`Import product seed into product-service

Required auth:
  --token <JWT>
  or
  --dev-role <SELLER|ADMIN|MODERATOR|SUPER_ADMIN> [--jwt-secret <secret>]

Options:
  --input <path>
  --base-url <url>
  --create-status <DRAFT|ACTIVE|HIDDEN|ARCHIVED>
  --publish
  --publish-token <JWT>
  --publish-dev-role <ADMIN|MODERATOR|SUPER_ADMIN>
  --dev-user-id <uuid>
  --dev-email <email>
  --publish-dev-user-id <uuid>
  --publish-dev-email <email>
  --no-skip-existing
  --dry-run
  --help
`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
