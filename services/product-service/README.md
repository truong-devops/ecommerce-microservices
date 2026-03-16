# product-service

Production-oriented NestJS service for product catalog management using MongoDB.

## Main features

- Product CRUD with seller ownership checks.
- Product variants (SKU, price, metadata).
- Public browse/search/filter for active products.
- Admin/moderator status changes.
- Optional OpenSearch integration with MongoDB fallback.
- Optional Kafka events for product write actions.
- Standard response/error envelope with requestId metadata.

## Quick start

1. Copy env values from `.env.example`.
2. Run local stack:
   - `npm run docker:up`
3. Start service logs:
   - `npm run docker:logs`
4. Stop stack:
   - `npm run docker:down`

## Health endpoints

- `GET /api/v1/health`
- `GET /api/v1/ready`
- `GET /api/v1/live`
