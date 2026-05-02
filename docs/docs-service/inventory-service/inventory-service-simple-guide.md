# Inventory Service - Simple Guide

Tai lieu nay giai thich ngan gon `inventory-service` trong monorepo de nguoi moi doc lai nhanh.

## 1) Goc service o dau?

Goc cua service la:

`services/inventory-service/`

Moi duong dan ben duoi deu tinh tu thu muc nay.

## 2) Doc tu dau de hieu nhanh?

1. `cmd/server/main.go`
2. `internal/handler/inventory_handler.go`
3. `internal/service/inventory_service.go`
4. `internal/repository/inventory_repository.go`
5. `internal/events/outbox_dispatcher.go`

Chỉ cần nắm 5 file này là hiểu phần lớn luồng hoạt động.

## 3) Thu muc/file dung de lam gi?

### Khởi động và wiring

- `cmd/server/main.go`: khởi động service, gắn middleware, router.
- `internal/config/`: load env cho app/db/kafka.

### Cấu hình

- `internal/config/config.go`: map biến môi trường thành struct.
- Validate env khi khởi động.

### Common (dùng chung)

- `internal/middleware/`: middleware HTTP (`x-request-id`, logging, JWT auth, RBAC).
- `internal/httpx/`: helper trả response chuẩn và xử lý lỗi JSON.

### Inventory module (nghiệp vụ chính)

- `internal/handler/`: định nghĩa REST API inventory (`chi` router).
- `internal/service/`: logic chính validate stock, adjust, reserve, release, confirm, expire.
- `internal/events/`: publish Kafka event, `outbox_dispatcher` và `inventory_events_consumer` (ví dụ cho `order.cancelled`).
- `internal/service/reservation_expirer.go`: job nền tự động expire ACTIVE reservations.

### Entity + Repository

- `internal/domain/`: các entity như `inventory_item`, `inventory_reservation`, `inventory_movement`, `outbox_event`.
- `internal/repository/`: thao tác DB theo từng bảng.

### Health module

- `internal/handler/health.go`: `/health`, `/ready`, `/live`.

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

1. Request vào API `/api/v1/*` hoặc route compatibility `/api/*`.
2. Middleware gắn `x-request-id`, kiểm tra JWT token, và kiểm tra role.
3. Handler nhận request và gọi method tương ứng trong `service`.
4. Service validate nghiệp vụ và gọi `repository`.
5. Với write API, service chạy transaction (`pgx`) để cập nhật stock/reservation/movement/outbox cùng lúc.
6. Handler dùng `httpx` trả response chuẩn hoặc trả lỗi JSON.

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

1. `cmd/server/main.go`
2. `internal/handler/inventory_handler.go`
3. `internal/service/inventory_service.go`
4. `internal/repository/`
5. `internal/domain/`
6. `internal/service/reservation_expirer.go`
7. `internal/events/inventory_events_consumer.go`
8. `internal/events/outbox_dispatcher.go`
9. `migrations/0001_init_inventory_service.sql`
10. `scripts/test-inventory-service.sh` (ở root repo)
