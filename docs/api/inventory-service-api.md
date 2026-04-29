# Inventory Service API

## Tổng quan

- Service: `services/inventory-service`
- Không dùng global prefix; controller tự khai báo alias:
  - `/api/v1/inventory`
  - `/api/inventory`

## Health

| Method | Path |
|---|---|
| GET | `/api/v1/health` hoặc `/api/health` |
| GET | `/api/v1/ready` hoặc `/api/ready` |
| GET | `/api/v1/live` hoặc `/api/live` |

## Inventory endpoints

| Method | Path | Auth | Chức năng |
|---|---|---|---|
| GET | `/api/v1/inventory/validate` | Public | Kiểm tra nhanh tồn kho theo SKU + quantity |
| GET | `/api/v1/inventory/stocks/:sku` | Roles(`SELLER`,`WAREHOUSE`,`ADMIN`,`SUPER_ADMIN`) | Chi tiết tồn kho theo SKU |
| PATCH | `/api/v1/inventory/stocks/:sku/adjust` | Roles(`SELLER`,`WAREHOUSE`,`ADMIN`,`SUPER_ADMIN`) | Điều chỉnh tồn kho |
| POST | `/api/v1/inventory/reservations` | Roles(`ADMIN`,`WAREHOUSE`,`SUPER_ADMIN`) | Reserve tồn kho cho order |
| POST | `/api/v1/inventory/reservations/:orderId/release` | Roles(`ADMIN`,`WAREHOUSE`,`SUPER_ADMIN`) | Release reservation |
| POST | `/api/v1/inventory/reservations/:orderId/confirm` | Roles(`ADMIN`,`WAREHOUSE`,`SUPER_ADMIN`) | Confirm reservation |

`/api/...` là alias tương đương cho mọi endpoint ở trên.

## DTO chính

### `ValidateInventoryDto` (query)

- `sku` (required, tự upper-case)
- `quantity` (required, int >= 1)

### `AdjustStockDto`

- `deltaOnHand` (required, int)
- `productId` (optional UUID)
- `sellerId` (optional UUID)
- `reason` (optional, max 500)
- `expectedVersion` (optional int)

### `ReserveInventoryDto`

- `orderId` (required UUID)
- `items` (required, 1..100 items)
  - `sku` (required, upper-case)
  - `quantity` (required, int >= 1)
- `ttlMinutes` (optional, 1..1440)
- `reason` (optional, max 500)

### `ReservationActionDto`

- `reason` (optional, max 500)

## Reservation status enum

`ACTIVE | RELEASED | CONFIRMED | EXPIRED`

## Error code nổi bật

- `INVENTORY_SKU_NOT_FOUND`
- `INVENTORY_INSUFFICIENT_STOCK`
- `INVENTORY_RESERVATION_NOT_FOUND`
- `INVENTORY_RESERVATION_CONFLICT`
- `INVENTORY_NEGATIVE_STOCK`
