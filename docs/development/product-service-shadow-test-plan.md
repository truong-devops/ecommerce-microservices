# Product Service Go Shadow Test Plan

Goal: prove `services/product-service` can replace the current NestJS `services/product-service-nest` without API, data, event, or behavior regressions.

Scope: compare product, product video, moderation video, shop decor, health, auth, response envelope, Mongo persistence, Redis cache behavior, Kafka events, and OpenSearch indexing.

## Services Under Test

- Old service: `services/product-service-nest` on port `3003`.
- New service: `services/product-service` on port `3013`.
- Shared dependencies for read-only comparison: same Mongo database, Redis optional, OpenSearch optional, Kafka optional.
- Write comparison dependency: cloned Mongo databases, isolated Redis prefixes or separate Redis DBs, isolated Kafka topics.

Do not run destructive write tests against the production-like shared database. Use either cloned DBs or disposable seeded databases.

Containerized compare stack:

- Compose file: `services/product-service/docker-compose.compare.yml`.
- Full dependency overlay: `services/product-service/docker-compose.compare.full.yml`.
- Real search overlay: `services/product-service/docker-compose.compare.search-real.yml`.
- Old Nest container: `product-service-nest`, exposed on `13003`.
- New Go container: `product-service`, exposed on `13013`.
- Shared shadow Mongo: `mongo`, exposed on `39017`.
- Shared shadow Redis: `redis`, exposed on `6393`.
- Shared shadow Kafka: `kafka`, exposed on `39092` when full stack is enabled.
- Shared real search backend: OpenSearch 2.13 service exposed on `39200` when real search is enabled.
- Public read compare script: `scripts/test-product-service-compare.sh`.

Run from the repo root:

```bash
./scripts/test-product-service-compare.sh
```

If localhost access is blocked by the runner, compare from the Docker network:

```bash
PRODUCT_COMPARE_TRANSPORT=docker ./scripts/test-product-service-compare.sh
```

Run the full replacement gate with real search, Kafka, API Gateway, and load check:

```bash
AUTO_UP=1 \
PRODUCT_COMPARE_FULL_STACK=1 \
PRODUCT_COMPARE_REAL_SEARCH=1 \
PRODUCT_COMPARE_TRANSPORT=docker \
PRODUCT_COMPARE_SCENARIO=all \
PRODUCT_COMPARE_LOAD=1 \
PRODUCT_LOAD_DURATION_SEC=60 \
PRODUCT_LOAD_CONCURRENCY=80 \
bash scripts/test-product-service-compare.sh
```

## Required Setup

### Read-Only Shadow Setup

Run both services against the same Mongo database:

```bash
PORT=3003 API_PREFIX=api/v1 npm --workspace services/product-service-nest run start:dev
```

```bash
cd services/product-service
PORT=3013 go run ./cmd/server
```

Compare only `GET` endpoints and public tracking no-op candidates in this mode.

### Write Parity Setup

Create two identical seeded databases:

- `ecommerce_product_nest_shadow`
- `ecommerce_product_go_shadow`

Run Nest against `ecommerce_product_nest_shadow` and Go against `ecommerce_product_go_shadow`.

Use the same:

- JWT signing secret.
- seeded users/tokens.
- product fixtures.
- product video fixtures.
- shop decor fixtures.
- Redis enabled/disabled state per test run.
- Kafka enabled/disabled state per test run.
- OpenSearch enabled/disabled state per test run.

After each write scenario, compare Mongo documents after normalizing volatile fields.

## Normalization Rules

Ignore these response/document differences during compare:

- `meta.timestamp`
- `meta.requestId`, unless a fixed `x-request-id` is supplied.
- generated Mongo `_id` for newly created records.
- generated `videoId` UUID for newly created videos.
- generated `createdAt` and `updatedAt`, compare as valid ISO timestamps and expected ordering only.
- `publishedAt`, `hiddenAt`, `archivedAt`, `moderation.submittedAt`, `moderation.reviewedAt`, `metricsSnapshot.lastAggregatedAt`, compare presence and type unless fixed clock is added.

Do not ignore:

- HTTP status.
- error `code`.
- response envelope shape.
- required nullable fields.
- pagination shape and totals.
- status transitions.
- owner/role authorization behavior.
- persisted business fields.
- Kafka event type, topic, key/header, payload shape.
- Redis cache key namespace and invalidation behavior.

## Test Phases

### Phase A: Static Contract Diff

Check these before runtime tests:

- Route list from Nest controllers equals Go router route list.
- Auth role requirements match.
- Public routes stay public.
- DTO validation behavior is either identical or documented as intentional.
- Response fields match old response fields.
- Mongo collection names match.
- Kafka topic and event payloads match.
- Redis keys and TTL match.
- OpenSearch index shape matches.

Command candidates:

```bash
rg -n "@(Controller|Get|Post|Patch|Delete)\(" services/product-service-nest/src/modules
rg -n "mount.*Routes|\\.Get\\(|\\.Post\\(|\\.Patch\\(|\\.Delete\\(" services/product-service/internal/router
```

### Phase B: Health And Envelope

Run against both services:

- `GET /api/v1/health`
- `GET /api/v1/ready`
- `GET /api/v1/live`
- unknown route
- unsupported method
- invalid JSON body on a protected route
- missing token on protected route
- invalid token on protected route
- forbidden role on protected route

Expected:

- success response envelope: `success`, `data`, `meta.requestId`, `meta.timestamp`.
- paginated response envelope: `success`, `data`, `meta.pagination`.
- error response envelope: `success: false`, `error.code`, `error.message`, `meta`.

### Phase C: Product Read APIs

Compare:

- `GET /api/v1/products`
- `GET /api/v1/products?page=1&pageSize=20`
- `GET /api/v1/products?search=<term>`
- `GET /api/v1/products?categoryId=<id>`
- `GET /api/v1/products?brand=<brand>`
- `GET /api/v1/products?sellerId=<sellerId>`
- `GET /api/v1/products?sortBy=createdAt&sortOrder=DESC`
- `GET /api/v1/products?sortBy=updatedAt&sortOrder=ASC`
- `GET /api/v1/products?sortBy=name&sortOrder=ASC`
- `GET /api/v1/products?sortBy=minPrice&sortOrder=DESC`
- `GET /api/v1/products/{activeProductId}`
- `GET /api/v1/products/{draftOrHiddenProductId}`
- `GET /api/v1/products/{invalidObjectId}`
- `GET /api/v1/products/my` as seller.
- `GET /api/v1/products/my` as admin/moderator/super admin.

Expected:

- Public list only returns `ACTIVE`.
- Public detail hides non-active products as not found.
- Seller managed list is restricted to own seller ID.
- Staff managed list can filter by `sellerId`.
- Pagination totals and item order match.

### Phase D: Product Write APIs

Run each scenario on cloned databases and compare response plus persisted document:

- seller creates draft product without `sellerId`.
- seller create with another `sellerId` is forbidden.
- staff create without `sellerId` errors.
- staff creates product for seller.
- duplicate slug conflicts.
- duplicate SKU in payload conflicts.
- duplicate SKU against DB conflicts.
- update product name regenerates slug if slug omitted.
- update explicit slug.
- update images with object keys and absolute URLs.
- update variants recalculates `minPrice`.
- seller cannot update another seller product.
- seller cannot set non-draft status through `PATCH /products/{id}`.
- staff updates status through `PATCH /products/{id}/status`.
- delete product soft-deletes and sets status archived.

Check side effects:

- OpenSearch `IndexProduct` on create/update/status.
- OpenSearch `DeleteProduct` on delete.
- Kafka `product.created`, `product.updated`, `product.status-changed`, `product.deleted`.

### Phase E: Video Read APIs

Compare:

- `GET /api/v1/videos/feed`
- `GET /api/v1/videos/feed?page=1&pageSize=20`
- `GET /api/v1/videos/feed?productId=<id>`
- `GET /api/v1/videos/feed?sellerId=<sellerId>`
- `GET /api/v1/videos/feed?search=<title>`
- `GET /api/v1/videos/{publishedVideoId}`
- `GET /api/v1/videos/{draftOrHiddenVideoId}`
- `GET /api/v1/videos/me` as seller.
- `GET /api/v1/videos/me` as staff.
- `GET /api/v1/moderation/videos` as moderator/admin/super admin.

Expected:

- Feed returns published videos with `publishedAt != null`.
- Feed sort is `publishedAt DESC`, then `createdAt DESC`.
- Managed list excludes archived videos and sorts `updatedAt DESC`, then `createdAt DESC`.
- Video response fields match including seller, metrics, product tags, media URLs.

### Phase F: Video Workflow Writes

Run on cloned databases:

- seller creates video with active owned products.
- seller cannot create video for another seller.
- staff create video requires `sellerId`.
- duplicate product in video returns validation error.
- attaching nonexistent product returns validation error.
- attaching another seller product is forbidden.
- update title/description/products.
- update with empty product list errors.
- confirm media with `video/mp4`.
- confirm media with `video/webm`.
- confirm media above 50MB errors.
- confirm media invalid object key errors.
- confirm thumbnail.
- submit review before media errors.
- submit review with inactive product errors.
- submit review after ready moves to `review_pending`.
- staff publish ready video.
- seller direct publish is forbidden.
- unpublish published video.
- archive video.
- approve review video.
- reject draft/review video.
- reject published/archived video errors.

Check persisted fields:

- `status`
- `mediaObjectKey`, `mediaUrl`, `mimeType`, `sizeBytes`, `durationSec`
- `thumbnailObjectKey`, `thumbnailUrl`
- `publishedAt`, `hiddenAt`, `archivedAt`
- `moderation.submittedAt`, `moderation.reviewedAt`, `moderation.reviewedBy`, `moderation.rejectionReason`
- `products.*Snapshot`

### Phase G: Video Tracking And Analytics

Compare:

- `POST /api/v1/videos/{videoId}/events/view-started`
- `POST /api/v1/videos/{videoId}/events/view-qualified`
- `POST /api/v1/videos/{videoId}/events/product-clicked`
- `POST /api/v1/videos/{videoId}/events/add-to-cart`
- repeated event with same `clientEventId`
- event on non-published video
- event with invalid event type

Expected:

- Public route, no JWT required.
- Response `{ accepted: true }`.
- Metrics increment once per dedupe key.
- `recentEventKeys` capped to 500.
- Kafka analytics event type maps to:
  - `video.view_started`
  - `video.view_qualified`
  - `video.product_clicked`
  - `video.add_to_cart`
- Kafka message includes `eventKey`.
- Tracking does not invalidate feed cache.

### Phase H: Shop Decor APIs

Compare:

- `GET /api/v1/shops/{sellerId}/decor` with no existing decor.
- `GET /api/v1/shops/{sellerId}/decor` with existing decor.
- `GET /api/v1/shops/me/decor` as seller.
- `PATCH /api/v1/shops/me/decor` as seller.
- `PATCH /api/v1/shops/me/decor` as admin/moderator/support/super admin.
- `PATCH /api/v1/shops/me/decor` as buyer should be forbidden.
- long string fields truncate/sanitize consistently.
- invalid `accentColor` normalizes to `#ee4d2d`.
- `navItems` caps to 8.
- `featuredCategories` caps to 10.

Expected:

- Default decor response matches Nest.
- Seller code generation matches Nest.
- Update stores decor under authenticated `userId`.

### Phase I: Cache Behavior

Run with Redis enabled:

- first feed request writes `product-videos:feed:v1:*`.
- second identical feed request reads cache.
- video create/update/media/thumbnail/submit/publish/unpublish/archive/approve/reject invalidates feed cache.
- tracking event does not invalidate feed cache.
- Redis unavailable does not fail buyer feed.

Expected:

- TTL is 45 seconds.
- key set is `product-videos:feed:v1:keys`.

### Phase J: Load And Soak

Only after parity is green:

- run read load on public products and video feed.
- run mixed seller workflow load on cloned DB.
- run tracking event load with repeated dedupe keys.
- watch Mongo latency, Redis latency, Kafka publish warnings, memory, CPU, goroutine count.

Suggested minimum:

- 10 minutes read-only smoke.
- 30 minutes mixed read/write on clone.
- 60 minutes tracking-event soak.

Local replacement gate result on 2026-05-15:

- Full direct service compare passed on all scenarios.
- Full API Gateway compare passed on all scenarios.
- Kafka verification passed for `product.created`, `product.updated`, `product.status-changed`, `product.deleted`, and `video.view_started`.
- Real search path passed with `SEARCH_ENABLED=true` against OpenSearch 2.13.
- Go API Gateway load check passed for 60 seconds at concurrency 80 with 98,414 requests, 1,635.38 RPS, 0 failures, all status `200`, p95 136.22ms, p99 251.01ms.

## Current Static Review Status

The initial static differences were addressed in Go before runtime shadow testing:

| Area | Status |
| --- | --- |
| API prefix | Resolved: Go router now uses configured `API_PREFIX`. |
| Extra aliases | Resolved: Go no longer mounts extra `/api/*` or root health aliases. |
| Health routes | Resolved: health routes are mounted only under configured global prefix. |
| Query validation | Resolved for product/video query range and enum checks; runtime compare still needs exact error text normalization. |
| Product `sellerId` validation | Resolved: request `sellerId` is UUID-validated when supplied. |
| Product video `sellerId` validation | Resolved: request `sellerId` is UUID-validated when supplied. |
| Tracking route | Resolved: Go exposes the same four explicit tracking routes as Nest. |
| Tracking invalid JSON | Resolved: malformed tracking JSON now returns `400`. Empty body remains accepted like an empty DTO. |
| Timestamp formatting | Resolved: Go response/event timestamps use millisecond ISO format matching `Date.toISOString()`. |

Remaining runtime risks:

| Area | Risk | Required check |
| --- | --- | --- |
| JSON validation | Error message/details can still differ from Nest ValidationPipe. | Compare HTTP status and `error.code`; decide whether exact message parity matters. |
| Long soak | Functional load gate passed, but multi-hour production-like soak has not been run locally. | Run staging soak with production-sized fixtures before 100% traffic cutover. |

## Replacement Readiness Verdict

Static replacement readiness: ready.

Functional replacement readiness: ready for staging canary.

Reasons:

- Go routes, roles, configured API prefix, response envelope, core DTO validation, timestamp format, product/video/shop decor persistence, Redis video feed cache behavior, Kafka event shapes, and search behavior have passed shadow compare against Nest.
- Direct service, API Gateway, Kafka, and real search enabled paths have passed the local full-stack replacement gate.
- API Gateway proxy pooling was tuned after load testing exposed outbound connection churn under high concurrency.
- Canary is still required for production cutover because local Docker cannot prove production network limits, production fixture cardinality, or long-duration soak behavior.

## Exit Criteria

Go can replace Nest only when:

- Phase A through I pass. Current local status: passed through the automated all-scenario compare gate.
- All blocker differences above are fixed or explicitly accepted. Current local status: no known blocker remains.
- Kafka consumers accept Go-produced events. Current local status: shadow Kafka verification passed for core product and analytics events.
- Search documents generated by Go match required consumer fields. Current local status: real search overlay passed with `SEARCH_ENABLED=true`.
- Redis cache behavior does not cause stale buyer feed beyond existing Nest behavior.
- API Gateway route switch is tested in staging with shadow traffic.
- Staging canary has no elevated 4xx/5xx, latency, Mongo, Redis, Kafka, or search error rate before 100% cutover.

## Suggested Next Implementation

Build a small compare runner:

- Input: base URLs, tokens, fixture IDs, scenario file.
- For reads: call Nest and Go, normalize response, deep compare.
- For writes: run same scenario against two cloned DBs, compare response and persisted documents.
- Output: JSON report with endpoint, status parity, body parity, diff path, severity.

Initial command shape:

```bash
PRODUCT_NEST_BASE_URL=http://localhost:3003/api/v1 \
PRODUCT_GO_BASE_URL=http://localhost:3013/api/v1 \
SELLER_TOKEN=... \
ADMIN_TOKEN=... \
node scripts/product-service-shadow-compare.mjs
```
