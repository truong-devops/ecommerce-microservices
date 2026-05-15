# Product Service Go Contract Capture

This file is the Phase 0 baseline for implementing `services/product-service` beside the current NestJS `services/product-service-nest`.

## Compatibility Target

- Keep existing API Gateway paths unchanged.
- Keep frontend buyer, seller, and moderator API clients unchanged.
- Keep Mongo collections unchanged: `products`, `product_videos`, `shop_decors`.
- Keep response envelope unchanged:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "...",
    "timestamp": "..."
  }
}
```

- Keep paginated response shape unchanged: item array in `data`, pagination in `meta.pagination`.
- Keep error envelope unchanged:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Message"
  },
  "meta": {
    "requestId": "...",
    "timestamp": "..."
  }
}
```

## Phase 0 Route Baseline

Implemented in Go phases 1-7:

- `GET /api/v1/health`
- `GET /api/v1/ready`
- `GET /api/v1/live`
- `POST /api/v1/products`
- `GET /api/v1/products`
- `GET /api/v1/products/my`
- `GET /api/v1/products/{id}`
- `PATCH /api/v1/products/{id}`
- `PATCH /api/v1/products/{id}/status`
- `DELETE /api/v1/products/{id}`
- `GET /api/v1/videos/feed`
- `GET /api/v1/videos/{videoId}`
- `POST /api/v1/videos`
- `GET /api/v1/videos/me`
- `PATCH /api/v1/videos/{videoId}`
- `POST /api/v1/videos/{videoId}/media/confirm`
- `POST /api/v1/videos/{videoId}/thumbnail/confirm`
- `POST /api/v1/videos/{videoId}/submit-review`
- `POST /api/v1/videos/{videoId}/publish`
- `POST /api/v1/videos/{videoId}/unpublish`
- `DELETE /api/v1/videos/{videoId}`
- `POST /api/v1/videos/{videoId}/events/{eventType}`
- `GET /api/v1/moderation/videos`
- `POST /api/v1/moderation/videos/{videoId}/approve`
- `POST /api/v1/moderation/videos/{videoId}/reject`
- `GET /api/v1/shops/me/decor`
- `PATCH /api/v1/shops/me/decor`
- `GET /api/v1/shops/{sellerId}/decor`

Deferred to cutover:

- API Gateway product upstream switch.
- Shadow traffic/compare scripts against live Nest responses.

Detailed parity plan: `docs/development/product-service-shadow-test-plan.md`.

## Compare Checklist

Use the same Mongo database as Nest for read comparisons. Run Go on a separate port, for example `3013`, and compare:

- public product list with no filters
- public product list with `search`, `categoryId`, `brand`, `sellerId`
- public product detail for active and non-active products
- managed product list as seller and staff
- create product as seller and staff
- update product as owner and non-owner
- status update as moderator/admin
- soft delete as owner
- public video feed with and without `productId`
- public video detail for published and non-published videos

Exact timestamps and generated IDs may differ on write tests. Status code, error code, field names, and envelope shape must match.
