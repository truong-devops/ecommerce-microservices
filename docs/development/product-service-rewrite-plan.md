# Product Service Go Rewrite Plan

Goal: build `services/product-service` in parallel with the current NestJS `services/product-service-nest`, then cut API Gateway traffic over only after the Go implementation is contract-compatible and validated against the existing service.

This plan follows `docs/development/code-standards.md`: runtime code stays in `services/*`, Go services use `cmd/internal`, handlers stay thin, repositories own database access, and REST responses keep the standard envelope.

## Implementation Status

- Phase 0: implemented in `docs/development/product-service-contract-capture.md`.
- Phase 1: implemented as `services/product-service` skeleton with health, config, Mongo, Redis, JWT, roles, router, Dockerfile.
- Phase 2: implemented product read APIs for public and managed product reads.
- Phase 3: implemented product write APIs for create, update, status update, soft delete, OpenSearch hooks, and Kafka product event hooks.
- Phase 4: implemented public video feed/detail APIs with Redis feed cache.
- Phase 5: implemented video workflow writes.
- Phase 6: implemented video tracking events and analytics Kafka hook.
- Phase 7: implemented shop decor APIs.
- Phase 8: documented shadow run/cutover path; actual gateway cutover is intentionally pending.
- Shadow parity test plan: see `docs/development/product-service-shadow-test-plan.md`.

## Current NestJS Service Inventory

### Runtime Stack

- Framework: NestJS 10, Express adapter.
- Database: MongoDB through Mongoose.
- Cache: Redis through `ioredis`, currently optional.
- Events: Kafka through `kafkajs`, optional by `KAFKA_ENABLED`.
- Search: OpenSearch, optional by `SEARCH_ENABLED`.
- Auth: HS256 JWT validation with Redis revocation check on `revoked:access:{jti}`.
- Global response envelope: `success`, `data`, `meta.requestId`, `meta.timestamp`; paginated responses move pagination to `meta.pagination`.
- Global error envelope: `success: false`, `error.code`, `error.message`, optional `error.details`, `meta.requestId`, `meta.timestamp`.
- API prefix: default `/api/v1`.
- Service port: default `3003`.

### Config And Environment

The Go replacement must support these variables with compatible defaults:

- `APP_NAME`, default `product-service`.
- `APP_ENV`, values `development`, `staging`, `production`, default `development`.
- `PORT`, default `3003`.
- `API_PREFIX`, default `api/v1`.
- `DATABASE_URL`, required.
- `DATABASE_NAME`, default `ecommerce_product`.
- `REDIS_ENABLED`, default `false`.
- `REDIS_URL`, required when Redis is enabled.
- `JWT_ACCESS_SECRET`, required, min length 32.
- `MEDIA_PUBLIC_BASE_URL`, default `http://localhost:12030/ecommerce-media`.
- `KAFKA_ENABLED`, default `false`.
- `KAFKA_CLIENT_ID`, default `product-service`.
- `KAFKA_BROKERS`, default `localhost:9092`.
- `PRODUCT_EVENTS_TOPIC`, default `product.events`.
- `ANALYTICS_EVENTS_TOPIC`, used by current code with default `analytics.events`.
- `AUDIT_EVENTS_TOPIC`, default `audit.events`.
- `SEARCH_ENABLED`, default `false`.
- `OPENSEARCH_URL`.
- `OPENSEARCH_INDEX`, default `products`.
- `OPENSEARCH_USERNAME`.
- `OPENSEARCH_PASSWORD`.
- `OPENSEARCH_TIMEOUT_MS`, default `5000`.

### Roles

- `BUYER`
- `CUSTOMER`
- `SELLER`
- `ADMIN`
- `MODERATOR`
- `SUPPORT`
- `SUPER_ADMIN`

Role groups:

- Staff: `ADMIN`, `MODERATOR`, `SUPPORT`, `SUPER_ADMIN`.
- Sellers: `SELLER`.
- Buyers: `BUYER`, `CUSTOMER`.

### Error Codes

- `BAD_REQUEST`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `VALIDATION_FAILED`
- `INTERNAL_SERVER_ERROR`
- `SERVICE_UNAVAILABLE`
- `PRODUCT_NOT_FOUND`
- `PRODUCT_SLUG_EXISTS`
- `PRODUCT_SKU_CONFLICT`

### Mongo Collections

#### `products`

Fields:

- `_id`
- `sellerId`
- `name`
- `slug`
- `description`
- `categoryId`
- `brand`
- `status`: `DRAFT`, `ACTIVE`, `HIDDEN`, `ARCHIVED`
- `attributes`
- `images`
- `variants[]`: `sku`, `name`, `price`, `currency`, `compareAtPrice`, `isDefault`, `metadata`
- `minPrice`
- `deletedAt`
- `createdAt`
- `updatedAt`

Indexes to preserve:

- unique partial index on `slug` where `deletedAt: null`.
- `{ sellerId: 1, status: 1, createdAt: -1 }`
- `{ status: 1, categoryId: 1, brand: 1, minPrice: 1, createdAt: -1 }`
- text index on `name`, `description`, `brand`, `slug`.

#### `product_videos`

Fields:

- `videoId`
- `sellerId`
- `title`
- `description`
- `status`: `draft`, `processing`, `processing_failed`, `review_pending`, `published`, `hidden`, `rejected`, `archived`
- `mediaObjectKey`
- `mediaUrl`
- `thumbnailObjectKey`
- `thumbnailUrl`
- `mimeType`
- `sizeBytes`
- `durationSec`
- `products[]`: `productId`, `sku`, `nameSnapshot`, `imageSnapshot`, `priceSnapshot`, `currencySnapshot`, `statusSnapshot`, `sortOrder`, `tagPosition`
- `moderation`: `submittedAt`, `reviewedAt`, `reviewedBy`, `rejectionReason`, `policyFlags`
- `metricsSnapshot`: `viewStartedCount`, `qualifiedViewCount`, `productClickCount`, `addToCartCount`, `ctr`, `addToCartRate`, `lastAggregatedAt`
- `recentEventKeys`
- `publishedAt`
- `hiddenAt`
- `archivedAt`
- `createdAt`
- `updatedAt`

Indexes to preserve:

- unique/index on `videoId`.
- `{ sellerId: 1, createdAt: -1 }`
- `{ sellerId: 1, status: 1, updatedAt: -1 }`
- `{ status: 1, publishedAt: -1 }`
- `{ products.productId: 1, status: 1 }`

#### `shop_decors`

Fields:

- `sellerId`
- `shopName`
- `slogan`
- `logoUrl`
- `bannerUrl`
- `accentColor`
- `navItems`
- `introTitle`
- `introDescription`
- `featuredCategories`
- `createdAt`
- `updatedAt`

Indexes to preserve:

- unique/index on `sellerId`.

## Current API Surface To Match

### Health

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `GET` | `/api/v1/health` | Public | Returns service health. |
| `GET` | `/api/v1/ready` | Public | Checks Mongo and Redis when enabled. |
| `GET` | `/api/v1/live` | Public | Returns liveness. |

Compatibility routes SHOULD also be mounted without prefix and under `/api/*`, matching the Go services style used elsewhere.

### Products

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `POST` | `/api/v1/products` | `SELLER`, `ADMIN`, `SUPER_ADMIN` | Create product. Seller can only create own draft product. Staff must provide `sellerId` and may choose status. |
| `GET` | `/api/v1/products` | Public | List only `ACTIVE` products. Supports page, pageSize, search, categoryId, brand, sellerId, sortBy, sortOrder. Uses OpenSearch when enabled, Mongo fallback. |
| `GET` | `/api/v1/products/my` | `SELLER`, `ADMIN`, `MODERATOR`, `SUPER_ADMIN` | Seller sees own products; staff may filter by sellerId. |
| `GET` | `/api/v1/products/{id}` | Public | Returns product only when `ACTIVE`; otherwise `PRODUCT_NOT_FOUND`. |
| `PATCH` | `/api/v1/products/{id}` | `SELLER`, `ADMIN`, `SUPER_ADMIN` | Update product fields. General status changes except `DRAFT` must use status endpoint. |
| `PATCH` | `/api/v1/products/{id}/status` | `ADMIN`, `MODERATOR`, `SUPER_ADMIN` | Staff-only product status change, emits status event. |
| `DELETE` | `/api/v1/products/{id}` | `SELLER`, `ADMIN`, `SUPER_ADMIN` | Soft delete: set `deletedAt`, status `ARCHIVED`, emit delete event. |

Product behavior to match:

- Generate slug from provided slug or product name by trimming, lowercasing, removing non alphanumeric/space/hyphen, converting spaces to hyphen, and collapsing repeated hyphens.
- Reject duplicate live slug with `PRODUCT_SLUG_EXISTS`.
- Normalize SKU to uppercase.
- Reject duplicate SKU inside request and duplicate SKU in active collection with `PRODUCT_SKU_CONFLICT`.
- Exactly one default variant; if none provided, first variant becomes default; if multiple defaults, return `VALIDATION_FAILED`.
- `minPrice` is minimum variant price.
- Round money to 2 decimals.
- Normalize image storage values: keep object keys, convert URLs under `MEDIA_PUBLIC_BASE_URL` back to object keys, keep external URLs.
- Resolve response images to public URLs when stored value is object key.
- Response includes `productCode` and `sellerCode` generated from stable hash/display code logic.
- Writes index/delete products in OpenSearch when enabled.
- Writes product Kafka events when enabled.

### Videos

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `POST` | `/api/v1/videos` | `SELLER`, `ADMIN`, `SUPER_ADMIN` | Create draft video with product tags. |
| `GET` | `/api/v1/videos/me` | `SELLER`, `ADMIN`, `MODERATOR`, `SUPER_ADMIN` | List managed videos. Seller scoped to own videos. |
| `GET` | `/api/v1/videos/feed` | Public | List published videos only, sorted by `publishedAt desc`, `createdAt desc`, cached in Redis when enabled. |
| `GET` | `/api/v1/videos/{videoId}` | Public | Return only published video. |
| `PATCH` | `/api/v1/videos/{videoId}` | `SELLER`, `ADMIN`, `SUPER_ADMIN` | Update title, description, products when editable. |
| `POST` | `/api/v1/videos/{videoId}/media/confirm` | `SELLER`, `ADMIN`, `SUPER_ADMIN` | Persist uploaded media object key, mime, size, duration, set status `processing`. |
| `POST` | `/api/v1/videos/{videoId}/thumbnail/confirm` | `SELLER`, `ADMIN`, `SUPER_ADMIN` | Persist thumbnail object key/url. |
| `POST` | `/api/v1/videos/{videoId}/submit-review` | `SELLER`, `ADMIN`, `SUPER_ADMIN` | Validate publish readiness and set `review_pending`. |
| `POST` | `/api/v1/videos/{videoId}/publish` | `MODERATOR`, `ADMIN`, `SUPER_ADMIN` | Staff publish after readiness check. |
| `POST` | `/api/v1/videos/{videoId}/unpublish` | `SELLER`, `ADMIN`, `SUPER_ADMIN` | Published video becomes `hidden`. |
| `DELETE` | `/api/v1/videos/{videoId}` | `SELLER`, `ADMIN`, `SUPER_ADMIN` | Archive video. |
| `POST` | `/api/v1/videos/{videoId}/events/view-started` | Public | Track event, increment deduped metrics, publish analytics event. |
| `POST` | `/api/v1/videos/{videoId}/events/view-qualified` | Public | Track event, increment deduped metrics, publish analytics event. |
| `POST` | `/api/v1/videos/{videoId}/events/product-clicked` | Public | Track event, increment deduped metrics, publish analytics event. |
| `POST` | `/api/v1/videos/{videoId}/events/add-to-cart` | Public | Track event, increment deduped metrics, publish analytics event. |

Video behavior to match:

- Seller can create/manage only own videos.
- Staff-created videos require `sellerId`.
- Buyers cannot manage videos.
- Archived and `review_pending` videos are not editable.
- Publishing requires media object key, allowed mime type `video/mp4` or `video/webm`, and at least one product tag.
- Product tags must refer to existing products from same seller.
- Product tags snapshot product name, default SKU, first product image, minPrice, currency, and status.
- Reject duplicate product tags in the same video.
- Reject video media over 50MB.
- Public feed returns only published videos with non-null `publishedAt`.
- Redis feed cache key must account for `page`, `pageSize`, `productId`, `sellerId`, `search`; TTL currently 45 seconds.
- Invalidate feed cache on video metadata/status mutations, but not on view/click event tracking.
- Metrics event key uses client event id if present; otherwise video, anonymous session, product and 3-second watch bucket.
- `recentEventKeys` array is capped to last 500 keys.
- Analytics event type maps hyphen to underscore, e.g. `view-qualified` to `video.view_qualified`.

### Moderation Videos

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `GET` | `/api/v1/moderation/videos` | `MODERATOR`, `ADMIN`, `SUPER_ADMIN` | List review queue, default status `review_pending`. |
| `POST` | `/api/v1/moderation/videos/{videoId}/approve` | `MODERATOR`, `ADMIN`, `SUPER_ADMIN` | Publish video and set moderation review metadata. |
| `POST` | `/api/v1/moderation/videos/{videoId}/reject` | `MODERATOR`, `ADMIN`, `SUPER_ADMIN` | Reject non-published/non-archived video with reason. |

### Shop Decor

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `GET` | `/api/v1/shops/me/decor` | `SELLER`, `ADMIN`, `MODERATOR`, `SUPPORT`, `SUPER_ADMIN` | Return current user's decor or default. |
| `PATCH` | `/api/v1/shops/me/decor` | `SELLER`, `ADMIN`, `MODERATOR`, `SUPPORT`, `SUPER_ADMIN` | Upsert current user's decor. |
| `GET` | `/api/v1/shops/{sellerId}/decor` | Public | Return seller decor or default. |

Shop decor behavior to match:

- Default shop name: `Shop {sellerId first 8 uppercased}`.
- Default seller code uses stable seller display code.
- Default accent color: `#ee4d2d`.
- Default nav items, intro copy, and featured categories must stay compatible with current response.
- Input strings are trimmed and truncated to existing max lengths.
- `accentColor` must be valid `#RRGGBB`, otherwise fallback to `#ee4d2d`.
- `navItems` capped at 8 non-empty strings.
- `featuredCategories` capped at 10 non-empty strings.

## Target Go Service Layout

Create:

```txt
services/product-service/
  cmd/
    server/
      main.go
  internal/
    auth/
      context.go
      jwt.go
    config/
      config.go
    domain/
      errors.go
      product.go
      role.go
      shop-decor.go
      video.go
    events/
      kafka_publisher.go
      noop_publisher.go
    handler/
      health_handler.go
      product_handler.go
      shop_decor_handler.go
      video_handler.go
      video_moderation_handler.go
    httpx/
      httpx.go
    middleware/
      logger.go
      recovery.go
      request_id.go
    repository/
      mongo_indexes.go
      product_repository.go
      shop_decor_repository.go
      video_repository.go
    router/
      router.go
    search/
      opensearch_client.go
    service/
      health_service.go
      media_url_resolver.go
      product_service.go
      shop_decor_service.go
      video_feed_cache.go
      video_service.go
  Dockerfile
  docker-compose.dev.yml
  go.mod
  go.sum
```

Use these libraries unless a repo standard already provides better equivalents:

- Router: `github.com/go-chi/chi/v5`
- Logger: `go.uber.org/zap`
- Mongo: `go.mongodb.org/mongo-driver`
- Redis: `github.com/redis/go-redis/v9`
- JWT: `github.com/golang-jwt/jwt/v5`
- Kafka: `github.com/segmentio/kafka-go` or current repo-preferred Kafka client if already standardized in another service.
- Validation: handler-layer explicit validation helpers; no reflection-heavy validation unless justified.

## Migration Phases

### Phase 0: Contract Capture

- Add route inventory and response examples from Nest e2e tests.
- Add Postman/compare script fixtures for buyer, seller, moderator flows.
- Freeze current response shapes for products, videos, moderation videos, and shop decor.
- Confirm API Gateway can switch `product` upstream by environment variable only.

Acceptance:

- Contract file/checklist exists.
- Current Nest product-service passes tests and baseline compare fixtures.

### Phase 1: Go Skeleton

- Create `services/product-service` with health routes, config, Dockerfile, request id, logging, recovery, response envelope, error envelope, JWT middleware, role middleware, Redis revocation check.
- Implement Mongo connection and readiness check.
- Implement index bootstrap for `products`, `product_videos`, `shop_decors`.

Acceptance:

- `go test ./...` passes.
- `GET /api/v1/health`, `/ready`, `/live` match current envelope.
- Service runs locally on alternate port, e.g. `3013`.

### Phase 2: Product Read APIs

- Implement product domain models and repository read methods.
- Implement `GET /products`, `GET /products/{id}`, `GET /products/my`.
- Implement media URL resolution and display code generation.
- Implement Mongo fallback search first; then add OpenSearch client with fallback.

Acceptance:

- Compare script shows equivalent responses for public listing/detail and managed listing.
- Pagination envelope matches exactly.
- Mongo indexes are present.

### Phase 3: Product Write APIs

- Implement `POST /products`, `PATCH /products/{id}`, `PATCH /products/{id}/status`, `DELETE /products/{id}`.
- Implement slug/SKU validation, min price, variant normalization, seller/staff permission rules.
- Implement OpenSearch index/delete side effects.
- Implement Kafka product events.

Acceptance:

- Existing product e2e scenarios pass against Go.
- Conflict, permission, validation and not-found cases match Nest error code/message/status.

### Phase 4: Video Feed And Public Reads

- Implement `GET /videos/feed` with Redis cache and invalidation hooks.
- Implement `GET /videos/{videoId}`.
- Implement video response mapper, product tag response mapper, seller display code.

Acceptance:

- Buyer web `/videos` can read from Go service without frontend changes.
- Feed compare output matches Nest for populated seed data.
- Cache hit avoids Mongo list query in unit/integration tests.

### Phase 5: Video Workflow Writes

- Implement create/update video, confirm media, confirm thumbnail, submit review, publish, unpublish, archive.
- Implement product tag build from product snapshots.
- Preserve validation rules and permissions.
- Invalidate feed cache on all feed-affecting writes.

Acceptance:

- Seller video create/upload/submit-review flow passes.
- Moderator approve/reject flow passes.
- Published videos appear in buyer feed.

### Phase 6: Video Tracking

- Implement public event endpoints.
- Preserve dedupe logic with `recentEventKeys` and metric increments.
- Publish analytics events to `analytics.events`.
- Keep event tracking from invalidating feed cache.

Acceptance:

- View/click/add-to-cart events increment metrics once per event key.
- Kafka payload matches current `ProductEventsPublisherService` output.
- Duplicate event test passes.

### Phase 7: Shop Decor

- Implement public and authenticated shop decor endpoints.
- Preserve defaults, string limits, accent color fallback, list sanitization, upsert behavior.

Acceptance:

- Seller center shop decor and buyer public shop decor render without frontend changes.

### Phase 8: Shadow Run And Cutover

- Run Nest and Go product services side by side.
- Configure Go on a separate internal URL/port.
- Add compare scripts that call both services with the same auth token and payloads.
- Route selected read-only traffic to Go in local/dev environment first.
- Switch API Gateway `product` service URL to Go only after all contracts pass.

Acceptance:

- Product, seller, buyer-web, moderator apps pass smoke flows.
- Level-specific scripts touching product/video pass.
- Rollback is changing API Gateway product URL back to Nest.

## Compatibility Requirements

- Do not change frontend API clients during migration unless a contract bug is found.
- Do not change Mongo collection names or field names.
- Do not change Kafka topic names or event payload shape.
- Do not change public media URL resolution.
- Do not change auth token claim requirements.
- Preserve old `/api/*` route compatibility if API Gateway or local apps still use it.
- Go service must tolerate existing documents created by Mongoose, including missing optional fields.

## Validation Plan

Minimum checks per phase:

- `cd services/product-service && go test ./...`
- Current Nest tests remain green until final retirement:
  - `npm --workspace services/product-service-nest run test`
  - `npm --workspace services/product-service-nest run build`
- API compare scripts for:
  - public product list/detail
  - seller product create/update/delete
  - public video feed/detail
  - seller video workflow
  - moderator approve/reject
  - shop decor read/update

Cutover checks:

- API Gateway router tests for product/video/shop routes.
- Buyer web video feed smoke.
- Seller product/image/video smoke.
- Moderator video review smoke.
- Kafka topic smoke when `KAFKA_ENABLED=true`.
- Redis cache smoke when `REDIS_ENABLED=true`.
- OpenSearch fallback smoke when `SEARCH_ENABLED=true` and OpenSearch unavailable.

## Risks And Decisions

- Full rewrite risk is high because current service combines catalog, video commerce, search, Kafka events, Redis cache, and auth. Migration must be phased.
- Go improves request overhead and concurrency, but Mongo query/index quality and event write pressure still matter.
- Event tracking remains write-heavy. After Go parity, consider batching metrics with a durable queue or Redis stream, but only after contract replacement is complete.
- OpenSearch sort field `name.keyword` may not work with current mapping because `name` is mapped as `text` only. Keep behavior for compatibility first, then fix as a separate contract-aware change.
- Existing Nest env validation lists `AUDIT_EVENTS_TOPIC` but product code also uses `ANALYTICS_EVENTS_TOPIC`; Go config must include both to match runtime behavior.

## Done Definition

The Go service can fully replace Nest when:

- Every route listed above exists in `services/product-service`.
- Response and error envelopes match current frontend expectations.
- Mongo collections and indexes are compatible with existing data.
- Redis cache and token revocation behavior match current behavior.
- Kafka and OpenSearch optional behavior match current behavior.
- Buyer, seller, and moderator apps work without frontend changes.
- API Gateway can route all product/video/shop paths to Go by changing only service URL/config.
- Rollback path is documented and tested.
