# Product Seed Data (100 records)

This folder contains sample product payloads compatible with `CreateProductDto` in `product-service`.

## Files

- `products-100.create.json`: 100 create payloads for `POST /api/v1/products`

## Import quickly

From repository root:

```bash
node scripts/import-product-seed.mjs \
  --token "<SELLER_OR_ADMIN_TOKEN>"
```

Default target:

- Base URL: `http://localhost:3003/api/v1`
- Input: `services/product-service/seed-data/products-100.create.json`

## Import quickly without real token (dev mode)

`product-service` validates HS256 JWT using `JWT_ACCESS_SECRET`.  
In local dev, you can auto-generate token from script:

```bash
node scripts/import-product-seed.mjs \
  --dev-role SELLER \
  --publish \
  --publish-dev-role ADMIN
```

If your service uses custom secret:

```bash
node scripts/import-product-seed.mjs \
  --dev-role SELLER \
  --publish \
  --publish-dev-role ADMIN \
  --jwt-secret "<YOUR_PRODUCT_SERVICE_JWT_ACCESS_SECRET>"
```

## Options

- `--base-url "<url>"`: override service URL
- `--input "<path>"`: custom JSON input
- `--create-status ACTIVE`: set status in create payload (use staff token)
- `--publish`: patch created products to `ACTIVE` via `/products/:id/status`
- `--publish-token "<ADMIN_OR_MODERATOR_TOKEN>"`: token for publish step
- `--dev-role "<role>"`: auto-generate create token in dev
- `--publish-dev-role "<role>"`: auto-generate publish token in dev
- `--jwt-secret "<secret>"`: signing secret for generated dev token

### Example: seller creates then admin publishes ACTIVE

```bash
node scripts/import-product-seed.mjs \
  --token "<SELLER_TOKEN>" \
  --publish \
  --publish-token "<ADMIN_TOKEN>"
```
