# Cart Service - Simple Guide

Tai lieu nay giai thich ngan gon `cart-service` trong monorepo de de onboard va maintain.

## 1) Goc service o dau?

Goc cua service la:

`services/cart-service/`

Moi duong dan ben duoi deu tinh tu thu muc nay.

## 2) Doc tu dau de hieu nhanh?

1. `src/main.ts`
2. `src/app.module.ts`
3. `src/modules/cart/controllers/cart.controller.ts`
4. `src/modules/cart/services/cart.service.ts`
5. `src/modules/cart/repositories/cart-cache.repository.ts`
6. `src/modules/cart/repositories/cart-persistence.repository.ts`
7. `src/modules/cart/services/cart-events-publisher.service.ts`

Chi can nam 7 file nay la hieu phan lon luong nghiep vu.

## 3) Thu muc/file dung de lam gi?

### Khoi dong va wiring

- `src/main.ts`: khoi dong NestJS, gan middleware/filter/interceptor/validation global.
- `src/app.module.ts`: noi config, redis, postgres(optional), global guards, `HealthModule`, `CartModule`.

### Cau hinh

- `src/config/configuration.ts`: map bien moi truong thanh object config cho app/redis/cart/db/jwt/kafka/dependencies.
- `src/config/env.validation.ts`: validate env bang Joi, thieu env quan trong se fail startup.

### Common (dung chung)

- `src/common/middlewares/request-id.middleware.ts`: tao/gan `x-request-id`.
- `src/common/interceptors/logging.interceptor.ts`: log request co cau truc.
- `src/common/interceptors/response.interceptor.ts`: boc response chuan `success/data/meta`.
- `src/common/filters/http-exception.filter.ts`: chuan hoa error envelope.
- `src/common/guards/jwt-auth.guard.ts`: verify access token.
- `src/common/guards/roles.guard.ts`: check role voi `@Roles(...)`.
- `src/common/decorators/public.decorator.ts`: danh dau route public.
- `src/common/decorators/current-user.decorator.ts`: lay user context tu request.

### Cart module (nghiep vu chinh)

- `src/modules/cart/controllers/cart.controller.ts`: dinh nghia REST API cart.
- `src/modules/cart/services/cart.service.ts`: logic chinh get/add/update/remove/clear/validate cart.
- `src/modules/cart/repositories/cart-cache.repository.ts`: repository Redis, luu key `cart:{userId}`.
- `src/modules/cart/repositories/cart-persistence.repository.ts`: persistence Postgres optional (`CART_PERSISTENCE_ENABLED=true`).
- `src/modules/cart/services/cart-validation-client.service.ts`: check external voi product/inventory service (optional).
- `src/modules/cart/services/cart-events-publisher.service.ts`: publish Kafka best-effort.
- `src/modules/cart/entities/cart.types.ts`: model `CartSnapshot`, `CartItem`, `CartValidationIssue`.
- `src/modules/cart/entities/cart-record.entity.ts`, `cart-item-record.entity.ts`: TypeORM entities cho persistence.

### Health module

- `src/modules/health/controllers/health.controller.ts`: `/api/v1/health`, `/api/v1/ready`, `/api/v1/live` va tuong duong `/api/*`.
- `src/modules/health/services/health.service.ts`: check redis + postgres(optional).

### Migration

- `migrations/0001_init_cart_service.sql`: tao bang `carts`, `cart_items`, indexes co ban.

### Test + Docker

- `test/app.e2e-spec.ts`: e2e test luong chinh (health, auth fail, validation fail, CRUD, conflict, forbidden).
- `docker-compose.dev.yml`: stack local `cart-service + redis + postgres`.

## 4) Luong request tong quat

1. Request vao API `/api/v1/cart*` hoac `/api/cart*`.
2. `request-id.middleware` gan `x-request-id`.
3. `jwt-auth.guard` kiem tra bearer token.
4. `roles.guard` chi cho role `BUYER` thao tac cart.
5. Controller goi `cart.service.ts`.
6. Service load cart tu Redis; neu miss thi fallback Postgres (neu persistence bat), neu van miss thi tao cart rong.
7. Service merge/update/remove item, recalculate totals, tang version.
8. Service persist write-through vao Redis va Postgres (neu bat persistence).
9. Service publish Kafka event theo best-effort (khong rollback business khi publish fail).
10. `response.interceptor` tra envelope thanh cong; loi di qua `http-exception.filter`.

## 5) Business rules quan trong

- Cart ownership theo `userId` trong JWT.
- Chi role `BUYER` duoc thao tac cart.
- Merge item theo key: `productId + variantId + sellerId`.
- `quantity` phai > 0.
- Khi update item ma `quantity = 0` thi item bi remove.
- Gioi han so luong/item qua `CART_MAX_QTY_PER_ITEM`.
- Optimistic concurrency qua `expectedVersion`.
- Recalculate `lineTotal`, `subtotal`, `discountTotal`, `grandTotal` sau moi write.
- Moi write deu refresh `expiresAt` theo `CART_TTL_SECONDS`.

## 6) API chinh

Service ho tro ca 2 route set:

- versioned: `/api/v1/*`
- gateway-compatible: `/api/*`

### Health

- `GET /api/v1/health` va `GET /api/health` (public)
- `GET /api/v1/ready` va `GET /api/ready` (public)
- `GET /api/v1/live` va `GET /api/live` (public)

### Cart

- `GET /api/v1/cart` va `GET /api/cart` (`BUYER`)
- `POST /api/v1/cart/items` va `POST /api/cart/items` (`BUYER`)
- `PATCH /api/v1/cart/items/:itemId` va `PATCH /api/cart/items/:itemId` (`BUYER`)
- `DELETE /api/v1/cart/items/:itemId` va `DELETE /api/cart/items/:itemId` (`BUYER`)
- `DELETE /api/v1/cart` va `DELETE /api/cart` (`BUYER`)
- `POST /api/v1/cart/validate` va `POST /api/cart/validate` (`BUYER`)

## 7) Data model va storage

### Redis (primary)

- Key: `cart:{userId}`
- Value: JSON cua `CartSnapshot`
- TTL: `CART_TTL_SECONDS` (sliding expiration)

### PostgreSQL (optional)

- Bat khi `CART_PERSISTENCE_ENABLED=true`.
- Bang `carts`: thong tin tong quan cart + totals + version.
- Bang `cart_items`: danh sach item chi tiet.
- Moi lan save: update cart record + replace danh sach item trong transaction.

## 8) Event map (Kafka best-effort)

- Topic mac dinh: `cart.events` (env: `CART_EVENTS_TOPIC`)
- Event types:
- `cart.item-added`
- `cart.item-updated`
- `cart.item-removed`
- `cart.cleared`

Payload event co metadata:

- `requestId`
- `occurredAt`
- `actorId`
- `actorRole`

## 9) Chay nhanh local

Tu root repo:

- Dev: `npm run dev --workspace services/cart-service`
- Build: `npm run build --workspace services/cart-service`
- Test: `npm run test --workspace services/cart-service`
- Docker up: `docker compose -f services/cart-service/docker-compose.dev.yml up -d --build`
- Smoke test: `bash scripts/test-cart-service.sh`

## 10) File nen doc theo thu tu

1. `src/main.ts`
2. `src/app.module.ts`
3. `src/modules/cart/controllers/cart.controller.ts`
4. `src/modules/cart/services/cart.service.ts`
5. `src/modules/cart/repositories/cart-cache.repository.ts`
6. `src/modules/cart/repositories/cart-persistence.repository.ts`
7. `src/modules/cart/services/cart-validation-client.service.ts`
8. `src/modules/cart/services/cart-events-publisher.service.ts`
9. `src/modules/cart/entities/cart.types.ts`
10. `test/app.e2e-spec.ts`
