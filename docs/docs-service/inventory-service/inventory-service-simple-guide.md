# Inventory Service - Simple Guide

Tai lieu nay giai thich ngan gon `inventory-service` trong monorepo de nguoi moi doc lai nhanh.

## 1) Goc service o dau?

Goc cua service la:

`services/inventory-service/`

Moi duong dan ben duoi deu tinh tu thu muc nay.

## 2) Doc tu dau de hieu nhanh?

1. `src/main.ts`
2. `src/app.module.ts`
3. `src/modules/inventory/controllers/inventory.controller.ts`
4. `src/modules/inventory/services/inventory.service.ts`
5. `src/modules/inventory/services/outbox-dispatcher.service.ts`

Chi can nam 5 file nay la hieu phan lon luong hoat dong.

## 3) Thu muc/file dung de lam gi?

### Khoi dong va wiring

- `src/main.ts`: khoi dong NestJS, gan middleware/filter/interceptor/validation global.
- `src/app.module.ts`: noi config, Postgres, guards global, `HealthModule`, `InventoryModule`.

### Cau hinh

- `src/config/configuration.ts`: map bien moi truong thanh object config.
- `src/config/env.validation.ts`: validate env bang Joi, thieu env se fail startup.

### Common (dung chung)

- `src/common/middlewares/request-id.middleware.ts`: tao/gan `x-request-id`.
- `src/common/interceptors/logging.interceptor.ts`: log request co cau truc.
- `src/common/interceptors/response.interceptor.ts`: boc response chuan `success/data/meta`.
- `src/common/filters/http-exception.filter.ts`: chuan hoa loi JSON.
- `src/common/guards/jwt-auth.guard.ts`: kiem tra bearer token va JWT payload.
- `src/common/guards/roles.guard.ts`: kiem tra role voi `@Roles(...)`.
- `src/common/decorators/current-user.decorator.ts`: lay user tu request context.
- `src/common/decorators/public.decorator.ts`: danh dau route public.
- `src/common/decorators/roles.decorator.ts`: khai bao role endpoint.

### Inventory module (nghiep vu chinh)

- `src/modules/inventory/inventory.module.ts`: gom controller, services, repositories, entities.
- `src/modules/inventory/controllers/inventory.controller.ts`: dinh nghia REST API inventory.
- `src/modules/inventory/services/inventory.service.ts`: logic chinh validate stock, adjust, reserve, release, confirm, expire.
- `src/modules/inventory/services/events-publisher.service.ts`: publish Kafka event.
- `src/modules/inventory/services/outbox-dispatcher.service.ts`: doc `outbox_events` va publish theo retry/backoff.
- `src/modules/inventory/services/reservation-expirer.service.ts`: job nen tu dong expire ACTIVE reservations.
- `src/modules/inventory/services/inventory-events-consumer.service.ts`: consumer skeleton cho `order.cancelled`.

### Entity + Repository

- `src/modules/inventory/entities/inventory-item.entity.ts`: bang ton kho theo SKU.
- `src/modules/inventory/entities/inventory-reservation.entity.ts`: bang giu hang theo order.
- `src/modules/inventory/entities/inventory-movement.entity.ts`: bang audit trail cho moi bien dong stock.
- `src/modules/inventory/entities/outbox-event.entity.ts`: bang outbox de publish event an toan.
- `src/modules/inventory/repositories/*.repository.ts`: thao tac DB theo tung bang.

### Health module

- `src/modules/health/controllers/health.controller.ts`: `/health`, `/ready`, `/live`.
- `src/modules/health/services/health.service.ts`: check service va Postgres.

### Migration

- `migrations/0001_init_inventory_service.sql`: tao schema ban dau cho inventory.

## 4) Model du lieu chinh

### inventory_items

- 1 dong = 1 SKU.
- Truong quan trong: `sku`, `product_id`, `seller_id`, `on_hand`, `reserved`, `version`.
- Cong thuc co ban: `available = on_hand - reserved`.

### inventory_reservations

- Luu reservation theo `order_id + sku`.
- Trang thai: `ACTIVE`, `RELEASED`, `CONFIRMED`, `EXPIRED`.
- `expires_at` dung cho TTL.

### inventory_movements

- Audit trail cho moi thao tac `ADJUST`, `RESERVE`, `RELEASE`, `CONFIRM`, `EXPIRE`.
- Giu lai `actor_id`, `actor_role`, `request_id`, delta tang/giam.

### outbox_events

- Business transaction chi ghi event vao day.
- Job dispatcher doc bang nay de publish Kafka sau.

## 5) Luong request tong quat

1. Request vao API `/api/v1/*` hoac route compatibility `/api/*`.
2. `request-id.middleware` gan `x-request-id`.
3. `jwt-auth.guard` kiem tra token neu route khong public.
4. `roles.guard` kiem tra role endpoint.
5. Controller goi `inventory.service.ts`.
6. Service validate nghiep vu va goi repositories.
7. Voi write API, service chay transaction de cap nhat stock/reservation/movement/outbox cung luc.
8. `response.interceptor` tra response chuan.
9. Neu co loi, `http-exception.filter` tra loi chuan.

## 6) Nghiep vu chinh

### Validate stock

- API: `GET /api/v1/inventory/validate?sku=...&quantity=...`
- Route nay la public de `cart-service` goi truc tiep.
- Neu thieu stock van tra HTTP `200`.
- Body tra ve co `sku`, `requestedQuantity`, `availableQuantity`, `isAvailable`.

Muc tieu la giu compatibility voi `cart-service`, vi service do dang chi check `response.ok`.

### Adjust stock

- API: `PATCH /api/v1/inventory/stocks/:sku/adjust`
- Role duoc phep: `SELLER | WAREHOUSE | ADMIN | SUPER_ADMIN`
- Dung de tao stock moi neu SKU chua ton tai, tang/giam `on_hand`, update `productId` va `sellerId`, va check optimistic version qua `expectedVersion`.

Rule:
- khong duoc de `on_hand < 0`
- khong duoc de `available < 0`
- neu tao SKU moi thi phai co `productId` va `sellerId`

### Reserve inventory

- API: `POST /api/v1/inventory/reservations`
- Role duoc phep: `ADMIN | WAREHOUSE | SUPER_ADMIN`
- Service lock theo SKU trong transaction de tranh over-reserve.
- Neu cung `orderId` va cung payload da ton tai reservation ACTIVE, service tra lai ket qua cu (`idempotent: true`).
- Neu cung `orderId` nhung payload khac, tra `INVENTORY_RESERVATION_CONFLICT`.

### Release / Confirm reservation

- `POST /api/v1/inventory/reservations/:orderId/release`
- `POST /api/v1/inventory/reservations/:orderId/confirm`

Rule:
- `RELEASE`: giam `reserved`, giu nguyen `on_hand`
- `CONFIRM`: giam `reserved` va giam `on_hand`
- neu order khong con reservation ACTIVE, tra `INVENTORY_RESERVATION_NOT_FOUND`

### Auto expire reservation

- `reservation-expirer.service.ts` chay nen theo interval.
- Tim reservation ACTIVE da qua `expires_at`.
- Chuyen sang `EXPIRED`, giam `reserved`, ghi movement, ghi outbox event.

## 7) Danh sach API chinh

Base prefix duoc expose theo 2 kieu:

- `/api/v1`
- `/api`

### Health

- `GET /api/v1/health`, `GET /api/health` (public)
- `GET /api/v1/ready`, `GET /api/ready` (public)
- `GET /api/v1/live`, `GET /api/live` (public)

### Inventory

- `GET /api/v1/inventory/validate` (public)
- `GET /api/inventory/validate` (public, compatibility)
- `GET /api/v1/inventory/stocks/:sku`
- `PATCH /api/v1/inventory/stocks/:sku/adjust`
- `POST /api/v1/inventory/reservations`
- `POST /api/v1/inventory/reservations/:orderId/release`
- `POST /api/v1/inventory/reservations/:orderId/confirm`

## 8) Event va Kafka

- Business transaction khong publish Kafka truc tiep.
- Service chi ghi vao `outbox_events`.
- `outbox-dispatcher.service.ts` chay nen:
1. lay event `PENDING/FAILED` den han retry
2. publish Kafka qua `events-publisher.service.ts`
3. danh dau `PUBLISHED` hoac `FAILED` va tang retry

Event chinh:

- `inventory.adjusted`
- `inventory.reserved`
- `inventory.released`
- `inventory.confirmed`
- `inventory.expired`

Consumer hien tai:

- `inventory-events-consumer.service.ts` lang nghe topic `inventory.events`
- xu ly skeleton cho `order.cancelled`
- neu event khong co `orderId` hoac khong co `items`, service log warning va bo qua an toan

## 9) Cac rule nghiep vu can nho

- `available = on_hand - reserved`
- khong bao gio cho phep `available < 0`
- reservation TTL mac dinh la 10 phut, config bang env
- reserve/release/confirm phai transaction-safe
- validate endpoint chi tra `4xx` khi input sai, khong tra `4xx` cho case thieu stock
- movement va outbox phai di cung business transaction

## 10) Chay local va test

Tu `services/inventory-service/`:

1. `npm run docker:up`
2. `npm run docker:migrate`
3. `npm run docker:logs`
4. `npm run docker:test`

Hoac tu root repo:

- `scripts/test-inventory-service.sh`

Script smoke test hien tai cover:

- health/ready/live
- public validate
- auth va permission
- adjust stock
- version conflict
- reserve/replay/conflict
- confirm
- release
- not-found cases

## 11) File nen doc theo thu tu

1. `src/main.ts`
2. `src/app.module.ts`
3. `src/modules/inventory/controllers/inventory.controller.ts`
4. `src/modules/inventory/services/inventory.service.ts`
5. `src/modules/inventory/repositories/`
6. `src/modules/inventory/entities/`
7. `src/modules/inventory/services/reservation-expirer.service.ts`
8. `src/modules/inventory/services/inventory-events-consumer.service.ts`
9. `src/modules/inventory/services/outbox-dispatcher.service.ts`
10. `migrations/0001_init_inventory_service.sql`
11. `test/app.e2e.spec.ts`
12. `scripts/test-inventory-service.sh` (o root repo)
