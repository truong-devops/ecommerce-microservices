# Shipping Service API

## Tổng quan

- Service: `services/shipping-service`
- Prefix mặc định: `/api/v1`
- Base path: `/api/v1/shipments`

## Health

| Method | Path |
|---|---|
| GET | `/api/v1/health` |
| GET | `/api/v1/ready` |
| GET | `/api/v1/live` |

## Shipping endpoints

| Method | Path | Auth | Chức năng |
|---|---|---|---|
| POST | `/api/v1/shipments` | Roles(`ADMIN`,`SUPPORT`,`WAREHOUSE`,`SELLER`,`SUPER_ADMIN`) | Tạo shipment |
| GET | `/api/v1/shipments` | Roles(`CUSTOMER`,`ADMIN`,`SUPPORT`,`WAREHOUSE`,`SELLER`,`SUPER_ADMIN`) | Danh sách shipment |
| GET | `/api/v1/shipments/order/:orderId` | Roles(`CUSTOMER`,`ADMIN`,`SUPPORT`,`WAREHOUSE`,`SELLER`,`SUPER_ADMIN`) | Lấy shipment theo order |
| GET | `/api/v1/shipments/:id` | Roles(`CUSTOMER`,`ADMIN`,`SUPPORT`,`WAREHOUSE`,`SELLER`,`SUPER_ADMIN`) | Chi tiết shipment |
| PATCH | `/api/v1/shipments/:id/status` | Roles(`ADMIN`,`SUPPORT`,`WAREHOUSE`,`SELLER`,`SUPER_ADMIN`) | Cập nhật trạng thái shipment |
| POST | `/api/v1/shipments/:id/tracking-events` | Roles(`ADMIN`,`SUPPORT`,`WAREHOUSE`,`SELLER`,`SUPER_ADMIN`) | Thêm tracking event |
| GET | `/api/v1/shipments/:id/tracking-events` | Roles(`CUSTOMER`,`ADMIN`,`SUPPORT`,`WAREHOUSE`,`SELLER`,`SUPER_ADMIN`) | Lịch sử tracking |
| POST | `/api/v1/shipments/webhooks/:provider` | Public | Webhook từ hãng vận chuyển |

## DTO chính

### `CreateShipmentDto`

- `orderId`, `buyerId`, `sellerId` (UUID, required)
- `provider` (required, 1..64)
- `currency` (required, `^[A-Z]{3}$`)
- `shippingFee`, `codAmount` (optional number >=0)
- `recipientName` (required)
- `recipientPhone` (required)
- `recipientAddress` (required)
- `awb`, `trackingNumber`, `note` (optional)
- `metadata` (optional object)

### `ListShipmentsDto` (query)

- `page`, `pageSize` (max 100)
- `status` (`ShipmentStatus`)
- `provider`
- `orderId`, `buyerId`, `sellerId` (UUID)
- `search`
- `sortBy`: `createdAt | shippingFee | status`
- `sortOrder`: `ASC | DESC`

### `UpdateShipmentStatusDto`

- `status` (required):
  - `PENDING | AWB_CREATED | PICKED_UP | IN_TRANSIT | OUT_FOR_DELIVERY | DELIVERED | CANCELLED | FAILED | RETURNED`
- `reason` (optional, max 500)

### `CreateTrackingEventDto`

- `status` (`ShipmentStatus`, required)
- `eventCode`, `description`, `location` (optional)
- `occurredAt` (optional ISO8601)
- `rawPayload` (optional object)

### `ShippingWebhookDto`

- `providerEventId` (required)
- `orderId` (optional UUID)
- `awb`, `trackingNumber` (optional)
- `status` (`ShipmentStatus`, required)
- `occurredAt`, `eventCode`, `description`, `location` (optional)
- `rawPayload` (optional)

## Error code nổi bật

- `INVALID_SHIPMENT_STATUS_TRANSITION`
- `WEBHOOK_IDEMPOTENCY_CONFLICT`
