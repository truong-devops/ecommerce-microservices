# Cart Service - Simple Guide

Tai lieu nay giai thich ngan gon `cart-service` trong monorepo de de onboard va maintain.

## 1) Goc service o dau?

Goc cua service la:

`services/cart-service/`

Moi duong dan ben duoi deu tinh tu thu muc nay.

## 2) Doc tu dau de hieu nhanh?

1. `cmd/server/main.go`
2. `internal/handler/cart_handler.go`
3. `internal/service/cart_service.go`
4. `internal/repository/cart_cache_repository.go`
5. `internal/repository/cart_persistence_repository.go`
6. `internal/events/cart_events_publisher.go`

Chỉ cần nắm 6 file này là hiểu phần lớn luồng nghiệp vụ.

## 3) Thu muc/file dung de lam gi?

### Khởi động và wiring

- `cmd/server/main.go`: khởi động service, gắn middleware.
- `internal/config/`: map biến môi trường thành object config cho app/redis/cart/db/jwt/kafka.
- Validate env khi khởi động.

### Common (dùng chung)

- `internal/middleware/`: middleware HTTP (`x-request-id`, logging, JWT auth, RBAC).
- `internal/httpx/`: helper trả response chuẩn và xử lý lỗi JSON.

### Cart module (nghiệp vụ chính)

- `internal/handler/`: định nghĩa REST API cart (`chi` router).
- `internal/service/`: logic chính get/add/update/remove/clear/validate cart.
- `internal/repository/`: repository Redis (`cart_cache_repository.go`) và Postgres (`cart_persistence_repository.go`).
- `internal/events/`: publish Kafka best-effort.
- `internal/domain/`: model `CartSnapshot`, `CartItem`, các entity database.

### Health module

- `internal/handler/health.go`: `/api/v1/health`, `/api/v1/ready`, `/api/v1/live`.

### Migration

- `migrations/0001_init_cart_service.sql`: tao bang `carts`, `cart_items`, indexes co ban.

### Test + Docker

- `scripts/test-cart-service.sh` (ở root repo): smoke test luồng chính (health, auth fail, validation fail, CRUD, conflict, forbidden).
- `docker-compose.dev.yml`: stack local `cart-service + redis + postgres`.

## 4) Luong request tong quat

1. Request vào API `/api/v1/cart*` hoặc `/api/cart*`.
2. Middleware gắn `x-request-id`, kiểm tra JWT token, và kiểm tra role `BUYER`.
3. Handler nhận request và gọi method tương ứng trong `service`.
4. Service load cart từ Redis; nếu miss thì fallback Postgres, nếu vẫn miss thì tạo cart rỗng.
5. Service merge/update/remove item, recalculate totals, tăng version.
6. Service persist write-through vào Redis và Postgres (nếu bật persistence).
7. Service publish Kafka event theo best-effort (không rollback business khi publish fail).
8. Handler dùng `httpx` trả envelope thành công hoặc lỗi.

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

1. `cmd/server/main.go`
2. `internal/handler/cart_handler.go`
3. `internal/service/cart_service.go`
4. `internal/repository/cart_cache_repository.go`
5. `internal/repository/cart_persistence_repository.go`
6. `internal/events/cart_events_publisher.go`
7. `internal/domain/cart.go`
8. `scripts/test-cart-service.sh`
