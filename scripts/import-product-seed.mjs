#!/usr/bin/env node

import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

function parseArgs(argv) {
  const options = {
    input: 'services/product-service/seed-data/products-100.create.json',
    baseUrl: 'http://localhost:3003/api/v1',
    token: '',
    createStatus: '',
    publish: false,
    publishToken: '',
    jwtSecret: 'change-me-product-access-secret-min-32-chars',
    devRole: '',
    devUserId: '',
    devEmail: '',
    publishDevRole: '',
    publishDevUserId: '',
    publishDevEmail: ''
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

  const createToken = resolveCreateToken(options);
  const publishToken = resolvePublishToken(options, createToken);

  const inputRaw = await readFile(options.input, 'utf8');
  const products = JSON.parse(inputRaw);

  if (!Array.isArray(products) || products.length === 0) {
    console.error(`No products found in ${options.input}`);
    process.exit(1);
  }

  const createdIds = [];
  const errors = [];

  for (let index = 0; index < products.length; index += 1) {
    const source = products[index];
    const payload = {
      ...source
    };

    if (options.createStatus) {
      payload.status = options.createStatus;
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
  console.log(`Failed: ${errors.length}`);

  if (errors.length > 0) {
    console.log('First 10 errors:');
    console.log(JSON.stringify(errors.slice(0, 10), null, 2));
    process.exit(2);
  }
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
  const header = toBase64Url({ alg: 'HS256', typ: 'JWT' });
  const payload = toBase64Url({
    sub: userId,
    email,
    role,
    jti: `seed-jti-${Date.now()}`,
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
  --help
`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
