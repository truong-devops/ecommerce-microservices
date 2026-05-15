# Product Service Go Contract Capture

This file is the Phase 0 baseline for implementing `services/product-service-go` beside the current NestJS `services/product-service`.

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

Implemented in Go phases 1-4:

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

Deferred to later phases:

- video create/update/workflow/moderation write APIs
- video event tracking APIs
- shop decor APIs

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
