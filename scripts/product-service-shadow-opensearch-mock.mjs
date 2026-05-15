#!/usr/bin/env node

import http from 'node:http';

const port = Number(process.env.PORT ?? 9200);
const indices = new Map();

function getIndex(name) {
  if (!indices.has(name)) {
    indices.set(name, new Map());
  }
  return indices.get(name);
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJSON(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function valueForSort(doc, field) {
  if (field === 'name.keyword') {
    return doc.name ?? '';
  }
  return doc[field] ?? '';
}

function matchesSearch(doc, query) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const haystacks = [
    doc.name,
    doc.slug,
    doc.description,
    doc.brand,
    ...(Array.isArray(doc.variants) ? doc.variants.flatMap((variant) => [variant.sku, variant.name]) : []),
  ];
  return haystacks.some((value) => String(value ?? '').toLowerCase().includes(needle));
}

function matchesFilters(doc, filters) {
  for (const filter of filters ?? []) {
    const term = filter.term ?? {};
    for (const [key, expected] of Object.entries(term)) {
      if (doc[key] !== expected) {
        return false;
      }
    }
  }
  return true;
}

function search(index, body) {
  const bool = body?.query?.bool ?? {};
  const filters = bool.filter ?? [];
  const must = bool.must ?? [];
  const multiMatch = must.find((item) => item.multi_match)?.multi_match;
  const from = Number(body.from ?? 0);
  const size = Number(body.size ?? 20);
  const sortSpec = body.sort?.[0] ?? { createdAt: 'desc' };
  const [[sortField, sortOrder]] = Object.entries(sortSpec);

  const docs = [...index.entries()]
    .filter(([, doc]) => matchesFilters(doc, filters))
    .filter(([, doc]) => matchesSearch(doc, multiMatch?.query))
    .sort(([, left], [, right]) => {
      const a = valueForSort(left, sortField);
      const b = valueForSort(right, sortField);
      if (a === b) {
        return 0;
      }
      const result = a > b ? 1 : -1;
      return sortOrder === 'asc' ? result : -result;
    });

  return {
    hits: {
      total: { value: docs.length, relation: 'eq' },
      hits: docs.slice(from, from + size).map(([id, doc]) => ({ _id: id, _source: doc })),
    },
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const parts = url.pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && url.pathname === '/_cluster/health') {
      send(res, 200, { status: 'green' });
      return;
    }

    if (parts.length === 1 && req.method === 'PUT') {
      getIndex(parts[0]);
      send(res, 200, { acknowledged: true });
      return;
    }

    if (parts.length === 3 && parts[1] === '_doc' && req.method === 'PUT') {
      const body = await readJSON(req);
      getIndex(parts[0]).set(parts[2], body);
      send(res, 201, { result: 'created', _id: parts[2] });
      return;
    }

    if (parts.length === 3 && parts[1] === '_doc' && req.method === 'DELETE') {
      getIndex(parts[0]).delete(parts[2]);
      send(res, 200, { result: 'deleted', _id: parts[2] });
      return;
    }

    if (parts.length === 2 && parts[1] === '_search' && req.method === 'POST') {
      const body = await readJSON(req);
      send(res, 200, search(getIndex(parts[0]), body));
      return;
    }

    send(res, 404, { error: 'not_found' });
  } catch (error) {
    send(res, 500, { error: String(error) });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`OpenSearch mock listening on ${port}`);
});
