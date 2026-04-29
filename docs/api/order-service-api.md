# Order Service API

## Tổng quan

- Service: `services/order-service`
- Prefix mặc định: `/api/v1`
- Base path: `/api/v1/orders`
- Hỗ trợ idempotency qua header `Idempotency-Key` khi tạo order.

## Health

| Method | Path |
|---|---|
| GET | `/api/v1/health` |
| GET | `/api/v1/ready` |
| GET | `/api/v1/live` |

## Order endpoints

| Method | Path | Auth | Chức năng |
|---|---|---|---|
| POST | `/api/v1/orders` | Roles(`CUSTOMER`) | Tạo đơn hàng |
| GET | `/api/v1/orders` | Roles(`CUSTOMER`,`ADMIN`,`SUPPORT`,`WAREHOUSE`,`SELLER`,`SUPER_ADMIN`) | Danh sách đơn hàng |
| GET | `/api/v1/orders/:id` | Roles(`CUSTOMER`,`ADMIN`,`SUPPORT`,`WAREHOUSE`,`SELLER`,`SUPER_ADMIN`) | Chi tiết đơn hàng |
| PATCH | `/api/v1/orders/:id/cancel` | Roles(`CUSTOMER`,`ADMIN`,`SUPPORT`,`WAREHOUSE`,`SELLER`,`SUPER_ADMIN`) | Hủy đơn |
| PATCH | `/api/v1/orders/:id/confirm-received` | Roles(`CUSTOMER`) | Xác nhận đã nhận hàng |
| PATCH | `/api/v1/orders/:id/status` | Roles(`ADMIN`,`SUPPORT`,`WAREHOUSE`,`SELLER`,`SUPER_ADMIN`) | Cập nhật trạng thái đơn |
| GET | `/api/v1/orders/:id/history` | Roles(`CUSTOMER`,`ADMIN`,`SUPPORT`,`WAREHOUSE`,`SELLER`,`SUPER_ADMIN`) | Lịch sử đổi trạng thái |

## DTO chính

### `CreateOrderDto`

- `currency` (required, `^[A-Z]{3}$`)
- `shippingAmount` (optional, >= 0)
- `discountAmount` (optional, >= 0)
- `note` (optional, max 500)
- `items` (required, min 1)
  - `productId` (6..128, regex id)
  - `sku` (1..64)
  - `productName` (1..255)
  - `quantity` (>= 1)
  - `unitPrice` (>= 0)

### `ListOrdersDto` (query)

- `page`, `pageSize` (max 100)
- `status`: `PENDING | CONFIRMED | PROCESSING | SHIPPED | DELIVERED | CANCELLED | FAILED`
- `sortBy`: `createdAt | totalAmount | orderNumber`
- `sortOrder`: `ASC | DESC`
- `userId` (UUID, optional)
- `search` (optional)

### `CancelOrderDto`

- `reason` (optional, max 500)

### `UpdateOrderStatusDto`

- `status` (required): `PENDING | CONFIRMED | PROCESSING | SHIPPED | DELIVERED | CANCELLED | FAILED`
- `reason` (optional, max 500)

## Business notes

- Trạng thái hợp lệ được kiểm soát bằng transition map nội bộ (`ORDER_STATUS_TRANSITIONS`).
- Tạo order có sử dụng `idempotency-key` để tránh tạo trùng.

## Error code nổi bật

- `INVALID_ORDER_STATUS_TRANSITION`
- `IDEMPOTENCY_CONFLICT`
