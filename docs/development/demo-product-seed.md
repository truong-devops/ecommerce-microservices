# Demo product catalog seed

This seed creates a realistic Vietnamese ecommerce catalog for development and demonstration. It is intentionally original demo content rather than copied marketplace listings.

## Dataset

- Seller email: `vantruong1305.vn@gmail.com`
- Auth seller ID: `9916586e-1773-463f-a5b2-1088ce7e7f0b`
- 60 products
- 165 variants and inventory SKUs
- 20 categories
- Prices from 45,000 VND to 1,390,000 VND
- Initial inventory from 12 to 80 units per SKU
- Primary images use category-relevant Unsplash photos; secondary images are deterministic placeholders that the seller can replace later.

The source dataset is `services/product-service/seed-data/products-vietnam-demo.json`. Regenerate it after editing the catalog definitions with:

```bash
node scripts/generate-product-demo-seed.mjs
```

Validate and inspect the summary without changing data:

```bash
node scripts/import-product-seed.mjs --dry-run
```

## Import on the Docker server

Run from the repository root after the latest code is pulled. The secret is read from the running product-service container and is not printed.

```bash
cd /opt/ecommerce-microservices

SEED_JWT_SECRET="$(docker compose exec -T product-service printenv JWT_ACCESS_SECRET)"

JWT_ACCESS_SECRET="$SEED_JWT_SECRET" node scripts/import-product-seed.mjs \
  --base-url http://127.0.0.1:12012/api/v1 \
  --dev-role SELLER \
  --dev-user-id 9916586e-1773-463f-a5b2-1088ce7e7f0b \
  --dev-email vantruong1305.vn@gmail.com \
  --publish \
  --publish-dev-role ADMIN

unset SEED_JWT_SECRET
```

The seller token creates products as `DRAFT`, matching the product-service role rules. The temporary admin seed token then changes only the newly created products to `ACTIVE`, so they are visible to Buyer. Product creation emits `product.created` events; inventory-service consumes those events and creates inventory records for all variants.

The importer skips a product when any of its SKUs already exists for this seller. It is therefore safe to run the same command again. Use `--no-skip-existing` only when duplicate demo products are explicitly wanted.

## Verification

Check the number of active products in MongoDB:

```bash
docker compose exec mongo mongosh ecommerce_product --quiet --eval '
  db.products.aggregate([
    { $match: { sellerId: "9916586e-1773-463f-a5b2-1088ce7e7f0b", deletedAt: null } },
    { $group: { _id: "$status", products: { $sum: 1 }, variants: { $sum: { $size: "$variants" } } } },
    { $sort: { _id: 1 } }
  ]).toArray()
'
```

Check inventory created from Kafka events:

```bash
docker compose exec postgres \
  psql -U einventory -d ecommerce_inventory \
  -c "SELECT COUNT(*) AS sku_count,
             SUM(on_hand) AS total_on_hand,
             SUM(reserved) AS total_reserved
      FROM inventory_items
      WHERE seller_id = '9916586e-1773-463f-a5b2-1088ce7e7f0b';"
```

Check the public API:

```bash
curl -fsS 'https://api.truongam.tech/api/v1/products?page=1&pageSize=5&sellerId=9916586e-1773-463f-a5b2-1088ce7e7f0b' | jq
```

If products exist but inventory remains empty, inspect the consumer before re-importing:

```bash
docker compose logs --no-color --tail=200 inventory-service product-service kafka
```
