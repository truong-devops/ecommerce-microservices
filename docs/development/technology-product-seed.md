# Technology product catalog seed

This dataset creates a separate technology-focused catalog for the second demo Seller. The content is original demo data designed to resemble a realistic Vietnamese electronics shop; it is not copied from a marketplace listing.

## Dataset

- Seller email: `ducktrong.vn@gmail.com`
- Auth seller ID: `f596f4fc-3ac0-43f6-aa6c-9f6f24e43afa`
- Source file: `services/product-service/seed-data/products-technology-demo.json`
- Categories: phones and accessories, computers, electronics, cameras
- Images: category-relevant Unsplash images plus deterministic placeholders that the Seller can replace later
- All products are created as `DRAFT` and activated by a temporary Admin token during import

Regenerate the JSON after editing the catalog definitions:

```bash
node scripts/generate-technology-product-seed.mjs
```

Validate without changing data:

```bash
node scripts/import-product-seed.mjs \
  --input services/product-service/seed-data/products-technology-demo.json \
  --dry-run
```

## Import on the Docker server

Run from the repository root after pulling the commit containing the seed files. The product-service JWT secret is read from the running container and is not printed.

```bash
cd /opt/ecommerce-microservices

SEED_JWT_SECRET="$(docker compose exec -T product-service sh -c 'printf %s "$JWT_ACCESS_SECRET"')"

JWT_ACCESS_SECRET="$SEED_JWT_SECRET" node scripts/import-product-seed.mjs \
  --input services/product-service/seed-data/products-technology-demo.json \
  --base-url http://127.0.0.1:12012/api/v1 \
  --dev-role SELLER \
  --dev-user-id f596f4fc-3ac0-43f6-aa6c-9f6f24e43afa \
  --dev-email ducktrong.vn@gmail.com \
  --publish \
  --publish-dev-role ADMIN

unset SEED_JWT_SECRET
```

The importer checks the current Seller's SKUs before creating anything. It is safe to run again: products whose `DTECH-*` SKUs already exist will be skipped.

## Verification

Check products by Seller in MongoDB:

```bash
docker compose exec mongo mongosh ecommerce_product --quiet --eval '
  db.products.aggregate([
    { $match: { sellerId: "f596f4fc-3ac0-43f6-aa6c-9f6f24e43afa", deletedAt: null } },
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
      WHERE seller_id = 'f596f4fc-3ac0-43f6-aa6c-9f6f24e43afa';"
```

Check the public API:

```bash
curl -fsS \
  'https://api.truongam.tech/api/v1/products?page=1&pageSize=5&sellerId=f596f4fc-3ac0-43f6-aa6c-9f6f24e43afa' | jq
```
