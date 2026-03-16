# Cart Service - Simple Guide

Tai lieu nay giai thich nhanh `cart-service` trong monorepo.

## 1) Goc service o dau?

`services/cart-service/`

## 2) Doc file nao de hieu nhanh?

1. `src/main.ts`
2. `src/app.module.ts`
3. `src/modules/cart/controllers/cart.controller.ts`
4. `src/modules/cart/services/cart.service.ts`
5. `src/modules/cart/repositories/*`

## 3) Cau truc chinh

### Khoi dong va wiring

- `src/main.ts`: setup validation, filter, interceptor, middleware.
- `src/app.module.ts`: wiring config, guards, health, cart, postgres optional.

### Common

- `src/common/guards/jwt-auth.guard.ts`: verify JWT HS256.
- `src/common/guards/roles.guard.ts`: role check.
- `src/common/filters/http-exception.filter.ts`: error envelope.
- `src/common/interceptors/response.interceptor.ts`: success envelope.
- `src/common/middlewares/request-id.middleware.ts`: `x-request-id`.

### Cart module

- `controllers/cart.controller.ts`: API cart.
- `services/cart.service.ts`: business logic cart.
- `repositories/cart-cache.repository.ts`: Redis repository.
- `repositories/cart-persistence.repository.ts`: Postgres optional repository.
- `services/cart-validation-client.service.ts`: call product/inventory validation (optional).
- `services/cart-events-publisher.service.ts`: Kafka best-effort publisher.
- `entities/cart.types.ts`: domain model Cart + CartItem.

### Health module

- `modules/health/controllers/health.controller.ts`: `/api/health`, `/api/v1/health`.
- `modules/health/services/health.service.ts`: check redis + postgres(optional).

## 4) Luong request cart

1. Request vao `/api/cart*` hoac `/api/v1/cart*`.
2. Middleware gan `x-request-id`.
3. JWT guard verify access token.
4. Roles guard chi cho `BUYER` thao tac cart.
5. Service load cart tu Redis, fallback Postgres neu bat persistence.
6. Service apply merge/update/remove item, recalc totals, bump version.
7. Save write-through Redis + Postgres(optional).
8. Publish event Kafka best-effort.
9. Response tra theo envelope chuan.

## 5) Business rules quan trong

- Cart ownership theo `userId` trong JWT.
- Merge item theo key: `productId + variantId + sellerId`.
- `quantity > 0`, update `quantity = 0` se remove item.
- Gioi han max quantity/item qua env `CART_MAX_QTY_PER_ITEM`.
- Totals (`subtotal`, `grandTotal`) recalc sau moi write.
- TTL cart refresh sau moi write.

## 6) API chinh

- `GET /api/v1/cart` va `GET /api/cart`
- `POST /api/v1/cart/items` va `POST /api/cart/items`
- `PATCH /api/v1/cart/items/:itemId` va `PATCH /api/cart/items/:itemId`
- `DELETE /api/v1/cart/items/:itemId` va `DELETE /api/cart/items/:itemId`
- `DELETE /api/v1/cart` va `DELETE /api/cart`
- `POST /api/v1/cart/validate` va `POST /api/cart/validate`
- `GET /api/v1/health` va `GET /api/health`

## 7) Test va Docker

- E2E: `npm run test:e2e --workspace services/cart-service`
- Build: `npm run build --workspace services/cart-service`
- Docker stack: `docker compose -f services/cart-service/docker-compose.dev.yml up -d --build`
- Smoke test: `bash scripts/test-cart-service.sh`
